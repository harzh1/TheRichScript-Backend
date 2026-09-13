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
        const { assetId, type, person, personName, amount, dueDate, contactId, notes } = req.body;
        const parsedAmount = parseFloat(amount);

        const result = await prisma.$transaction(async (tx) => {
            const debt = await tx.debt.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    type: type.toUpperCase(),
                    personName: person || personName,
                    amount: parsedAmount,
                    ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
                    ...(contactId && { contactId }),
                    ...(notes && { notes })
                }
            });

            // Adjust Asset Balance
            const asset = await tx.asset.findUnique({ where: { id: assetId } });
            if (asset) {
                const newBalance = type.toUpperCase() === 'LENT' 
                    ? parseFloat(asset.value) - parsedAmount 
                    : parseFloat(asset.value) + parsedAmount;
                
                await tx.asset.update({
                    where: { id: assetId },
                    data: { value: newBalance }
                });
            }

            // Create Ledger Transaction
            const txDescription = type.toUpperCase() === 'LENT' ? `Lent to ${debt.personName}` : `Borrowed from ${debt.personName}`;

            await tx.transaction.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    type: type.toUpperCase() === 'LENT' ? 'EXPENSE' : 'INCOME',
                    amount: parsedAmount,
                    description: txDescription,
                    date: debt.createdAt,
                    linkedDebtId: debt.id,
                    linkedDebtAction: 'CREATE'
                }
            });

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
            if (debt.status === 'SETTLED') throw new Error('Debt is already fully settled');
            if (debt.status === 'EXPIRED') throw new Error('Cannot settle a written-off debt');
            if (parsedAmount > (parseFloat(debt.amount) - parseFloat(debt.settledAmount))) throw new Error('Settle amount exceeds remaining balance');

            const newSettledAmount = parseFloat(debt.settledAmount) + parsedAmount;
            const status = newSettledAmount >= parseFloat(debt.amount) ? 'SETTLED' : 'ACTIVE';

            const updatedDebt = await tx.debt.update({
                where: { id },
                data: { settledAmount: newSettledAmount, status }
            });

            const asset = await tx.asset.findUnique({ where: { id: assetId } });
            if (asset) {
                const newBalance = debt.type === 'LENT'
                    ? parseFloat(asset.value) + parsedAmount
                    : parseFloat(asset.value) - parsedAmount;
                
                await tx.asset.update({
                    where: { id: assetId },
                    data: { value: newBalance }
                });
            }

            // Create Ledger Transaction for Settlement
            const txDescription = debt.type === 'LENT' ? `Repayment from ${debt.personName}` : `Repayment to ${debt.personName}`;

            await tx.transaction.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    type: debt.type === 'LENT' ? 'INCOME' : 'EXPENSE',
                    amount: parsedAmount,
                    description: txDescription,
                    date: new Date(),
                    linkedDebtId: debt.id,
                    linkedDebtAction: 'SETTLE'
                }
            });

            return updatedDebt;
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        if (error.message === 'Debt is already fully settled' || error.message === 'Cannot settle a written-off debt' || error.message === 'Settle amount exceeds remaining balance' || error.message === 'Debt not found') {
            return res.status(400).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

export const writeOffDebt = async (req, res) => {
    try {
        const { id } = req.params;

        const debt = await prisma.debt.findUnique({
            where: { id, userId: req.user.userId }
        });

        if (!debt) {
            return res.status(404).json({ success: false, error: 'Debt not found' });
        }

        if (debt.status === 'EXPIRED') {
            return res.status(400).json({ success: false, error: 'Debt was already written off' });
        }
        if (debt.status === 'SETTLED') {
            return res.status(400).json({ success: false, error: 'Cannot write off a fully settled debt' });
        }

        const updatedDebt = await prisma.debt.update({
            where: { id },
            data: { status: 'EXPIRED' }
        });

        res.status(200).json({ success: true, message: 'Debt written off successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateDebt = async (req, res) => {
    try {
        const { id } = req.params;
        const { assetId, type, person, personName, amount, dueDate, contactId, notes } = req.body;
        const parsedAmount = amount !== undefined ? parseFloat(amount) : undefined;

        const result = await prisma.$transaction(async (tx) => {
            const oldDebt = await tx.debt.findUnique({ where: { id, userId: req.user.userId } });
            if (!oldDebt) throw new Error('Debt not found');

            const finalPersonName = person || personName;
            
            // Revert old asset balance
            if (oldDebt.assetId) {
                const oldAsset = await tx.asset.findUnique({ where: { id: oldDebt.assetId } });
                if (oldAsset) {
                    const revertBalance = oldDebt.type === 'LENT' ? parseFloat(oldAsset.value) + parseFloat(oldDebt.amount) : parseFloat(oldAsset.value) - parseFloat(oldDebt.amount);
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
                    const newBalance = newType === 'LENT' ? parseFloat(newAsset.value) - newAmount : parseFloat(newAsset.value) + newAmount;
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
                    ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
                    ...(contactId !== undefined && { contactId: contactId || null }),
                    ...(notes !== undefined && { notes: notes || null })
                }
            });

            return updatedDebt;
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
