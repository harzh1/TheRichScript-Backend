import prisma from '../config/db.js';
import { resolveCategoryId } from './category.controller.js';

export const getGoals = async (req, res) => {
    try {
        const goals = await prisma.goal.findMany({
            where: { userId: req.user.userId },
            include: { images: true }
        });

        // Flatten images for frontend compatibility
        const flatGoals = goals.map(goal => ({
            ...goal,
            imageUrls: goal.images.map(img => img.url),
            images: undefined
        }));

        res.status(200).json({ success: true, data: flatGoals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createGoal = async (req, res) => {
    try {
        const { name, targetAmount, initialDeposit, assetId, expectedDate, recurringAmount, recurringFrequency, sourceAssetId, targetAssetId, imageUrls } = req.body;
        
        let urls = [];
        if (imageUrls) {
            urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
        }
        if (req.files && req.files.length > 0) {
            urls = urls.concat(req.files.map(f => f.path));
        }

        const depositAmount = parseFloat(initialDeposit) || 0;

        let goal;

        if (depositAmount > 0) {
            if (!assetId) {
                return res.status(400).json({ success: false, error: 'Asset ID is required for an initial deposit.' });
            }

            const asset = await prisma.asset.findUnique({
                where: { id: assetId, userId: req.user.userId }
            });

            if (!asset) {
                return res.status(404).json({ success: false, error: 'Source asset not found' });
            }

            if (asset.value < depositAmount) {
                return res.status(400).json({ success: false, error: 'Insufficient funds in the selected asset.' });
            }

            goal = await prisma.$transaction(async (tx) => {
                const categoryId = await resolveCategoryId(tx, req.user.userId, 'GOAL FUNDING');

                const newGoal = await tx.goal.create({
                    data: {
                        userId: req.user.userId,
                        name,
                        targetAmount: parseFloat(targetAmount),
                        currentAmount: depositAmount,
                        expectedDate: new Date(expectedDate),
                        ...(recurringAmount && { recurringAmount: parseFloat(recurringAmount) }),
                        ...(recurringFrequency && { recurringFrequency: recurringFrequency.toUpperCase() }),
                        ...(sourceAssetId && { sourceAssetId }),
                        ...(targetAssetId && { targetAssetId }),
                        ...(urls.length > 0 && { images: { create: urls.map(u => ({ url: u })) } })
                    }
                });

                // Deduct from asset
                await tx.asset.update({
                    where: { id: assetId },
                    data: { value: asset.value - depositAmount }
                });

                if (targetAssetId) {
                    const targetAsset = await tx.asset.findUnique({ where: { id: targetAssetId, userId: req.user.userId } });
                    if (targetAsset) {
                        await tx.asset.update({
                            where: { id: targetAssetId },
                            data: { value: targetAsset.value + depositAmount }
                        });
                        const categoryId = await resolveCategoryId(tx, req.user.userId, 'GOAL FUNDING');
                        await tx.transaction.create({
                            data: {
                                userId: req.user.userId,
                                assetId,
                                toAssetId: targetAssetId,
                                type: 'TRANSFER',
                                amount: depositAmount,
                                categoryId,
                                description: `Goal funding transfer: ${name}`,
                                date: new Date()
                            }
                        });
                    }
                } else {
                    const categoryId = await resolveCategoryId(tx, req.user.userId, 'GOAL FUNDING');
                    await tx.transaction.create({
                        data: {
                            userId: req.user.userId,
                            assetId,
                            type: 'EXPENSE',
                            amount: depositAmount,
                            categoryId,
                            description: `Initial deposit for goal: ${name}`,
                            date: new Date()
                        }
                    });
                }

                return newGoal;
            });
        } else {
            goal = await prisma.$transaction(async (tx) => {
                const newGoal = await tx.goal.create({
                    data: {
                        userId: req.user.userId,
                        name,
                        targetAmount: parseFloat(targetAmount),
                        currentAmount: 0,
                        expectedDate: new Date(expectedDate),
                        ...(recurringAmount && { recurringAmount: parseFloat(recurringAmount) }),
                        ...(recurringFrequency && { recurringFrequency: recurringFrequency.toUpperCase() }),
                        ...(sourceAssetId && { sourceAssetId }),
                        ...(targetAssetId && { targetAssetId }),
                        ...(urls.length > 0 && { images: { create: urls.map(u => ({ url: u })) } })
                    }
                });

                return newGoal;
            });
        }

        // Re-fetch with images for response
        const fullGoal = await prisma.goal.findUnique({
            where: { id: goal.id },
            include: { images: true }
        });

        res.status(201).json({
            success: true,
            data: { ...fullGoal, imageUrls: fullGoal.images.map(img => img.url), images: undefined }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const addFundsToGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, assetId } = req.body;

        const fundAmount = parseFloat(amount);

        const goal = await prisma.goal.findUnique({
            where: { id, userId: req.user.userId }
        });

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found or already deleted' });
        }

        if (goal.currentAmount >= goal.targetAmount) {
            return res.status(400).json({ success: false, error: 'Goal is already fully funded' });
        }

        const sourceAsset = await prisma.asset.findUnique({
            where: { id: assetId, userId: req.user.userId }
        });

        if (!sourceAsset || sourceAsset.value < fundAmount) {
            return res.status(400).json({ success: false, error: 'Source asset not found or insufficient funds' });
        }

        const newAmount = Math.min(goal.targetAmount, goal.currentAmount + fundAmount);
        const actualDeposit = newAmount - goal.currentAmount;

        const updatedGoal = await prisma.$transaction(async (tx) => {
            const g = await tx.goal.update({
                where: { id },
                data: { currentAmount: newAmount }
            });

            await tx.asset.update({
                where: { id: assetId },
                data: { value: sourceAsset.value - actualDeposit }
            });

            if (goal.targetAssetId) {
                const tAsset = await tx.asset.findUnique({ where: { id: goal.targetAssetId } });
                if (tAsset) {
                    await tx.asset.update({
                        where: { id: goal.targetAssetId },
                        data: { value: tAsset.value + actualDeposit }
                    });
                    const categoryId = await resolveCategoryId(tx, req.user.userId, 'GOAL FUNDING');
                    await tx.transaction.create({
                        data: {
                            userId: req.user.userId,
                            assetId,
                            toAssetId: goal.targetAssetId,
                            type: 'TRANSFER',
                            amount: actualDeposit,
                            categoryId,
                            description: `Goal funding transfer: ${goal.name}`,
                            date: new Date()
                        }
                    });
                }
            } else {
                const categoryId = await resolveCategoryId(tx, req.user.userId, 'GOAL FUNDING');
                await tx.transaction.create({
                    data: {
                        userId: req.user.userId,
                        assetId,
                        type: 'EXPENSE',
                        amount: actualDeposit,
                        categoryId,
                        description: `Added funds to goal: ${goal.name}`,
                        date: new Date()
                    }
                });
            }
            return g;
        });

        res.status(200).json({ success: true, data: updatedGoal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, targetAmount, expectedDate, recurringAmount, recurringFrequency, isPinned, sourceAssetId, targetAssetId, imageUrls } = req.body;
        
        let urls = [];
        if (imageUrls) {
            urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
        }
        if (req.files && req.files.length > 0) {
            urls = urls.concat(req.files.map(f => f.path));
        }

        const result = await prisma.$transaction(async (tx) => {
            const oldGoal = await tx.goal.findUnique({
                where: { id, userId: req.user.userId }
            });

            if (!oldGoal) {
                throw new Error('Goal not found or already deleted');
            }

            const goal = await tx.goal.update({
                where: { id },
                data: {
                    ...(name && { name }),
                    ...(targetAmount !== undefined && { targetAmount: parseFloat(targetAmount) }),
                    ...(expectedDate && { expectedDate: new Date(expectedDate) }),
                    ...(recurringAmount !== undefined && { recurringAmount: recurringAmount ? parseFloat(recurringAmount) : null }),
                    ...(recurringFrequency !== undefined && { recurringFrequency: recurringFrequency ? recurringFrequency.toUpperCase() : null }),
                    ...(isPinned !== undefined && { isPinned: Boolean(isPinned) }),
                    ...(sourceAssetId !== undefined && { sourceAssetId: sourceAssetId || null }),
                    ...(targetAssetId !== undefined && { targetAssetId: targetAssetId || null }),
                    ...(imageUrls !== undefined || (req.files && req.files.length > 0) ? { 
                        images: { 
                            deleteMany: {}, 
                            create: urls.map(u => ({ url: u })) 
                        } 
                    } : {})
                }
            });

            return tx.goal.findUnique({
                where: { id },
                include: { images: true }
            });
        });

        res.status(200).json({
            success: true,
            data: { ...result, imageUrls: result.images.map(img => img.url), images: undefined }
        });
    } catch (error) {
        if (error.message === 'Goal not found or already deleted') {
            return res.status(404).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const { refundAssetId } = req.body || {};

        const goal = await prisma.goal.findUnique({
            where: { id, userId: req.user.userId }
        });

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found or already deleted' });
        }

        const balance = goal.currentAmount || 0;

        if (balance > 0) {
            if (!refundAssetId) {
                return res.status(400).json({ success: false, error: 'Refund asset is required because the goal has a saved balance.' });
            }

            const refundAsset = await prisma.asset.findUnique({
                where: { id: refundAssetId, userId: req.user.userId }
            });

            if (!refundAsset) {
                return res.status(404).json({ success: false, error: 'Refund destination account not found.' });
            }

            if (goal.targetAssetId) {
                // The goal's funds were deposited into a target asset account
                const holdingAsset = await prisma.asset.findUnique({
                    where: { id: goal.targetAssetId, userId: req.user.userId }
                });

                if (!holdingAsset || holdingAsset.value <= 0) {
                    return res.status(400).json({
                        success: false,
                        error: `There is no money in the linked account (${holdingAsset?.name || 'Account'}) to process the refund.`
                    });
                }

                if (holdingAsset.value < balance) {
                    return res.status(400).json({
                        success: false,
                        error: `Not enough money in ${holdingAsset.name} to refund the goal balance. Required: ${balance}, Available: ${holdingAsset.value}.`
                    });
                }

                await prisma.$transaction(async (tx) => {
                    const categoryId = await resolveCategoryId(tx, req.user.userId, 'GOAL REFUND');

                    // GoalImage cascade-deletes automatically
                    await tx.goal.delete({ where: { id } });

                    if (goal.targetAssetId !== refundAssetId) {
                        // Transfer from holding asset to destination refund asset
                        await tx.asset.update({
                            where: { id: goal.targetAssetId },
                            data: { value: holdingAsset.value - balance }
                        });

                        await tx.asset.update({
                            where: { id: refundAssetId },
                            data: { value: refundAsset.value + balance }
                        });

                        await tx.transaction.create({
                            data: {
                                userId: req.user.userId,
                                assetId: goal.targetAssetId,
                                toAssetId: refundAssetId,
                                type: 'TRANSFER',
                                amount: balance,
                                categoryId,
                                description: `Refund transfer from deleted goal: ${goal.name}`,
                                date: new Date()
                            }
                        });
                    }
                });
            } else {
                // Goal funds were held in abstract goal pool (expense deduction)
                await prisma.$transaction(async (tx) => {
                    const categoryId = await resolveCategoryId(tx, req.user.userId, 'GOAL REFUND');

                    // GoalImage cascade-deletes automatically
                    await tx.goal.delete({ where: { id } });

                    await tx.asset.update({
                        where: { id: refundAssetId },
                        data: { value: refundAsset.value + balance }
                    });

                    await tx.transaction.create({
                        data: {
                            userId: req.user.userId,
                            assetId: refundAssetId,
                            type: 'INCOME',
                            amount: balance,
                            categoryId,
                            description: `Refund from deleted goal: ${goal.name}`,
                            date: new Date()
                        }
                    });
                });
            }
        } else {
            // GoalImage cascade-deletes automatically
            await prisma.goal.delete({ where: { id } });
        }

        res.status(200).json({ success: true, message: 'Goal deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
