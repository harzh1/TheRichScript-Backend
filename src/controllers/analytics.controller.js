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

        // We fetch raw transactions for category grouping to avoid complex overlapping dates in single queries
        // Wait, to be efficient we should do separate aggregations or raw query
        // For simplicity with Prisma and moderate scale, we can fetch only EXPENSE transactions and group in JS,
        // OR better: do 3 separate groupBy queries. Let's do 3 separate queries.
        
        const allTimeExpenses = await prisma.transaction.groupBy({
            by: ['category'],
            where: { userId },
            _sum: { amount: true }
        });

        const yearlyExpenses = await prisma.transaction.groupBy({
            by: ['category'],
            where: { userId, date: { gte: startOfYear } },
            _sum: { amount: true }
        });

        const monthlyExpenses = await prisma.transaction.groupBy({
            by: ['category'],
            where: { userId, date: { gte: startOfMonth } },
            _sum: { amount: true }
        });

        const expensesByCategory = {};

        allTimeExpenses.forEach(g => {
            const cat = g.category.toUpperCase();
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0 };
            expensesByCategory[cat].allTime = g._sum.amount || 0;
        });

        yearlyExpenses.forEach(g => {
            const cat = g.category.toUpperCase();
            if (!expensesByCategory[cat]) expensesByCategory[cat] = { allTime: 0, monthly: 0, yearly: 0 };
            expensesByCategory[cat].yearly = g._sum.amount || 0;
        });

        monthlyExpenses.forEach(g => {
            const cat = g.category.toUpperCase();
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
