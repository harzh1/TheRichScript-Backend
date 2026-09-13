import prisma from '../config/db.js';
import { convertAmount } from '../services/fx.service.js';

export const getAnalyticsSummary = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Fetch user's reporting currency
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { currency: true }
        });
        const userCurrency = user?.currency || 'INR';

        // 1. Total Portfolio Value (Assets converted to user's reporting currency at spot rate)
        const assets = await prisma.asset.findMany({
            where: { userId },
            select: { value: true, currency: true }
        });

        let totalPortfolioValue = 0;
        for (const asset of assets) {
            const val = parseFloat(asset.value) || 0;
            if (asset.currency === userCurrency) {
                totalPortfolioValue += val;
            } else {
                const conv = await convertAmount(val, asset.currency, userCurrency);
                totalPortfolioValue += conv.convertedAmount;
            }
        }
        totalPortfolioValue = parseFloat(totalPortfolioValue.toFixed(4));

        // 2. Total Income and Expenses (Aggregated on normalized baseAmount)
        const txAggregate = await prisma.transaction.groupBy({
            by: ['type'],
            where: { userId },
            _sum: { baseAmount: true }
        });

        let totalIncome = 0;
        let totalExpense = 0;

        txAggregate.forEach(group => {
            if (group.type === 'INCOME') totalIncome = parseFloat(group._sum.baseAmount) || 0;
            if (group.type === 'EXPENSE') totalExpense = parseFloat(group._sum.baseAmount) || 0;
        });

        const balance = parseFloat((totalIncome - totalExpense).toFixed(4));

        // 3. Expenses By Category (All Time, Monthly, Yearly - using baseAmount)
        const tzOffset = parseInt(req.query.tzOffset || '0');
        const toClientDate = (date) => new Date(new Date(date).getTime() - (tzOffset * 60 * 1000));

        const monthQuery = req.query.month; // Expected format: YYYY-MM
        const now = toClientDate(new Date());
        
        let targetYear = now.getUTCFullYear();
        let targetMonth = now.getUTCMonth();
        
        if (monthQuery && monthQuery.match(/^\d{4}-\d{2}$/)) {
            const [y, m] = monthQuery.split('-');
            targetYear = parseInt(y);
            targetMonth = parseInt(m) - 1; // 0-indexed
        }

        const startOfMonthPseudo = new Date(Date.UTC(targetYear, targetMonth, 1));
        const startOfMonth = new Date(startOfMonthPseudo.getTime() + (tzOffset * 60 * 1000));
        
        const endOfMonthPseudo = new Date(Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59, 999));
        const endOfMonth = new Date(endOfMonthPseudo.getTime() + (tzOffset * 60 * 1000));

        const startOfYearPseudo = new Date(Date.UTC(targetYear, 0, 1));
        const startOfYear = new Date(startOfYearPseudo.getTime() + (tzOffset * 60 * 1000));

        // Group by categoryId, then resolve names (aggregating on baseAmount)
        const allTimeExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, type: 'EXPENSE' },
            _sum: { baseAmount: true }
        });

        const yearlyExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, type: 'EXPENSE', date: { gte: startOfYear } },
            _sum: { baseAmount: true }
        });

        const monthlyExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, type: 'EXPENSE', date: { gte: startOfMonth, lte: endOfMonth } },
            _sum: { baseAmount: true }
        });

        // Collect all unique category IDs and batch-fetch their names
        const allCategoryIds = new Set([
            ...allTimeExpenses.map(g => g.categoryId),
            ...yearlyExpenses.map(g => g.categoryId),
            ...monthlyExpenses.map(g => g.categoryId)
        ]);

        const categories = await prisma.userCategory.findMany({
            where: { id: { in: Array.from(allCategoryIds) } },
            select: { id: true, name: true, monthlyLimit: true, yearlyLimit: true }
        });

        const categoryNameMap = {};
        categories.forEach(c => { categoryNameMap[c.id] = c.name; });

        const expensesByCategory = {};

        allTimeExpenses.forEach(g => {
            const cat = categoryNameMap[g.categoryId] || 'UNKNOWN';
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0, last30Days: 0 };
            expensesByCategory[cat].allTime = parseFloat(g._sum.baseAmount) || 0;
        });

        yearlyExpenses.forEach(g => {
            const cat = categoryNameMap[g.categoryId] || 'UNKNOWN';
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0, last30Days: 0 };
            expensesByCategory[cat].yearly = parseFloat(g._sum.baseAmount) || 0;
        });

        monthlyExpenses.forEach(g => {
            const cat = categoryNameMap[g.categoryId] || 'UNKNOWN';
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0 };
            expensesByCategory[cat].monthly = parseFloat(g._sum.baseAmount) || 0;
        });

        categories.forEach(c => {
            const cat = c.name;
            if (expensesByCategory[cat]) {
                expensesByCategory[cat].monthlyLimit = c.monthlyLimit ? parseFloat(c.monthlyLimit) : null;
                expensesByCategory[cat].yearlyLimit = c.yearlyLimit ? parseFloat(c.yearlyLimit) : null;
            }
        });

        const currentMonthAgg = await prisma.transaction.groupBy({
            by: ['type'],
            where: { userId, date: { gte: startOfMonth, lte: endOfMonth } },
            _sum: { baseAmount: true }
        });

        let monthIncome = 0;
        let monthExpense = 0;
        
        currentMonthAgg.forEach(group => {
            if (group.type === 'INCOME') monthIncome = parseFloat(group._sum.baseAmount) || 0;
            if (group.type === 'EXPENSE') monthExpense = parseFloat(group._sum.baseAmount) || 0;
        });

        // 4. Monthly Trends (Last 6 Months using baseAmount)
        const sixMonthsAgoPseudo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
        const sixMonthsAgo = new Date(sixMonthsAgoPseudo.getTime() + (tzOffset * 60 * 1000));
        
        const sixMonthsTx = await prisma.transaction.findMany({
            where: {
                userId,
                date: { gte: sixMonthsAgo }
            },
            select: { type: true, baseAmount: true, date: true }
        });

        const monthlyTrendsMap = {};
        
        // Initialize last 6 months with 0
        for (let i = 5; i >= 0; i--) {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
            const monthLabel = d.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
            monthlyTrendsMap[`${d.getUTCFullYear()}-${d.getUTCMonth()}`] = {
                label: monthLabel,
                income: 0,
                expense: 0,
                year: d.getUTCFullYear(),
                monthIndex: d.getUTCMonth()
            };
        }

        sixMonthsTx.forEach(tx => {
            const txDate = toClientDate(tx.date);
            const key = `${txDate.getUTCFullYear()}-${txDate.getUTCMonth()}`;
            if (monthlyTrendsMap[key]) {
                if (tx.type === 'INCOME') {
                    monthlyTrendsMap[key].income += parseFloat(tx.baseAmount);
                } else if (tx.type === 'EXPENSE') {
                    monthlyTrendsMap[key].expense += parseFloat(tx.baseAmount);
                }
            }
        });

        const monthlyTrends = Object.values(monthlyTrendsMap).sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.monthIndex - b.monthIndex;
        }).map(item => ({ label: item.label, income: item.income, expense: item.expense }));

        // 5. Daily Spending for the Selected Month (using baseAmount)
        const monthTx = await prisma.transaction.findMany({
            where: {
                userId,
                type: 'EXPENSE',
                date: { gte: startOfMonth, lte: endOfMonth }
            },
            select: { baseAmount: true, date: true, categoryId: true }
        });

        const monthDailyMap = {};
        const daysInMonth = endOfMonthPseudo.getUTCDate();
        
        for(let i = 1; i <= daysInMonth; i++) {
            const key = `${targetYear}-${targetMonth}-${i}`;
            monthDailyMap[key] = {
                label: i.toString(),
                dateStr: key,
                expense: 0
            };
        }

        monthTx.forEach(tx => {
            const d = toClientDate(tx.date);
            const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
            if (monthDailyMap[key]) {
                monthDailyMap[key].expense += parseFloat(tx.baseAmount);
                const catName = categoryNameMap[tx.categoryId] || 'UNKNOWN';
                if (!monthDailyMap[key][catName]) monthDailyMap[key][catName] = 0;
                monthDailyMap[key][catName] += parseFloat(tx.baseAmount);
            }
        });

        const monthDailySpending = Object.values(monthDailyMap);

        res.status(200).json({
            success: true,
            data: {
                currency: userCurrency,
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
