import prisma from '../config/db.js';
import { resolveCategoryId } from './category.controller.js';
import { resolveIncomeSourceId } from './incomeSource.controller.js';

export const getTransactions = async (req, res) => {
    try {
        const { category, type, startDate, endDate, page = 1, limit = 100 } = req.query;

        const filters = { userId: req.user.userId };
        
        if (category) filters.category = { name: category.toUpperCase() };
        if (type) filters.type = type;
        if (startDate && endDate) {
            filters.date = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

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
            category: tx.category.name,
            categoryId: tx.categoryId,
            incomeSource: tx.incomeSource ? tx.incomeSource.name : null,
            incomeSourceId: tx.incomeSourceId
        }));

        res.status(200).json({ 
            success: true, 
            data: flatTransactions,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / take)
            }
        });
    } catch (error) {
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
