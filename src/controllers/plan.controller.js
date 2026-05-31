import prisma from '../config/db.js';

export const getPlans = async (req, res) => {
    try {
        const plans = await prisma.plannedExpense.findMany({
            where: { userId: req.user.userId }
        });
        res.status(200).json({ success: true, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createPlan = async (req, res) => {
    try {
        const { assetId, name, category, amount, type, frequency, nextDueDate } = req.body;

        const plan = await prisma.plannedExpense.create({
            data: {
                userId: req.user.userId,
                assetId,
                name,
                category: category.toUpperCase(),
                amount: parseFloat(amount),
                type: type.toUpperCase(),
                ...(frequency && { frequency: frequency.toUpperCase() }),
                ...(nextDueDate && { nextDueDate: new Date(nextDueDate) })
            }
        });

        res.status(201).json({ success: true, data: plan });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { assetId, name, category, amount, frequency, nextDueDate } = req.body;

        const plan = await prisma.plannedExpense.updateMany({
            where: { id, userId: req.user.userId },
            data: {
                ...(assetId && { assetId }),
                ...(name && { name }),
                ...(category && { category: category.toUpperCase() }),
                ...(amount !== undefined && { amount: parseFloat(amount) }),
                ...(frequency && { frequency: frequency.toUpperCase() }),
                ...(nextDueDate && { nextDueDate: new Date(nextDueDate) })
            }
        });

        if (plan.count === 0) {
            return res.status(404).json({ success: false, error: 'Plan not found or already deleted' });
        }

        const updatedPlan = await prisma.plannedExpense.findUnique({ where: { id } });
        res.status(200).json({ success: true, data: updatedPlan });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;

        const deleted = await prisma.plannedExpense.deleteMany({
            where: { id, userId: req.user.userId }
        });

        if (deleted.count === 0) {
            return res.status(404).json({ success: false, error: 'Plan not found or already deleted' });
        }

        res.status(200).json({ success: true, message: 'Plan deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
