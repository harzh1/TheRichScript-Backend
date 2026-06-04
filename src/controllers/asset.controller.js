import prisma from '../config/db.js';

export const getAssets = async (req, res) => {
    try {
        const assets = await prisma.asset.findMany({
            where: { userId: req.user.userId }
        });
        res.status(200).json({ success: true, data: assets });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createAsset = async (req, res) => {
    try {
        const { name, type, value, quantity } = req.body;
        
        const asset = await prisma.asset.create({
            data: {
                userId: req.user.userId,
                name,
                type,
                value: parseFloat(value) || 0,
                quantity: quantity ? parseFloat(quantity) : null
            }
        });

        res.status(201).json({ success: true, data: asset });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, value, quantity } = req.body;

        const asset = await prisma.asset.updateMany({
            where: { id, userId: req.user.userId },
            data: {
                ...(name && { name }),
                ...(value !== undefined && { value: parseFloat(value) }),
                ...(quantity !== undefined && { quantity: quantity ? parseFloat(quantity) : null })
            }
        });

        if (asset.count === 0) {
            return res.status(404).json({ success: false, error: 'Asset not found or already deleted' });
        }

        const updatedAsset = await prisma.asset.findUnique({ where: { id } });
        res.status(200).json({ success: true, data: updatedAsset });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteAsset = async (req, res) => {
    try {
        const { id } = req.params;
        
        const deleted = await prisma.asset.deleteMany({
            where: { id, userId: req.user.userId }
        });

        if (deleted.count === 0) {
            return res.status(404).json({ success: false, error: 'Asset not found or already deleted' });
        }

        res.status(200).json({ success: true, message: 'Asset deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getAssetTypes = async (req, res) => {
    try {
        // Find distinct asset types for the user
        const assets = await prisma.asset.findMany({
            where: { userId: req.user.userId },
            select: { type: true },
            distinct: ['type']
        });
        const types = assets.map(a => a.type).filter(Boolean);
        res.status(200).json({ success: true, data: types });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const transferAsset = async (req, res) => {
    try {
        const { fromAssetId, toAssetId, amount, date, description, category } = req.body;
        const transferAmount = parseFloat(amount);

        if (fromAssetId === toAssetId) {
            return res.status(400).json({ success: false, error: 'Source and destination assets must be different' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const fromAsset = await tx.asset.findUnique({ where: { id: fromAssetId, userId: req.user.userId } });
            const toAsset = await tx.asset.findUnique({ where: { id: toAssetId, userId: req.user.userId } });

            if (!fromAsset || !toAsset) {
                throw new Error('One or both assets not found');
            }

            if (fromAsset.value < transferAmount) {
                throw new Error('Insufficient funds in source asset');
            }

            // Update balances
            await tx.asset.update({
                where: { id: fromAssetId },
                data: { value: fromAsset.value - transferAmount }
            });

            await tx.asset.update({
                where: { id: toAssetId },
                data: { value: toAsset.value + transferAmount }
            });

            const transferDate = date ? new Date(date) : new Date();
            const transferDesc = description || `Transfer to ${toAsset.name}`;

            // Create a SINGLE transfer transaction for the ledger
            const transaction = await tx.transaction.create({
                data: {
                    userId: req.user.userId,
                    assetId: fromAssetId,
                    toAssetId: toAssetId,
                    type: 'TRANSFER',
                    amount: transferAmount,
                    category: category ? category.toUpperCase() : 'TRANSFER',
                    description: transferDesc,
                    date: transferDate
                }
            });

            return transaction;
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        if (error.message === 'One or both assets not found' || error.message === 'Insufficient funds in source asset') {
            return res.status(400).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};
