import cron from 'node-cron';
import prisma from '../config/db.js';

export const initCronJobs = () => {
    // Run every day at midnight (0 0 * * *)
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily auto-funding task...');
        await processAutoFunding();
        console.log('Running daily recurring plans task...');
        await processRecurringPlans();
    });
};

const processAutoFunding = async () => {
    try {
        const now = new Date();
        
        // Process Goals
        const goals = await prisma.goal.findMany({
            where: {
                recurringAmount: { gt: 0 },
                recurringFrequency: { not: null },
                sourceAssetId: { not: null }
            }
        });

        for (const goal of goals) {
            let isDue = false;
            
            if (!goal.lastFundedAt) {
                // If it's never been auto-funded, fund it today
                isDue = true;
            } else {
                const diffTime = Math.abs(now - goal.lastFundedAt);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (goal.recurringFrequency === 'WEEKLY' && diffDays >= 7) isDue = true;
                if (goal.recurringFrequency === 'MONTHLY' && diffDays >= 30) isDue = true;
                if (goal.recurringFrequency === 'YEARLY' && diffDays >= 365) isDue = true;
            }

            if (isDue && goal.currentAmount < goal.targetAmount) {
                const amountNeeded = goal.targetAmount - goal.currentAmount;
                const fundAmount = Math.min(goal.recurringAmount, amountNeeded);

                const asset = await prisma.asset.findUnique({ where: { id: goal.sourceAssetId } });
                
                if (asset && asset.value >= fundAmount) {
                    await prisma.$transaction(async (tx) => {
                        await tx.asset.update({
                            where: { id: asset.id },
                            data: { value: asset.value - fundAmount }
                        });
                        
                        await tx.goal.update({
                            where: { id: goal.id },
                            data: { 
                                currentAmount: goal.currentAmount + fundAmount,
                                lastFundedAt: now
                            }
                        });

                        await tx.transaction.create({
                            data: {
                                userId: goal.userId,
                                assetId: asset.id,
                                type: 'EXPENSE',
                                amount: fundAmount,
                                category: 'GOAL FUNDING',
                                description: `Auto-funding for goal: ${goal.name}`,
                                date: now
                            }
                        });
                    });
                    console.log(`[CRON] Successfully auto-funded goal: ${goal.name} with amount ${fundAmount}`);
                } else {
                    console.log(`[CRON] Failed to auto-fund goal: ${goal.name}. Insufficient funds or asset missing.`);
                }
            }
        }
    } catch (error) {
        console.error('[CRON] Error in auto-funding task:', error);
    }
};

const processRecurringPlans = async () => {
    try {
        const now = new Date();
        const plans = await prisma.plannedExpense.findMany({
            where: {
                type: 'RECURRING',
                nextDueDate: { lte: now }
            }
        });

        for (const plan of plans) {
            const asset = await prisma.asset.findUnique({ where: { id: plan.assetId } });
            if (!asset || asset.value < plan.amount) {
                console.log(`[CRON] Failed to process plan: ${plan.name}. Insufficient funds or asset missing.`);
                continue;
            }

            await prisma.$transaction(async (tx) => {
                // Deduct from source
                await tx.asset.update({
                    where: { id: asset.id },
                    data: { value: asset.value - plan.amount }
                });

                // Calculate next due date
                let nextDate = new Date(plan.nextDueDate);
                if (plan.frequency === 'DAILY') nextDate.setDate(nextDate.getDate() + 1);
                else if (plan.frequency === 'WEEKLY') nextDate.setDate(nextDate.getDate() + 7);
                else if (plan.frequency === 'MONTHLY') nextDate.setMonth(nextDate.getMonth() + 1);
                else if (plan.frequency === 'YEARLY') nextDate.setFullYear(nextDate.getFullYear() + 1);

                await tx.plannedExpense.update({
                    where: { id: plan.id },
                    data: { 
                        lastFundedAt: now,
                        nextDueDate: nextDate
                    }
                });

                // Is it a transfer or expense?
                if (plan.targetAssetId) {
                    const targetAsset = await tx.asset.findUnique({ where: { id: plan.targetAssetId } });
                    if (targetAsset) {
                        await tx.asset.update({
                            where: { id: targetAsset.id },
                            data: { value: targetAsset.value + plan.amount }
                        });
                        
                        // Log 2 transactions
                        await tx.transaction.create({
                            data: {
                                userId: plan.userId,
                                assetId: asset.id,
                                type: 'EXPENSE',
                                amount: plan.amount,
                                category: 'TRANSFER OUT',
                                description: `Transfer to ${targetAsset.name} (${plan.name})`,
                                date: now
                            }
                        });
                        await tx.transaction.create({
                            data: {
                                userId: plan.userId,
                                assetId: targetAsset.id,
                                type: 'INCOME',
                                amount: plan.amount,
                                category: 'TRANSFER IN',
                                description: `Transfer from ${asset.name} (${plan.name})`,
                                date: now
                            }
                        });
                        console.log(`[CRON] Successfully processed transfer subscription: ${plan.name}`);
                    }
                } else {
                    // Regular expense
                    await tx.transaction.create({
                        data: {
                            userId: plan.userId,
                            assetId: asset.id,
                            type: 'EXPENSE',
                            amount: plan.amount,
                            category: plan.category,
                            description: `Auto-expense: ${plan.name}`,
                            date: now
                        }
                    });
                    console.log(`[CRON] Successfully processed recurring expense: ${plan.name}`);
                }
            });
        }
    } catch (error) {
        console.error('[CRON] Error in recurring plans task:', error);
    }
};
