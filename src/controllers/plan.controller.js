import prisma from '../config/db.js';
import { resolveCategoryId } from './category.controller.js';

export const getPlans = async (req, res) => {
    try {
        const plans = await prisma.plannedExpense.findMany({
            where: { userId: req.user.userId },
            include: { category: true, asset: true, targetAsset: true }
        });

        // Flatten category and asset names for frontend compatibility
        const flatPlans = plans.map(plan => ({
            ...plan,
            category: plan.category.name,
            categoryId: plan.categoryId,
            sourceAssetName: plan.asset?.name || null,
            targetAssetName: plan.targetAsset?.name || null
        }));

        res.status(200).json({ success: true, data: flatPlans });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createPlan = async (req, res) => {
    try {
        const { assetId, targetAssetId, name, category, amount, type, txType, frequency, nextDueDate } = req.body;

        const plan = await prisma.$transaction(async (tx) => {
            const categoryId = await resolveCategoryId(tx, req.user.userId, category);

            return tx.plannedExpense.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    ...(targetAssetId && { targetAssetId }),
                    name,
                    categoryId,
                    amount: parseFloat(amount),
                    type: type.toUpperCase(),
                    txType: txType ? txType.toUpperCase() : 'EXPENSE',
                    ...(frequency && { frequency: frequency.toUpperCase() }),
                    ...(nextDueDate && { nextDueDate: new Date(nextDueDate) })
                },
                include: { category: true, asset: true, targetAsset: true }
            });
        });

        res.status(201).json({
            success: true,
            data: {
                ...plan,
                category: plan.category.name,
                categoryId: plan.categoryId,
                sourceAssetName: plan.asset?.name || null,
                targetAssetName: plan.targetAsset?.name || null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { assetId, targetAssetId, name, category, amount, frequency, nextDueDate, txType } = req.body;

        const updateData = {};

        if (assetId) updateData.assetId = assetId;
        if (targetAssetId !== undefined) updateData.targetAssetId = targetAssetId || null;
        if (name) updateData.name = name;
        if (amount !== undefined) updateData.amount = parseFloat(amount);
        if (frequency) updateData.frequency = frequency.toUpperCase();
        if (nextDueDate) updateData.nextDueDate = new Date(nextDueDate);
        if (txType) updateData.txType = txType.toUpperCase();

        const result = await prisma.$transaction(async (tx) => {
            // Resolve category if provided
            if (category) {
                updateData.categoryId = await resolveCategoryId(tx, req.user.userId, category);
            }

            const plan = await tx.plannedExpense.updateMany({
                where: { id, userId: req.user.userId },
                data: updateData
            });

            if (plan.count === 0) {
                throw new Error('Plan not found or already deleted');
            }

            return tx.plannedExpense.findUnique({
                where: { id },
                include: { category: true, asset: true, targetAsset: true }
            });
        });

        res.status(200).json({
            success: true,
            data: {
                ...result,
                category: result.category.name,
                categoryId: result.categoryId,
                sourceAssetName: result.asset?.name || null,
                targetAssetName: result.targetAsset?.name || null
            }
        });
    } catch (error) {
        if (error.message === 'Plan not found or already deleted') {
            return res.status(404).json({ success: false, error: error.message });
        }
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
