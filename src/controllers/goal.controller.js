import prisma from '../config/db.js';

export const getGoals = async (req, res) => {
    try {
        const goals = await prisma.goal.findMany({
            where: { userId: req.user.userId }
        });
        res.status(200).json({ success: true, data: goals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createGoal = async (req, res) => {
    try {
        const { name, targetAmount, initialDeposit, assetId, expectedDate, recurringAmount, recurringFrequency, sourceAssetId, imageUrls } = req.body;
        
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

            // Verify asset exists and has enough balance
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
                // 1. Create the goal
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
                        ...(urls.length > 0 && { imageUrls: urls })
                    }
                });

                // 2. Deduct from asset
                await tx.asset.update({
                    where: { id: assetId },
                    data: { value: asset.value - depositAmount }
                });

                // 3. Log the transaction as an expense towards the goal
                await tx.transaction.create({
                    data: {
                        userId: req.user.userId,
                        assetId,
                        type: 'EXPENSE',
                        amount: depositAmount,
                        category: 'GOAL FUNDING',
                        description: `Initial deposit for goal: ${name}`,
                        date: new Date()
                    }
                });

                return newGoal;
            });
        } else {
            goal = await prisma.goal.create({
                data: {
                    userId: req.user.userId,
                    name,
                    targetAmount: parseFloat(targetAmount),
                    currentAmount: 0,
                    expectedDate: new Date(expectedDate),
                    ...(recurringAmount && { recurringAmount: parseFloat(recurringAmount) }),
                    ...(recurringFrequency && { recurringFrequency: recurringFrequency.toUpperCase() }),
                    ...(sourceAssetId && { sourceAssetId }),
                    ...(urls.length > 0 && { imageUrls: urls })
                }
            });
        }

        res.status(201).json({ success: true, data: goal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const addFundsToGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;

        const goal = await prisma.goal.findUnique({
            where: { id, userId: req.user.userId }
        });

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found' });
        }

        const newAmount = Math.min(goal.targetAmount, goal.currentAmount + parseFloat(amount));

        const updatedGoal = await prisma.goal.update({
            where: { id },
            data: { currentAmount: newAmount }
        });

        res.status(200).json({ success: true, data: updatedGoal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, targetAmount, expectedDate, recurringAmount, recurringFrequency, isPinned, sourceAssetId, imageUrls } = req.body;
        
        let urls = [];
        if (imageUrls !== undefined) {
            urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
        }
        if (req.files && req.files.length > 0) {
            urls = urls.concat(req.files.map(f => f.path));
        }

        const goal = await prisma.goal.updateMany({
            where: { id, userId: req.user.userId },
            data: {
                ...(name && { name }),
                ...(targetAmount !== undefined && { targetAmount: parseFloat(targetAmount) }),
                ...(expectedDate && { expectedDate: new Date(expectedDate) }),
                ...(recurringAmount !== undefined && { recurringAmount: recurringAmount ? parseFloat(recurringAmount) : null }),
                ...(recurringFrequency !== undefined && { recurringFrequency: recurringFrequency ? recurringFrequency.toUpperCase() : null }),
                ...(isPinned !== undefined && { isPinned: Boolean(isPinned) }),
                ...(sourceAssetId !== undefined && { sourceAssetId: sourceAssetId || null }),
                ...(imageUrls !== undefined || (req.files && req.files.length > 0) ? { imageUrls: urls } : {})
            }
        });

        if (goal.count === 0) {
            return res.status(404).json({ success: false, error: 'Goal not found or unauthorized' });
        }

        const updatedGoal = await prisma.goal.findUnique({ where: { id } });
        res.status(200).json({ success: true, data: updatedGoal });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const { refundAssetId } = req.body;

        const goal = await prisma.goal.findUnique({
            where: { id, userId: req.user.userId }
        });

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found or unauthorized' });
        }

        if (goal.currentAmount > 0) {
            if (!refundAssetId) {
                return res.status(400).json({ success: false, error: 'Refund asset ID is required because the goal has a balance.' });
            }

            const asset = await prisma.asset.findUnique({
                where: { id: refundAssetId, userId: req.user.userId }
            });

            if (!asset) {
                return res.status(404).json({ success: false, error: 'Refund asset not found' });
            }

            await prisma.$transaction([
                // Delete the goal
                prisma.goal.delete({ where: { id } }),
                // Refund the asset
                prisma.asset.update({
                    where: { id: refundAssetId },
                    data: { value: asset.value + goal.currentAmount }
                }),
                // Log the refund transaction
                prisma.transaction.create({
                    data: {
                        userId: req.user.userId,
                        assetId: refundAssetId,
                        type: 'INCOME',
                        amount: goal.currentAmount,
                        category: 'GOAL REFUND',
                        description: `Refund from deleted goal: ${goal.name}`,
                        date: new Date()
                    }
                })
            ]);
        } else {
            await prisma.goal.delete({ where: { id } });
        }

        res.status(200).json({ success: true, message: 'Goal deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
