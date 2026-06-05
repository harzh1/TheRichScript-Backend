import prisma from '../config/db.js';

/**
 * Helper: Resolves an asset type name to its UserAssetType id,
 * creating the UserAssetType if it doesn't exist.
 */
const resolveAssetTypeId = async (tx, userId, typeName) => {
    const existing = await tx.userAssetType.findUnique({
        where: { userId_name: { userId, name: typeName } }
    });

    if (existing) return existing.id;

    const created = await tx.userAssetType.create({
        data: { userId, name: typeName }
    });

    return created.id;
};

export const getAssets = async (req, res) => {
    try {
        const assets = await prisma.asset.findMany({
            where: { userId: req.user.userId },
            include: { assetType: true }
        });

        // Flatten type for frontend compatibility
        const flatAssets = assets.map(asset => ({
            ...asset,
            type: asset.assetType.name,
            typeId: asset.typeId
        }));

        res.status(200).json({ success: true, data: flatAssets });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createAsset = async (req, res) => {
    try {
        const { name, type, value, quantity } = req.body;
        
        const asset = await prisma.$transaction(async (tx) => {
            const typeId = await resolveAssetTypeId(tx, req.user.userId, type);

            return tx.asset.create({
                data: {
                    userId: req.user.userId,
                    name,
                    typeId,
                    value: parseFloat(value) || 0,
                    quantity: quantity ? parseFloat(quantity) : null
                },
                include: { assetType: true }
            });
        });

        res.status(201).json({
            success: true,
            data: { ...asset, type: asset.assetType.name, typeId: asset.typeId }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, value, quantity, type } = req.body;

        const result = await prisma.$transaction(async (tx) => {
            const updateData = {};

            if (name) updateData.name = name;
            if (value !== undefined) updateData.value = parseFloat(value);
            if (quantity !== undefined) updateData.quantity = quantity ? parseFloat(quantity) : null;
            if (type) {
                updateData.typeId = await resolveAssetTypeId(tx, req.user.userId, type);
            }

            const asset = await tx.asset.updateMany({
                where: { id, userId: req.user.userId },
                data: updateData
            });

            if (asset.count === 0) {
                throw new Error('Asset not found or already deleted');
            }

            return tx.asset.findUnique({
                where: { id },
                include: { assetType: true }
            });
        });

        res.status(200).json({
            success: true,
            data: { ...result, type: result.assetType.name, typeId: result.typeId }
        });
    } catch (error) {
        if (error.message === 'Asset not found or already deleted') {
            return res.status(404).json({ success: false, error: error.message });
        }
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
        const types = await prisma.userAssetType.findMany({
            where: { userId: req.user.userId },
            orderBy: { name: 'asc' }
        });
        res.status(200).json({ success: true, data: types.map(t => t.name) });
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

            // Resolve category
            const { resolveCategoryId } = await import('./category.controller.js');
            const categoryId = await resolveCategoryId(tx, req.user.userId, category || 'TRANSFER');

            // Create a SINGLE transfer transaction for the ledger
            const transaction = await tx.transaction.create({
                data: {
                    userId: req.user.userId,
                    assetId: fromAssetId,
                    toAssetId: toAssetId,
                    type: 'TRANSFER',
                    amount: transferAmount,
                    categoryId,
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
