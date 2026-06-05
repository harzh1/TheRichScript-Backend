import prisma from '../config/db.js';
import { resolveCategoryId } from '../controllers/category.controller.js';

export const runAllCronJobs = async () => {
    console.log('Running auto-funding task...');
    await processAutoFunding();
    console.log('Running recurring plans task...');
    await processRecurringPlans();
};

const processAutoFunding = async () => {
    try {
        const now = new Date();
        // Add a 14-hour buffer to account for extreme timezones (like +14)
        const targetDate = new Date(now.getTime() + 14 * 60 * 60 * 1000);
        
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
                isDue = true;
            } else {
                const diffTime = Math.abs(now - goal.lastFundedAt);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (goal.recurringFrequency === 'DAILY' && diffDays >= 1) isDue = true;
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
                        const categoryId = await resolveCategoryId(tx, goal.userId, 'GOAL FUNDING');

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

                        if (goal.targetAssetId) {
                            const targetAsset = await tx.asset.findUnique({ where: { id: goal.targetAssetId } });
                            if (targetAsset) {
                                await tx.asset.update({
                                    where: { id: goal.targetAssetId },
                                    data: { value: targetAsset.value + fundAmount }
                                });
                            }
                            await tx.transaction.create({
                                data: {
                                    userId: goal.userId,
                                    assetId: asset.id,
                                    toAssetId: goal.targetAssetId,
                                    type: 'TRANSFER',
                                    amount: fundAmount,
                                    categoryId,
                                    description: `Auto-funding transfer for goal: ${goal.name}`,
                                    date: now
                                }
                            });
                        } else {
                            await tx.transaction.create({
                                data: {
                                    userId: goal.userId,
                                    assetId: asset.id,
                                    type: 'EXPENSE',
                                    amount: fundAmount,
                                    categoryId,
                                    description: `Auto-funding for goal: ${goal.name}`,
                                    date: now
                                }
                            });
                        }
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
        const targetDate = new Date(now.getTime() + 14 * 60 * 60 * 1000);

        const plans = await prisma.plannedExpense.findMany({
            where: {
                type: 'RECURRING',
                nextDueDate: { lte: targetDate }
            }
        });

        for (const plan of plans) {
            const asset = await prisma.asset.findUnique({ where: { id: plan.assetId } });
            if (!asset) {
                console.log(`[CRON] Failed to process plan: ${plan.name}. Asset missing.`);
                continue;
            }
            
            // Use the normalized txType field (no more || hack)
            const isIncome = plan.txType === 'INCOME';
            
            if (!isIncome && asset.value < plan.amount) {
                console.log(`[CRON] Failed to process plan: ${plan.name}. Insufficient funds.`);
                continue;
            }

            await prisma.$transaction(async (tx) => {
                // Update source balance
                const newSourceBalance = isIncome 
                    ? asset.value + plan.amount 
                    : asset.value - plan.amount;
                    
                await tx.asset.update({
                    where: { id: asset.id },
                    data: { value: newSourceBalance }
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

                // The categoryId is already stored on the plan — use it directly
                if (plan.targetAssetId) {
                    const targetAsset = await tx.asset.findUnique({ where: { id: plan.targetAssetId } });
                    if (targetAsset) {
                        await tx.asset.update({
                            where: { id: targetAsset.id },
                            data: { value: targetAsset.value + plan.amount }
                        });
                        
                        await tx.transaction.create({
                            data: {
                                userId: plan.userId,
                                assetId: asset.id,
                                toAssetId: targetAsset.id,
                                type: 'TRANSFER',
                                amount: plan.amount,
                                categoryId: plan.categoryId,
                                description: `Auto-transfer: ${plan.name}`,
                                date: now
                            }
                        });
                        console.log(`[CRON] Successfully processed transfer subscription: ${plan.name}`);
                    }
                } else {
                    await tx.transaction.create({
                        data: {
                            userId: plan.userId,
                            assetId: asset.id,
                            type: isIncome ? 'INCOME' : 'EXPENSE',
                            amount: plan.amount,
                            categoryId: plan.categoryId,
                            description: `Auto-${isIncome ? 'income' : 'expense'}: ${plan.name}`,
                            date: now
                        }
                    });
                    console.log(`[CRON] Successfully processed recurring ${isIncome ? 'income' : 'expense'}: ${plan.name}`);
                }
            });
        }
    } catch (error) {
        console.error('[CRON] Error in recurring plans task:', error);
    }
};
