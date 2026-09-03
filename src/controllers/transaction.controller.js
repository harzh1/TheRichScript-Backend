import prisma from '../config/db.js';
import { resolveCategoryId } from './category.controller.js';
import { resolveIncomeSourceId } from './incomeSource.controller.js';

export const getTransactions = async (req, res) => {
    try {
        const { category, type, startDate, endDate, page = 1, limit = 30, search } = req.query;

        const filters = { userId: req.user.userId };
        
        if (category && category !== 'ALL') {
            filters.category = { name: category.toUpperCase() };
        }
        if (type && type !== 'ALL') {
            filters.type = type.toUpperCase();
        }
        if (startDate || endDate) {
            filters.date = {};
            if (startDate) filters.date.gte = new Date(startDate);
            if (endDate) filters.date.lte = new Date(endDate);
        }
        if (search && search.trim()) {
            const query = search.trim();
            filters.OR = [
                { description: { contains: query, mode: 'insensitive' } },
                { category: { name: { contains: query, mode: 'insensitive' } } }
            ];
        }

        const parsedPage = Math.max(1, parseInt(page) || 1);
        const parsedLimit = Math.min(200, Math.max(1, parseInt(limit) || 30));
        const skip = (parsedPage - 1) * parsedLimit;
        const take = parsedLimit;

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where: filters,
                include: {
                    category: true,
                    incomeSource: true
                },
                orderBy: [
                    { date: 'desc' },
                    { createdAt: 'desc' }
                ],
                skip,
                take
            }),
            prisma.transaction.count({ where: filters })
        ]);

        // Flatten category & incomeSource objects for frontend compatibility
        const flatTransactions = transactions.map(tx => ({
            ...tx,
            category: tx.category ? tx.category.name : '',
            categoryId: tx.categoryId,
            incomeSource: tx.incomeSource ? tx.incomeSource.name : null,
            incomeSourceId: tx.incomeSourceId
        }));

        res.status(200).json({ 
            success: true, 
            data: flatTransactions,
            meta: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                totalPages: Math.ceil(total / take),
                hasMore: (skip + flatTransactions.length) < total
            }
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createTransaction = async (req, res) => {
    try {
        const { assetId, type, amount, category, description, date, incomeSourceId, incomeSource } = req.body;
        const parsedAmount = parseFloat(amount);
        const receiptImageUrl = req.file ? req.file.path : null;

        if (!assetId || !type || !amount || !category) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Resolve category name → id (auto-creates if needed)
            const categoryId = await resolveCategoryId(tx, req.user.userId, category);

            // If income, resolve income source ID
            let resolvedIncomeSourceId = null;
            if (type.toUpperCase() === 'INCOME') {
                resolvedIncomeSourceId = await resolveIncomeSourceId(
                    tx,
                    req.user.userId,
                    incomeSourceId || incomeSource
                );
            }

            // 1. Create the transaction
            const transaction = await tx.transaction.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    type: type.toUpperCase(),
                    amount: parsedAmount,
                    categoryId,
                    incomeSourceId: resolvedIncomeSourceId,
                    description: description || '',
                    date: new Date(date),
                    receiptImageUrl
                },
                include: {
                    category: true,
                    incomeSource: true
                }
            });

            // 2. Adjust Asset Balance
            const asset = await tx.asset.findUnique({ where: { id: assetId, userId: req.user.userId } });
            
            if (!asset) {
                throw new Error('Asset not found or already deleted');
            }

            if (type.toUpperCase() === 'EXPENSE' && asset.value < parsedAmount) {
                throw new Error('Insufficient funds in the selected asset');
            }

            const newBalance = type.toUpperCase() === 'INCOME' 
                ? asset.value + parsedAmount 
                : asset.value - parsedAmount;

            await tx.asset.update({
                where: { id: assetId },
                data: { value: newBalance }
            });

            return {
                ...transaction,
                category: transaction.category.name,
                categoryId: transaction.categoryId,
                incomeSource: transaction.incomeSource ? transaction.incomeSource.name : null,
                incomeSourceId: transaction.incomeSourceId
            };
        });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error('TRANSACTION ERROR:', error);
        if (error.message === 'Asset not found or already deleted' || error.message === 'Insufficient funds in the selected asset') {
            return res.status(400).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { assetId, type, amount, category, description, date, incomeSourceId, incomeSource } = req.body;
        const receiptImageUrl = req.file ? req.file.path : (req.body.receiptImageUrl || undefined);

        const existingTx = await prisma.transaction.findUnique({
            where: { id, userId: req.user.userId }
        });

        if (!existingTx) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const newType = (type || existingTx.type).toUpperCase();
        const newAmount = amount !== undefined ? parseFloat(amount) : existingTx.amount;
        const newAssetId = assetId || existingTx.assetId;
        const newDate = date ? new Date(date) : existingTx.date;
        const newDescription = description !== undefined ? description : existingTx.description;

        const result = await prisma.$transaction(async (tx) => {
            // 1. Revert old transaction balance impact from the old asset
            const oldAsset = await tx.asset.findUnique({ where: { id: existingTx.assetId } });
            if (!oldAsset) {
                throw new Error('Original associated asset not found');
            }

            if (existingTx.type === 'TRANSFER') {
                if (existingTx.toAssetId) {
                    const oldTargetAsset = await tx.asset.findUnique({ where: { id: existingTx.toAssetId } });
                    if (oldTargetAsset) {
                        await tx.asset.update({
                            where: { id: existingTx.assetId },
                            data: { value: oldAsset.value + existingTx.amount }
                        });
                        await tx.asset.update({
                            where: { id: existingTx.toAssetId },
                            data: { value: oldTargetAsset.value - existingTx.amount }
                        });
                    }
                }
            } else if (existingTx.type === 'INCOME') {
                await tx.asset.update({
                    where: { id: existingTx.assetId },
                    data: { value: oldAsset.value - existingTx.amount }
                });
            } else { // EXPENSE
                await tx.asset.update({
                    where: { id: existingTx.assetId },
                    data: { value: oldAsset.value + existingTx.amount }
                });
            }

            // 2. Resolve category & incomeSource if provided
            let categoryId = existingTx.categoryId;
            if (category) {
                categoryId = await resolveCategoryId(tx, req.user.userId, category);
            }

            let resolvedIncomeSourceId = existingTx.incomeSourceId;
            if (newType === 'INCOME' && (incomeSourceId || incomeSource)) {
                resolvedIncomeSourceId = await resolveIncomeSourceId(
                    tx,
                    req.user.userId,
                    incomeSourceId || incomeSource
                );
            } else if (newType !== 'INCOME') {
                resolvedIncomeSourceId = null;
            }

            // 3. Fetch current state of target asset
            const targetAsset = await tx.asset.findUnique({ where: { id: newAssetId, userId: req.user.userId } });
            if (!targetAsset) {
                throw new Error('Selected asset not found');
            }

            if (newType === 'EXPENSE' && targetAsset.value < newAmount) {
                throw new Error('Insufficient funds in the selected asset');
            }

            const updatedAssetBalance = newType === 'INCOME'
                ? targetAsset.value + newAmount
                : targetAsset.value - newAmount;

            await tx.asset.update({
                where: { id: newAssetId },
                data: { value: updatedAssetBalance }
            });

            // 4. Update the transaction record
            const updatedTx = await tx.transaction.update({
                where: { id },
                data: {
                    assetId: newAssetId,
                    type: newType,
                    amount: newAmount,
                    categoryId,
                    incomeSourceId: resolvedIncomeSourceId,
                    description: newDescription,
                    date: newDate,
                    ...(receiptImageUrl !== undefined ? { receiptImageUrl } : {})
                },
                include: {
                    category: true,
                    incomeSource: true
                }
            });

            return {
                ...updatedTx,
                category: updatedTx.category ? updatedTx.category.name : '',
                categoryId: updatedTx.categoryId,
                incomeSource: updatedTx.incomeSource ? updatedTx.incomeSource.name : null,
                incomeSourceId: updatedTx.incomeSourceId
            };
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error('UPDATE TRANSACTION ERROR:', error);
        if (error.message === 'Insufficient funds in the selected asset' || error.message === 'Selected asset not found' || error.message === 'Original associated asset not found') {
            return res.status(400).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteTransaction = async (req, res) => {
    try {
        const { id } = req.params;

        const transaction = await prisma.transaction.findUnique({
            where: { id, userId: req.user.userId }
        });

        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Unable to delete: Transaction not found.' });
        }

        const asset = await prisma.asset.findUnique({ where: { id: transaction.assetId } });
        if (!asset) {
            return res.status(400).json({ success: false, error: 'Unable to delete: The associated asset no longer exists.' });
        }

        if (transaction.type === 'TRANSFER') {
            if (!transaction.toAssetId) {
                return res.status(400).json({ success: false, error: 'Unable to delete: Transfer transaction missing target asset.' });
            }
            const targetAsset = await prisma.asset.findUnique({ where: { id: transaction.toAssetId } });
            if (!targetAsset) {
                return res.status(400).json({ success: false, error: 'Unable to delete: The target asset no longer exists.' });
            }
            if (targetAsset.value < transaction.amount) {
                return res.status(400).json({ success: false, error: 'Unable to delete: Reverting this transfer would result in a negative target asset balance.' });
            }

            await prisma.$transaction(async (tx) => {
                await tx.asset.update({
                    where: { id: transaction.assetId },
                    data: { value: asset.value + transaction.amount }
                });
                await tx.asset.update({
                    where: { id: transaction.toAssetId },
                    data: { value: targetAsset.value - transaction.amount }
                });
                await tx.transaction.delete({ where: { id } });
            });
        } else {
            const revertedBalance = transaction.type === 'INCOME'
                ? asset.value - transaction.amount
                : asset.value + transaction.amount;
            
            if (transaction.type === 'INCOME' && revertedBalance < 0) {
                return res.status(400).json({ success: false, error: 'Unable to delete: Reverting this income would result in a negative asset balance.' });
            }

            await prisma.$transaction(async (tx) => {
                await tx.asset.update({
                    where: { id: transaction.assetId },
                    data: { value: revertedBalance }
                });
                
                if (transaction.linkedDebtId) {
                    const debt = await tx.debt.findUnique({ where: { id: transaction.linkedDebtId } });
                    if (debt) {
                        if (transaction.linkedDebtAction === 'CREATE') {
                            await tx.debt.delete({ where: { id: debt.id } });
                        } else if (transaction.linkedDebtAction === 'SETTLE') {
                            const newSettledAmount = Math.max(0, debt.settledAmount - transaction.amount);
                            await tx.debt.update({
                                where: { id: debt.id },
                                data: {
                                    settledAmount: newSettledAmount,
                                    status: 'ACTIVE'
                                }
                            });
                        }
                    }
                }

                await tx.transaction.delete({ where: { id } });
            });
        }

        res.status(200).json({ success: true, message: 'Transaction deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
