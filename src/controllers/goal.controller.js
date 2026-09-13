import prisma from '../config/db.js';
import { convertAmount } from '../services/fx.service.js';

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
        const { name, targetAmount, initialDeposit, assetId, expectedDate, recurringAmount, recurringFrequency, currency, sourceAssetId, targetAssetId, imageUrls } = req.body;
        
        let urls = [];
        if (imageUrls) {
            urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
        }
        if (req.files && req.files.length > 0) {
            urls = urls.concat(req.files.map(f => f.path));
        }

        const depositAmount = parseFloat(initialDeposit) || 0;

        let goal;

        const fundingAssetId = assetId || sourceAssetId;

        // Fetch user currency for default
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { currency: true }
        });
        const userCurrency = user?.currency || 'INR';
        const goalCurrency = currency ? currency.trim().toUpperCase() : userCurrency;

        if (depositAmount > 0) {
            if (!fundingAssetId) {
                return res.status(400).json({ success: false, error: 'Asset ID is required for an initial deposit.' });
            }

            const asset = await prisma.asset.findUnique({
                where: { id: fundingAssetId, userId: req.user.userId }
            });

            if (!asset) {
                return res.status(404).json({ success: false, error: 'Source asset not found' });
            }

            if (parseFloat(asset.value) < depositAmount) {
                return res.status(400).json({ success: false, error: 'Insufficient funds in the selected asset.' });
            }

            goal = await prisma.$transaction(async (tx) => {
                const newGoal = await tx.goal.create({
                    data: {
                        userId: req.user.userId,
                        name,
                        targetAmount: parseFloat(targetAmount),
                        currentAmount: depositAmount,
                        currency: goalCurrency,
                        expectedDate: new Date(expectedDate),
                        ...(recurringAmount && { recurringAmount: parseFloat(recurringAmount) }),
                        ...(recurringFrequency && { recurringFrequency: recurringFrequency.toUpperCase() }),
                        ...(sourceAssetId && { sourceAssetId }),
                        ...(targetAssetId && { targetAssetId }),
                        ...(urls.length > 0 && { imageUrls: urls })
                    }
                });

                if (targetAssetId && targetAssetId !== fundingAssetId) {
                    const targetAsset = await tx.asset.findUnique({ where: { id: targetAssetId, userId: req.user.userId } });
                    
                    let targetCreditedAmount = depositAmount;
                    let rate = 1.0;

                    if (targetAsset && asset.currency !== targetAsset.currency) {
                        const conv = await convertAmount(depositAmount, asset.currency, targetAsset.currency);
                        targetCreditedAmount = conv.convertedAmount;
                        rate = conv.exchangeRate;
                    }

                    // Deduct from source asset in its native currency
                    await tx.asset.update({
                        where: { id: fundingAssetId },
                        data: { value: parseFloat(asset.value) - depositAmount }
                    });

                    if (targetAsset) {
                        await tx.asset.update({
                            where: { id: targetAssetId },
                            data: { value: parseFloat(targetAsset.value) + targetCreditedAmount }
                        });
                    }

                    let baseAmount = depositAmount;
                    if (asset.currency !== userCurrency) {
                        const userConv = await convertAmount(depositAmount, asset.currency, userCurrency);
                        baseAmount = userConv.convertedAmount;
                    }

                    await tx.transaction.create({
                        data: {
                            userId: req.user.userId,
                            assetId: fundingAssetId,
                            toAssetId: targetAssetId,
                            type: 'TRANSFER',
                            amount: depositAmount,
                            currency: asset.currency,
                            exchangeRate: rate,
                            targetAmount: targetCreditedAmount,
                            baseAmount,
                            description: `Goal funding transfer: ${name}`,
                            date: new Date()
                        }
                    });
                } else if (targetAssetId && targetAssetId === fundingAssetId) {
                    // Same account holding the funds — no balance change, just log the earmarking
                    await tx.transaction.create({
                        data: {
                            userId: req.user.userId,
                            assetId: fundingAssetId,
                            type: 'TRANSFER',
                            amount: depositAmount,
                            currency: asset.currency,
                            exchangeRate: 1.0,
                            baseAmount: depositAmount,
                            description: `Goal funding: ${name}`,
                            date: new Date()
                        }
                    });
                } else {
                    // Deduct from source asset
                    await tx.asset.update({
                        where: { id: fundingAssetId },
                        data: { value: parseFloat(asset.value) - depositAmount }
                    });

                    let baseAmount = depositAmount;
                    if (asset.currency !== userCurrency) {
                        const userConv = await convertAmount(depositAmount, asset.currency, userCurrency);
                        baseAmount = userConv.convertedAmount;
                    }

                    await tx.transaction.create({
                        data: {
                            userId: req.user.userId,
                            assetId: fundingAssetId,
                            type: 'TRANSFER',
                            amount: depositAmount,
                            currency: asset.currency,
                            exchangeRate: 1.0,
                            baseAmount,
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
                        currency: goalCurrency,
                        expectedDate: new Date(expectedDate),
                        ...(recurringAmount && { recurringAmount: parseFloat(recurringAmount) }),
                        ...(recurringFrequency && { recurringFrequency: recurringFrequency.toUpperCase() }),
                        ...(sourceAssetId && { sourceAssetId }),
                        ...(targetAssetId && { targetAssetId }),
                        ...(urls.length > 0 && { imageUrls: urls })
                    }
                });
                return newGoal;
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
        const { amount, assetId, destinationAmount, exchangeRate } = req.body;

        const fundAmount = parseFloat(amount);

        const goal = await prisma.goal.findUnique({
            where: { id, userId: req.user.userId }
        });

        if (!goal) {
            return res.status(404).json({ success: false, error: 'Goal not found or already deleted' });
        }

        if (parseFloat(goal.currentAmount) >= parseFloat(goal.targetAmount)) {
            return res.status(400).json({ success: false, error: 'Goal is already fully funded' });
        }

        const sourceAsset = await prisma.asset.findUnique({
            where: { id: assetId, userId: req.user.userId }
        });

        if (!sourceAsset || parseFloat(sourceAsset.value) < fundAmount) {
            return res.status(400).json({ success: false, error: 'Source asset not found or insufficient funds' });
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { currency: true }
        });
        const userCurrency = user?.currency || 'INR';

        const newAmount = Math.min(parseFloat(goal.targetAmount), parseFloat(goal.currentAmount) + fundAmount);
        const actualDeposit = newAmount - parseFloat(goal.currentAmount);

        const updatedGoal = await prisma.$transaction(async (tx) => {
            const g = await tx.goal.update({
                where: { id },
                data: { currentAmount: newAmount }
            });

            if (goal.targetAssetId && goal.targetAssetId !== assetId) {
                const tAsset = await tx.asset.findUnique({ where: { id: goal.targetAssetId } });
                
                let targetCredit = actualDeposit;
                let rate = 1.0;

                if (tAsset && sourceAsset.currency !== tAsset.currency) {
                    if (destinationAmount !== undefined && destinationAmount !== null) {
                        targetCredit = parseFloat(destinationAmount);
                        rate = exchangeRate ? parseFloat(exchangeRate) : parseFloat((targetCredit / actualDeposit).toFixed(6));
                    } else if (exchangeRate !== undefined && exchangeRate !== null) {
                        rate = parseFloat(exchangeRate);
                        targetCredit = parseFloat((actualDeposit * rate).toFixed(4));
                    } else {
                        const conv = await convertAmount(actualDeposit, sourceAsset.currency, tAsset.currency);
                        targetCredit = conv.convertedAmount;
                        rate = conv.exchangeRate;
                    }
                }

                await tx.asset.update({
                    where: { id: assetId },
                    data: { value: parseFloat(sourceAsset.value) - actualDeposit }
                });

                if (tAsset) {
                    await tx.asset.update({
                        where: { id: goal.targetAssetId },
                        data: { value: parseFloat(tAsset.value) + targetCredit }
                    });
                }

                let baseAmount = actualDeposit;
                if (sourceAsset.currency !== userCurrency) {
                    const userConv = await convertAmount(actualDeposit, sourceAsset.currency, userCurrency);
                    baseAmount = userConv.convertedAmount;
                }

                await tx.transaction.create({
                    data: {
                        userId: req.user.userId,
                        assetId,
                        toAssetId: goal.targetAssetId,
                        type: 'TRANSFER',
                        amount: actualDeposit,
                        currency: sourceAsset.currency,
                        exchangeRate: rate,
                        targetAmount: targetCredit,
                        baseAmount,
                        description: `Goal funding transfer: ${goal.name}`,
                        date: new Date()
                    }
                });
            } else if (goal.targetAssetId && goal.targetAssetId === assetId) {
                // Same asset holds the funds — just log the earmarking
                await tx.transaction.create({
                    data: {
                        userId: req.user.userId,
                        assetId,
                        type: 'TRANSFER',
                        amount: actualDeposit,
                        currency: sourceAsset.currency,
                        exchangeRate: 1.0,
                        baseAmount: actualDeposit,
                        description: `Goal funding: ${goal.name}`,
                        date: new Date()
                    }
                });
            } else {
                await tx.asset.update({
                    where: { id: assetId },
                    data: { value: parseFloat(sourceAsset.value) - actualDeposit }
                });

                let baseAmount = actualDeposit;
                if (sourceAsset.currency !== userCurrency) {
                    const userConv = await convertAmount(actualDeposit, sourceAsset.currency, userCurrency);
                    baseAmount = userConv.convertedAmount;
                }

                await tx.transaction.create({
                    data: {
                        userId: req.user.userId,
                        assetId,
                        type: 'TRANSFER',
                        amount: actualDeposit,
                        currency: sourceAsset.currency,
                        exchangeRate: 1.0,
                        baseAmount,
                        description: `Goal funding: ${goal.name}`,
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
        const { name, targetAmount, currency, expectedDate, recurringAmount, recurringFrequency, isPinned, sourceAssetId, targetAssetId, imageUrls } = req.body;
        
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
                    ...(currency && { currency: currency.trim().toUpperCase() }),
                    ...(expectedDate && { expectedDate: new Date(expectedDate) }),
                    ...(recurringAmount !== undefined && { recurringAmount: recurringAmount ? parseFloat(recurringAmount) : null }),
                    ...(recurringFrequency !== undefined && { recurringFrequency: recurringFrequency ? recurringFrequency.toUpperCase() : null }),
                    ...(isPinned !== undefined && { isPinned: Boolean(isPinned) }),
                    ...(sourceAssetId !== undefined && { sourceAssetId: sourceAssetId || null }),
                    ...(targetAssetId !== undefined && { targetAssetId: targetAssetId || null }),
                    ...(imageUrls !== undefined || (req.files && req.files.length > 0) ? { imageUrls: urls } : {})
                }
            });

            return goal;
        });

        res.status(200).json({
            success: true,
            data: result
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

        const balance = parseFloat(goal.currentAmount) || 0;

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

                if (!holdingAsset || parseFloat(holdingAsset.value) <= 0) {
                    return res.status(400).json({
                        success: false,
                        error: `There is no money in the linked account (${holdingAsset?.name || 'Account'}) to process the refund.`
                    });
                }

                if (parseFloat(holdingAsset.value) < balance) {
                    return res.status(400).json({
                        success: false,
                        error: `Not enough money in ${holdingAsset.name} to refund the goal balance. Required: ${balance}, Available: ${holdingAsset.value}.`
                    });
                }

                await prisma.$transaction(async (tx) => {
                    await tx.goal.delete({ where: { id } });

                    if (goal.targetAssetId !== refundAssetId) {
                        // Transfer from holding asset to destination refund asset
                        await tx.asset.update({
                            where: { id: goal.targetAssetId },
                            data: { value: parseFloat(holdingAsset.value) - balance }
                        });

                        await tx.asset.update({
                            where: { id: refundAssetId },
                            data: { value: parseFloat(refundAsset.value) + balance }
                        });

                        await tx.transaction.create({
                            data: {
                                userId: req.user.userId,
                                assetId: goal.targetAssetId,
                                toAssetId: refundAssetId,
                                type: 'TRANSFER',
                                amount: balance,
                                description: `Refund transfer from deleted goal: ${goal.name}`,
                                date: new Date()
                            }
                        });
                    }
                });
            } else {
                // Goal funds were held in abstract goal pool (expense deduction)
                await prisma.$transaction(async (tx) => {
                    await tx.goal.delete({ where: { id } });

                    await tx.asset.update({
                        where: { id: refundAssetId },
                        data: { value: parseFloat(refundAsset.value) + balance }
                    });

                    await tx.transaction.create({
                        data: {
                            userId: req.user.userId,
                            assetId: refundAssetId,
                            type: 'INCOME',
                            amount: balance,
                            description: `Refund from deleted goal: ${goal.name}`,
                            date: new Date()
                        }
                    });
                });
            }
        } else {
            await prisma.goal.delete({ where: { id } });
        }

        res.status(200).json({ success: true, message: 'Goal deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
