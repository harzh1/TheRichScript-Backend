import prisma from '../config/db.js';

/**
 * GET /categories
 * Returns all user categories with their limits.
 */
export const getCategories = async (req, res) => {
    try {
        const categories = await prisma.userCategory.findMany({
            where: { userId: req.user.userId },
            include: {
                categoryLimits: true
            },
            orderBy: { name: 'asc' }
        });

        // Transform to a flat response compatible with the frontend
        const data = categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            monthlyLimit: cat.categoryLimits[0]?.monthlyLimit ?? null,
            yearlyLimit: cat.categoryLimits[0]?.yearlyLimit ?? null,
            limitId: cat.categoryLimits[0]?.id ?? null
        }));

        res.status(200).json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /categories
 * Create a new category (optionally with limits).
 */
export const createCategory = async (req, res) => {
    try {
        const { name, monthlyLimit, yearlyLimit } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Category name is required' });
        }

        const uppercaseName = name.toUpperCase();

        const category = await prisma.$transaction(async (tx) => {
            const cat = await tx.userCategory.create({
                data: { userId: req.user.userId, name: uppercaseName }
            });

            if (monthlyLimit !== undefined || yearlyLimit !== undefined) {
                await tx.categoryLimit.create({
                    data: {
                        userId: req.user.userId,
                        categoryId: cat.id,
                        monthlyLimit: monthlyLimit != null ? parseFloat(monthlyLimit) : null,
                        yearlyLimit: yearlyLimit != null ? parseFloat(yearlyLimit) : null
                    }
                });
            }

            return cat;
        });

        res.status(201).json({ success: true, data: category });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'Category already exists' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * PUT /categories/:id
 * Rename a category and/or update its limits.
 * Renaming just updates UserCategory.name — all FK references follow automatically.
 */
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, monthlyLimit, yearlyLimit } = req.body;

        const existing = await prisma.userCategory.findFirst({
            where: { id, userId: req.user.userId }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Rename if provided
            let updatedCat = existing;
            if (name && name.toUpperCase() !== existing.name) {
                updatedCat = await tx.userCategory.update({
                    where: { id },
                    data: { name: name.toUpperCase() }
                });
            }

            // Upsert limit if provided
            if (monthlyLimit !== undefined || yearlyLimit !== undefined) {
                await tx.categoryLimit.upsert({
                    where: {
                        userId_categoryId: { userId: req.user.userId, categoryId: id }
                    },
                    update: {
                        ...(monthlyLimit !== undefined && { monthlyLimit: monthlyLimit != null ? parseFloat(monthlyLimit) : null }),
                        ...(yearlyLimit !== undefined && { yearlyLimit: yearlyLimit != null ? parseFloat(yearlyLimit) : null })
                    },
                    create: {
                        userId: req.user.userId,
                        categoryId: id,
                        monthlyLimit: monthlyLimit != null ? parseFloat(monthlyLimit) : null,
                        yearlyLimit: yearlyLimit != null ? parseFloat(yearlyLimit) : null
                    }
                });
            }

            return updatedCat;
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'A category with that name already exists' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * DELETE /categories/:id
 * Blocks deletion if any transactions or plans reference the category (Option A).
 */
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await prisma.userCategory.findFirst({
            where: { id, userId: req.user.userId },
            include: {
                _count: {
                    select: {
                        transactions: true,
                        plannedExpenses: true
                    }
                }
            }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        const totalReferences = existing._count.transactions + existing._count.plannedExpenses;
        if (totalReferences > 0) {
            return res.status(409).json({
                success: false,
                error: `Cannot delete category "${existing.name}" — it is referenced by ${existing._count.transactions} transaction(s) and ${existing._count.plannedExpenses} plan(s). Rename it instead, or reassign those records first.`
            });
        }

        // Safe to delete — CategoryLimit will cascade-delete
        await prisma.userCategory.delete({ where: { id } });

        res.status(200).json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Helper: Resolves a category name to its UserCategory id,
 * creating the UserCategory if it doesn't exist.
 * Used internally by other controllers (transactions, plans, etc.)
 */
export const resolveCategoryId = async (tx, userId, categoryName) => {
    const uppercaseName = categoryName.toUpperCase();
    const existing = await tx.userCategory.findUnique({
        where: { userId_name: { userId, name: uppercaseName } }
    });

    if (existing) return existing.id;

    const created = await tx.userCategory.create({
        data: { userId, name: uppercaseName }
    });

    return created.id;
};
