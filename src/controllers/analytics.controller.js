import prisma from '../config/db.js';

export const getAnalyticsSummary = async (req, res) => {
    try {
        const userId = req.user.userId;

        // 1. Total Portfolio Value (Assets)
        const assetsAggregate = await prisma.asset.aggregate({
            where: { userId },
            _sum: { value: true }
        });
        const totalPortfolioValue = assetsAggregate._sum.value || 0;

        // 2. Total Income and Expenses
        const txAggregate = await prisma.transaction.groupBy({
            by: ['type'],
            where: { userId },
            _sum: { amount: true }
        });

        let totalIncome = 0;
        let totalExpense = 0;

        txAggregate.forEach(group => {
            if (group.type === 'INCOME') totalIncome = group._sum.amount || 0;
            if (group.type === 'EXPENSE') totalExpense = group._sum.amount || 0;
        });

        const balance = totalIncome - totalExpense;

        // 3. Expenses By Category (All Time, Monthly, Yearly)
        const monthQuery = req.query.month; // Expected format: YYYY-MM
        const now = new Date();
        
        let targetYear = now.getFullYear();
        let targetMonth = now.getMonth();
        
        if (monthQuery && monthQuery.match(/^\d{4}-\d{2}$/)) {
            const [y, m] = monthQuery.split('-');
            targetYear = parseInt(y);
            targetMonth = parseInt(m) - 1; // 0-indexed
        }

        const startOfMonth = new Date(targetYear, targetMonth, 1);
        const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
        const startOfYear = new Date(targetYear, 0, 1);

        // Group by categoryId, then resolve names
        const allTimeExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, type: 'EXPENSE' },
            _sum: { amount: true }
        });

        const yearlyExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, type: 'EXPENSE', date: { gte: startOfYear } },
            _sum: { amount: true }
        });

        const monthlyExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, type: 'EXPENSE', date: { gte: startOfMonth, lte: endOfMonth } },
            _sum: { amount: true }
        });

        // Collect all unique category IDs and batch-fetch their names
        const allCategoryIds = new Set([
            ...allTimeExpenses.map(g => g.categoryId),
            ...yearlyExpenses.map(g => g.categoryId),
            ...monthlyExpenses.map(g => g.categoryId)
        ]);

        const categories = await prisma.userCategory.findMany({
            where: { id: { in: Array.from(allCategoryIds) } },
            select: { id: true, name: true }
        });

        const categoryNameMap = {};
        categories.forEach(c => { categoryNameMap[c.id] = c.name; });

        const expensesByCategory = {};

        allTimeExpenses.forEach(g => {
            const cat = categoryNameMap[g.categoryId] || 'UNKNOWN';
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0, last30Days: 0 };
            expensesByCategory[cat].allTime = g._sum.amount || 0;
        });

        yearlyExpenses.forEach(g => {
            const cat = categoryNameMap[g.categoryId] || 'UNKNOWN';
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0, last30Days: 0 };
            expensesByCategory[cat].yearly = g._sum.amount || 0;
        });

        monthlyExpenses.forEach(g => {
            const cat = categoryNameMap[g.categoryId] || 'UNKNOWN';
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0 };
            expensesByCategory[cat].monthly = g._sum.amount || 0;
        });

        const categoryLimitsData = await prisma.categoryLimit.findMany({
            where: { userId }
        });
        const categoryLimitsMap = {};
        categoryLimitsData.forEach(limit => {
            categoryLimitsMap[limit.categoryId] = limit;
        });

        categories.forEach(c => {
            const cat = c.name;
            if (expensesByCategory[cat]) {
                const limit = categoryLimitsMap[c.id];
                expensesByCategory[cat].monthlyLimit = limit?.monthlyLimit || null;
                expensesByCategory[cat].yearlyLimit = limit?.yearlyLimit || null;
            }
        });

        const currentMonthAgg = await prisma.transaction.groupBy({
            by: ['type'],
            where: { userId, date: { gte: startOfMonth, lte: endOfMonth } },
            _sum: { amount: true }
        });

        let monthIncome = 0;
        let monthExpense = 0;
        
        currentMonthAgg.forEach(group => {
            if (group.type === 'INCOME') monthIncome = group._sum.amount || 0;
            if (group.type === 'EXPENSE') monthExpense = group._sum.amount || 0;
        });

        // 4. Monthly Trends (Last 6 Months)
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        
        const sixMonthsTx = await prisma.transaction.findMany({
            where: {
                userId,
                date: { gte: sixMonthsAgo }
            },
            select: { type: true, amount: true, date: true }
        });

        const monthlyTrendsMap = {};
        
        // Initialize last 6 months with 0
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthLabel = d.toLocaleString('default', { month: 'short' });
            monthlyTrendsMap[`${d.getFullYear()}-${d.getMonth()}`] = {
                label: monthLabel,
                income: 0,
                expense: 0,
                year: d.getFullYear(),
                monthIndex: d.getMonth()
            };
        }

        sixMonthsTx.forEach(tx => {
            const txDate = new Date(tx.date);
            const key = `${txDate.getFullYear()}-${txDate.getMonth()}`;
            if (monthlyTrendsMap[key]) {
                if (tx.type === 'INCOME') {
                    monthlyTrendsMap[key].income += tx.amount;
                } else if (tx.type === 'EXPENSE') {
                    monthlyTrendsMap[key].expense += tx.amount;
                }
            }
        });

        const monthlyTrends = Object.values(monthlyTrendsMap).sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.monthIndex - b.monthIndex;
        }).map(item => ({ label: item.label, income: item.income, expense: item.expense }));

        // 5. Daily Spending for the Selected Month
        const monthTx = await prisma.transaction.findMany({
            where: {
                userId,
                type: 'EXPENSE',
                date: { gte: startOfMonth, lte: endOfMonth }
            },
            select: { amount: true, date: true, categoryId: true }
        });

        const monthDailyMap = {};
        const daysInMonth = endOfMonth.getDate();
        
        for(let i = 1; i <= daysInMonth; i++) {
            const d = new Date(targetYear, targetMonth, i);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            monthDailyMap[key] = {
                label: i.toString(),
                dateStr: key,
                expense: 0
            };
        }

        monthTx.forEach(tx => {
            const d = new Date(tx.date);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            if (monthDailyMap[key]) {
                monthDailyMap[key].expense += tx.amount;
                const catName = categoryNameMap[tx.categoryId] || 'UNKNOWN';
                if (!monthDailyMap[key][catName]) monthDailyMap[key][catName] = 0;
                monthDailyMap[key][catName] += tx.amount;
            }
        });

        const monthDailySpending = Object.values(monthDailyMap);

        res.status(200).json({
            success: true,
            data: {
                totalPortfolioValue,
                totalIncome,
                totalExpense,
                monthIncome,
                monthExpense,
                balance,
                expensesByCategory,
                monthlyTrends,
                monthDailySpending
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
