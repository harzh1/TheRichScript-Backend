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
            return res.status(404).json({ success: false, error: 'Asset not found or unauthorized' });
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
            return res.status(404).json({ success: false, error: 'Asset not found or unauthorized' });
        }

        res.status(200).json({ success: true, message: 'Asset deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
