import prisma from '../config/db.js';
import { convertAmount } from '../services/fx.service.js';

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
        const { assetId, type, person, personName, amount, currency, exchangeRate, dueDate, contactId, notes } = req.body;
        const parsedAmount = parseFloat(amount);

        const result = await prisma.$transaction(async (tx) => {
            const asset = await tx.asset.findUnique({ where: { id: assetId } });
            if (!asset) throw new Error('Asset not found');

            const user = await tx.user.findUnique({ where: { id: req.user.userId }, select: { currency: true } });
            const userCurrency = user?.currency || 'INR';

            const debtCurrency = currency ? currency.trim().toUpperCase() : asset.currency;

            // Compute impact on asset in asset's native currency
            let assetImpact = parsedAmount;
            let finalRate = 1.0;

            if (debtCurrency !== asset.currency) {
                const conv = await convertAmount(parsedAmount, debtCurrency, asset.currency, exchangeRate);
                assetImpact = conv.convertedAmount;
                finalRate = conv.exchangeRate;
            }

            const debt = await tx.debt.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    type: type.toUpperCase(),
                    personName: person || personName,
                    amount: parsedAmount,
                    currency: debtCurrency,
                    ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
                    ...(contactId && { contactId }),
                    ...(notes && { notes })
                }
            });

            // Adjust Asset Balance in asset's native currency
            const newBalance = type.toUpperCase() === 'LENT' 
                ? parseFloat(asset.value) - assetImpact 
                : parseFloat(asset.value) + assetImpact;
            
            await tx.asset.update({
                where: { id: assetId },
                data: { value: newBalance }
            });

            // Compute baseAmount in user's reporting currency
            let baseAmount = parsedAmount;
            if (debtCurrency !== userCurrency) {
                const userConv = await convertAmount(parsedAmount, debtCurrency, userCurrency);
                baseAmount = userConv.convertedAmount;
            }

            // Create Ledger Transaction
            const txDescription = type.toUpperCase() === 'LENT' ? `Lent to ${debt.personName}` : `Borrowed from ${debt.personName}`;

            await tx.transaction.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    type: type.toUpperCase() === 'LENT' ? 'EXPENSE' : 'INCOME',
                    amount: parsedAmount,
                    currency: debtCurrency,
                    exchangeRate: finalRate,
                    baseAmount,
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
        if (error.message === 'Asset not found') {
            return res.status(400).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

export const settleDebt = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, assetId, settleAssetAmount, exchangeRate } = req.body;
        const parsedAmount = parseFloat(amount);

        const result = await prisma.$transaction(async (tx) => {
            const debt = await tx.debt.findUnique({ where: { id, userId: req.user.userId } });
            if (!debt) throw new Error('Debt not found');
            if (debt.status === 'SETTLED') throw new Error('Debt is already fully settled');
            if (debt.status === 'EXPIRED') throw new Error('Cannot settle a written-off debt');
            if (parsedAmount > (parseFloat(debt.amount) - parseFloat(debt.settledAmount))) throw new Error('Settle amount exceeds remaining balance');

            const asset = await tx.asset.findUnique({ where: { id: assetId } });
            if (!asset) throw new Error('Asset not found');

            const user = await tx.user.findUnique({ where: { id: req.user.userId }, select: { currency: true } });
            const userCurrency = user?.currency || 'INR';

            // Calculate settlement asset impact
            let assetImpact = parsedAmount;
            let finalRate = 1.0;

            if (debt.currency !== asset.currency) {
                if (settleAssetAmount !== undefined && settleAssetAmount !== null) {
                    assetImpact = parseFloat(settleAssetAmount);
                    finalRate = exchangeRate ? parseFloat(exchangeRate) : parseFloat((assetImpact / parsedAmount).toFixed(6));
                } else if (exchangeRate !== undefined && exchangeRate !== null) {
                    finalRate = parseFloat(exchangeRate);
                    assetImpact = parseFloat((parsedAmount * finalRate).toFixed(4));
                } else {
                    const conv = await convertAmount(parsedAmount, debt.currency, asset.currency);
                    assetImpact = conv.convertedAmount;
                    finalRate = conv.exchangeRate;
                }
            }

            const newSettledAmount = parseFloat(debt.settledAmount) + parsedAmount;
            const status = newSettledAmount >= parseFloat(debt.amount) ? 'SETTLED' : 'ACTIVE';

            const updatedDebt = await tx.debt.update({
                where: { id },
                data: { settledAmount: newSettledAmount, status }
            });

            // Adjust asset balance in asset currency
            const newBalance = debt.type === 'LENT'
                ? parseFloat(asset.value) + assetImpact
                : parseFloat(asset.value) - assetImpact;
            
            await tx.asset.update({
                where: { id: assetId },
                data: { value: newBalance }
            });

            // Compute baseAmount in user's reporting currency
            let baseAmount = parsedAmount;
            if (debt.currency !== userCurrency) {
                const userConv = await convertAmount(parsedAmount, debt.currency, userCurrency);
                baseAmount = userConv.convertedAmount;
            }

            // Create Ledger Transaction for Settlement
            const txDescription = debt.type === 'LENT' ? `Repayment from ${debt.personName}` : `Repayment to ${debt.personName}`;

            await tx.transaction.create({
                data: {
                    userId: req.user.userId,
                    assetId,
                    type: debt.type === 'LENT' ? 'INCOME' : 'EXPENSE',
                    amount: parsedAmount,
                    currency: debt.currency,
                    exchangeRate: finalRate,
                    baseAmount,
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
        if (error.message === 'Debt is already fully settled' || error.message === 'Cannot settle a written-off debt' || error.message === 'Settle amount exceeds remaining balance' || error.message === 'Debt not found' || error.message === 'Asset not found') {
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
        const { assetId, type, person, personName, amount, currency, dueDate, contactId, notes } = req.body;
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
                    ...(currency && { currency: currency.trim().toUpperCase() }),
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
