import prisma from '../config/db.js';

export const getCategoryLimits = async (req, res) => {
    try {
        const limits = await prisma.categoryLimit.findMany({
            where: { userId: req.user.userId }
        });
        const userCats = await prisma.userCategory.findMany({
            where: { userId: req.user.userId }
        });
        
        const txCats = await prisma.transaction.findMany({
            where: { userId: req.user.userId },
            select: { category: true },
            distinct: ['category']
        });

        const planCats = await prisma.plannedExpense.findMany({
            where: { userId: req.user.userId },
            select: { category: true },
            distinct: ['category']
        });

        const allCats = Array.from(new Set([
            ...userCats.map(c => c.name),
            ...txCats.map(t => t.category),
            ...planCats.map(p => p.category)
        ]));

        res.status(200).json({ 
            success: true, 
            data: { 
                limits: limits, 
                custom: allCats
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const setCategoryLimits = async (req, res) => {
    try {
        const { categoryName, monthlyLimit, yearlyLimit } = req.body;

        if (!categoryName) {
            return res.status(400).json({ success: false, error: 'Category name is required' });
        }

        const uppercaseName = categoryName.toUpperCase();

        // 1. Ensure UserCategory exists
        await prisma.userCategory.upsert({
            where: { userId_name: { userId: req.user.userId, name: uppercaseName } },
            update: {},
            create: { userId: req.user.userId, name: uppercaseName }
        });

        // 2. Upsert CategoryLimit if limits are provided
        if (monthlyLimit !== null && monthlyLimit !== undefined || yearlyLimit !== null && yearlyLimit !== undefined) {
            await prisma.categoryLimit.upsert({
                where: {
                    userId_categoryName: {
                        userId: req.user.userId,
                        categoryName: uppercaseName
                    }
                },
                update: {
                    monthlyLimit: monthlyLimit !== undefined ? parseFloat(monthlyLimit) : null,
                    yearlyLimit: yearlyLimit !== undefined ? parseFloat(yearlyLimit) : null
                },
                create: {
                    userId: req.user.userId,
                    categoryName: uppercaseName,
                    monthlyLimit: monthlyLimit !== undefined ? parseFloat(monthlyLimit) : null,
                    yearlyLimit: yearlyLimit !== undefined ? parseFloat(yearlyLimit) : null
                }
            });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
