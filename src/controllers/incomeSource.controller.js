import prisma from '../config/db.js';

/**
 * Helper to ensure a default "Others" income source exists for a user and return it.
 */
export async function getOrCreateDefaultIncomeSource(txOrPrisma, userId) {
    let defaultSource = await txOrPrisma.incomeSource.findFirst({
        where: { userId, name: { equals: 'Others', mode: 'insensitive' } }
    });

    if (!defaultSource) {
        defaultSource = await txOrPrisma.incomeSource.create({
            data: {
                userId,
                name: 'Others',
                type: 'ACTIVE',
                isFixed: false,
                description: 'Default income source for uncategorized inflows'
            }
        });
    }

    return defaultSource;
}

/**
 * Helper to resolve an incomeSourceId from either an ID or a Name.
 */
export async function resolveIncomeSourceId(txOrPrisma, userId, sourceIdOrName) {
    if (!sourceIdOrName) {
        const defaultSource = await getOrCreateDefaultIncomeSource(txOrPrisma, userId);
        return defaultSource.id;
    }

    // Try finding by direct ID first
    let source = await txOrPrisma.incomeSource.findFirst({
        where: { id: sourceIdOrName, userId }
    });

    if (source) return source.id;

    // Try finding by name
    source = await txOrPrisma.incomeSource.findFirst({
        where: { userId, name: { equals: sourceIdOrName.trim(), mode: 'insensitive' } }
    });

    if (source) return source.id;

    // Auto-create new income source if named
    const created = await txOrPrisma.incomeSource.create({
        data: {
            userId,
            name: sourceIdOrName.trim(),
            type: 'ACTIVE',
            isFixed: true
        }
    });

    return created.id;
}

/**
 * GET /api/income-sources
 * List all income sources for the authenticated user with aggregated transaction totals.
 */
export const getIncomeSources = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Auto-ensure default "Others" source exists
        await getOrCreateDefaultIncomeSource(prisma, userId);

        // Fetch income sources with their default asset and transactions
        const sources = await prisma.incomeSource.findMany({
            where: { userId },
            include: {
                defaultAsset: {
                    select: { id: true, name: true }
                },
                transactions: {
                    select: {
                        amount: true,
                        date: true
                    },
                    orderBy: { date: 'desc' }
                }
            },
            orderBy: [
                { isActive: 'desc' },
                { createdAt: 'asc' }
            ]
        });

        // Backfill any historical orphan INCOME transactions to the default "Others" source
        const defaultSource = sources.find(s => s.name.toLowerCase() === 'others');
        if (defaultSource) {
            await prisma.transaction.updateMany({
                where: {
                    userId,
                    type: 'INCOME',
                    incomeSourceId: null
                },
                data: {
                    incomeSourceId: defaultSource.id
                }
            });
        }

        // Map and compute stats for each source
        const mappedSources = sources.map(source => {
            const totalReceived = source.transactions.reduce((acc, t) => acc + t.amount, 0);
            const transactionCount = source.transactions.length;
            const lastReceivedDate = source.transactions.length > 0 ? source.transactions[0].date : null;

            return {
                id: source.id,
                userId: source.userId,
                name: source.name,
                type: source.type,
                isFixed: source.isFixed,
                expectedAmount: source.expectedAmount || 0,
                frequency: source.frequency,
                defaultAssetId: source.defaultAssetId,
                defaultAssetName: source.defaultAsset ? source.defaultAsset.name : null,
                description: source.description || '',
                iconUrl: source.iconUrl,
                isActive: source.isActive,
                totalReceived,
                transactionCount,
                lastReceivedDate,
                createdAt: source.createdAt,
                updatedAt: source.updatedAt
            };
        });

        res.status(200).json({ success: true, data: mappedSources });
    } catch (error) {
        console.error('[getIncomeSources Error]', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/income-sources/summary
 * Aggregated summary of active vs passive streams and expected monthly inflow.
 */
export const getIncomeSourcesSummary = async (req, res) => {
    try {
        const userId = req.user.userId;

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        const [sources, monthInflow, yearInflow] = await Promise.all([
            prisma.incomeSource.findMany({
                where: { userId }
            }),
            prisma.transaction.aggregate({
                _sum: { amount: true },
                where: {
                    userId,
                    type: 'INCOME',
                    date: { gte: startOfMonth }
                }
            }),
            prisma.transaction.aggregate({
                _sum: { amount: true },
                where: {
                    userId,
                    type: 'INCOME',
                    date: { gte: startOfYear }
                }
            })
        ]);

        let totalActiveExpectedMonthly = 0;
        let totalPassiveExpectedMonthly = 0;
        let activeSourcesCount = 0;
        let passiveSourcesCount = 0;

        for (const source of sources) {
            if (!source.isActive) continue;

            let monthlyEquiv = 0;
            const amt = source.expectedAmount || 0;
            switch (source.frequency) {
                case 'DAILY': monthlyEquiv = amt * 30; break;
                case 'WEEKLY': monthlyEquiv = amt * 4.33; break;
                case 'MONTHLY': monthlyEquiv = amt; break;
                case 'YEARLY': monthlyEquiv = amt / 12; break;
                default: monthlyEquiv = amt; break;
            }

            if (source.type === 'PASSIVE') {
                totalPassiveExpectedMonthly += monthlyEquiv;
                passiveSourcesCount++;
            } else {
                totalActiveExpectedMonthly += monthlyEquiv;
                activeSourcesCount++;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                totalActiveExpectedMonthly,
                totalPassiveExpectedMonthly,
                totalExpectedMonthly: totalActiveExpectedMonthly + totalPassiveExpectedMonthly,
                totalReceivedThisMonth: monthInflow._sum.amount || 0,
                totalReceivedThisYear: yearInflow._sum.amount || 0,
                totalSourcesCount: sources.length,
                activeSourcesCount,
                passiveSourcesCount
            }
        });
    } catch (error) {
        console.error('[getIncomeSourcesSummary Error]', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/income-sources
 * Create a new income source.
 */
export const createIncomeSource = async (req, res) => {
    try {
        const userId = req.user.userId;
        const {
            name,
            type,
            isFixed,
            expectedAmount,
            frequency,
            defaultAssetId,
            description,
            iconUrl
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Income source name is required' });
        }

        const uploadedUrl = req.file ? req.file.path : (iconUrl || null);

        const newSource = await prisma.incomeSource.create({
            data: {
                userId,
                name: name.trim(),
                type: type === 'PASSIVE' ? 'PASSIVE' : 'ACTIVE',
                isFixed: isFixed !== undefined ? Boolean(isFixed) : true,
                expectedAmount: expectedAmount ? parseFloat(expectedAmount) : null,
                frequency: frequency || null,
                defaultAssetId: defaultAssetId || null,
                description: description ? description.trim() : null,
                iconUrl: uploadedUrl,
                isActive: true
            },
            include: {
                defaultAsset: {
                    select: { id: true, name: true }
                }
            }
        });

        res.status(201).json({
            success: true,
            data: {
                ...newSource,
                defaultAssetName: newSource.defaultAsset ? newSource.defaultAsset.name : null,
                totalReceived: 0,
                transactionCount: 0,
                lastReceivedDate: null
            }
        });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ success: false, error: 'An income source with this name already exists' });
        }
        console.error('[createIncomeSource Error]', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * PUT /api/income-sources/:id
 * Update an existing income source.
 */
export const updateIncomeSource = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const {
            name,
            type,
            isFixed,
            expectedAmount,
            frequency,
            defaultAssetId,
            description,
            iconUrl,
            isActive
        } = req.body;

        const existing = await prisma.incomeSource.findFirst({
            where: { id, userId }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Income source not found' });
        }

        const uploadedUrl = req.file ? req.file.path : (iconUrl !== undefined ? iconUrl : existing.iconUrl);

        const updated = await prisma.incomeSource.update({
            where: { id },
            data: {
                name: name !== undefined ? name.trim() : existing.name,
                type: type !== undefined ? (type === 'PASSIVE' ? 'PASSIVE' : 'ACTIVE') : existing.type,
                isFixed: isFixed !== undefined ? Boolean(isFixed) : existing.isFixed,
                expectedAmount: expectedAmount !== undefined ? (expectedAmount ? parseFloat(expectedAmount) : null) : existing.expectedAmount,
                frequency: frequency !== undefined ? frequency : existing.frequency,
                defaultAssetId: defaultAssetId !== undefined ? defaultAssetId : existing.defaultAssetId,
                description: description !== undefined ? description.trim() : existing.description,
                iconUrl: uploadedUrl,
                isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive
            },
            include: {
                defaultAsset: {
                    select: { id: true, name: true }
                }
            }
        });

        res.status(200).json({
            success: true,
            data: {
                ...updated,
                defaultAssetName: updated.defaultAsset ? updated.defaultAsset.name : null
            }
        });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ success: false, error: 'An income source with this name already exists' });
        }
        console.error('[updateIncomeSource Error]', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * DELETE /api/income-sources/:id
 * Delete an income source (reassigning any linked transactions to "Others").
 */
export const deleteIncomeSource = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const existing = await prisma.incomeSource.findFirst({
            where: { id, userId }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Income source not found' });
        }

        if (existing.name.toLowerCase() === 'others') {
            return res.status(400).json({ success: false, error: 'Cannot delete default "Others" income source' });
        }

        const defaultSource = await getOrCreateDefaultIncomeSource(prisma, userId);

        // Reassign transactions to "Others"
        await prisma.transaction.updateMany({
            where: { incomeSourceId: id, userId },
            data: { incomeSourceId: defaultSource.id }
        });

        await prisma.incomeSource.delete({
            where: { id }
        });

        res.status(200).json({ success: true, message: 'Income source deleted successfully' });
    } catch (error) {
        console.error('[deleteIncomeSource Error]', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
