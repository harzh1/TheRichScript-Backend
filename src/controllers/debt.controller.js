import prisma from '../config/db.js';

export const getDebts = async (req, res) => {
    try {
        const debts = await prisma.debt.findMany({
            where: { userId: req.user.userId }
        });
        res.status(200).json({ success: true, data: debts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createDebt = async (req, res) => {
    try {
        const { assetId, type, person, personName, amount, dueDate } = req.body;
        const parsedAmount = parseFloat(amount);

        const result = await prisma.$transaction(async (tx) => {
            const debt = await tx.debt.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    type: type.toUpperCase(),
                    personName: person || personName,
                    amount: parsedAmount,
                    ...(dueDate ? { dueDate: new Date(dueDate) } : {})
                }
            });

            // Adjust Asset Balance
            const asset = await tx.asset.findUnique({ where: { id: assetId } });
            if (asset) {
                const newBalance = type.toUpperCase() === 'LENT' 
                    ? asset.value - parsedAmount 
                    : asset.value + parsedAmount;
                
                await tx.asset.update({
                    where: { id: assetId },
                    data: { value: newBalance }
                });
            }

            return debt;
        });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const settleDebt = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, assetId } = req.body;
        const parsedAmount = parseFloat(amount);

        const result = await prisma.$transaction(async (tx) => {
            const debt = await tx.debt.findUnique({ where: { id, userId: req.user.userId } });
            if (!debt) throw new Error('Debt not found');

            const newSettledAmount = debt.settledAmount + parsedAmount;
            const status = newSettledAmount >= debt.amount ? 'SETTLED' : 'ACTIVE';

            const updatedDebt = await tx.debt.update({
                where: { id },
                data: { settledAmount: newSettledAmount, status }
            });

            const asset = await tx.asset.findUnique({ where: { id: assetId } });
            if (asset) {
                const newBalance = debt.type === 'LENT'
                    ? asset.value + parsedAmount
                    : asset.value - parsedAmount;
                
                await tx.asset.update({
                    where: { id: assetId },
                    data: { value: newBalance }
                });
            }

            return updatedDebt;
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const writeOffDebt = async (req, res) => {
    try {
        const { id } = req.params;

        const updatedDebt = await prisma.debt.updateMany({
            where: { id, userId: req.user.userId },
            data: { status: 'EXPIRED' }
        });

        if (updatedDebt.count === 0) {
            return res.status(404).json({ success: false, error: 'Debt not found' });
        }

        res.status(200).json({ success: true, message: 'Debt written off successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateDebt = async (req, res) => {
    try {
        const { id } = req.params;
        const { assetId, type, person, personName, amount, dueDate } = req.body;
        const parsedAmount = amount !== undefined ? parseFloat(amount) : undefined;

        const result = await prisma.$transaction(async (tx) => {
            const oldDebt = await tx.debt.findUnique({ where: { id, userId: req.user.userId } });
            if (!oldDebt) throw new Error('Debt not found');

            const finalPersonName = person || personName;
            
            // Revert old asset balance
            if (oldDebt.assetId) {
                const oldAsset = await tx.asset.findUnique({ where: { id: oldDebt.assetId } });
                if (oldAsset) {
                    const revertBalance = oldDebt.type === 'LENT' ? oldAsset.value + oldDebt.amount : oldAsset.value - oldDebt.amount;
                    await tx.asset.update({ where: { id: oldDebt.assetId }, data: { value: revertBalance } });
                }
            }

            // Apply new asset balance
            const newType = type ? type.toUpperCase() : oldDebt.type;
            const newAmount = parsedAmount !== undefined ? parsedAmount : oldDebt.amount;
            const newAssetId = assetId || oldDebt.assetId;

            if (newAssetId) {
                const newAsset = await tx.asset.findUnique({ where: { id: newAssetId } });
                if (newAsset) {
                    const newBalance = newType === 'LENT' ? newAsset.value - newAmount : newAsset.value + newAmount;
                    await tx.asset.update({ where: { id: newAssetId }, data: { value: newBalance } });
                }
            }

            const updatedDebt = await tx.debt.update({
                where: { id },
                data: {
                    ...(newAssetId && { assetId: newAssetId }),
                    ...(newType && { type: newType }),
                    ...(finalPersonName && { personName: finalPersonName }),
                    ...(newAmount !== undefined && { amount: newAmount }),
                    ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {})
                }
            });

            return updatedDebt;
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
