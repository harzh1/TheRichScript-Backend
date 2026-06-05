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
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        // Group by categoryId, then resolve names
        const allTimeExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId },
            _sum: { amount: true }
        });

        const yearlyExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, date: { gte: startOfYear } },
            _sum: { amount: true }
        });

        const monthlyExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, date: { gte: startOfMonth } },
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
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0 };
            expensesByCategory[cat].allTime = g._sum.amount || 0;
        });

        yearlyExpenses.forEach(g => {
            const cat = categoryNameMap[g.categoryId] || 'UNKNOWN';
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0 };
            expensesByCategory[cat].yearly = g._sum.amount || 0;
        });

        monthlyExpenses.forEach(g => {
            const cat = categoryNameMap[g.categoryId] || 'UNKNOWN';
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0 };
            expensesByCategory[cat].monthly = g._sum.amount || 0;
        });

        res.status(200).json({
            success: true,
            data: {
                totalPortfolioValue,
                totalIncome,
                totalExpense,
                balance,
                expensesByCategory
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
