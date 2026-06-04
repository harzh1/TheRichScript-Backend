import prisma from '../config/db.js';

export const getTransactions = async (req, res) => {
    try {
        const { category, type, startDate, endDate, page = 1, limit = 50 } = req.query;

        const filters = { userId: req.user.userId };
        
        if (category) filters.category = category;
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
                orderBy: { date: 'desc' },
                skip,
                take
            }),
            prisma.transaction.count({ where: filters })
        ]);

        res.status(200).json({ 
            success: true, 
            data: transactions,
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
        const { assetId, type, amount, category, description, date } = req.body;
        const parsedAmount = parseFloat(amount);
        const receiptImageUrl = req.file ? req.file.path : null;

        if (!assetId || !type || !amount || !category) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create the transaction
            const transaction = await tx.transaction.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    type: type.toUpperCase(),
                    amount: parsedAmount,
                    category: category.toUpperCase(),
                    description: description || '',
                    date: new Date(date),
                    receiptImageUrl
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

            return transaction;
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
                await tx.transaction.delete({ where: { id } });
            });
        }

        res.status(200).json({ success: true, message: 'Transaction deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
