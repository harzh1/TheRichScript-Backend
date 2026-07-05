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
        
        // Process Goals
        const goals = await prisma.goal.findMany({
            where: {
                recurringAmount: { gt: 0 },
                recurringFrequency: { not: null },
                sourceAssetId: { not: null }
            }
        });

        for (const goal of goals) {
            let nextFundingDate = new Date(now);
            
            if (goal.lastFundedAt) {
                nextFundingDate = new Date(goal.lastFundedAt);
                // Calculate when it SHOULD have run next
                if (goal.recurringFrequency === 'DAILY') nextFundingDate.setDate(nextFundingDate.getDate() + 1);
                else if (goal.recurringFrequency === 'WEEKLY') nextFundingDate.setDate(nextFundingDate.getDate() + 7);
                else if (goal.recurringFrequency === 'MONTHLY') nextFundingDate.setMonth(nextFundingDate.getMonth() + 1);
                else if (goal.recurringFrequency === 'YEARLY') nextFundingDate.setFullYear(nextFundingDate.getFullYear() + 1);
            } else {
                // If never funded, it's due immediately
                nextFundingDate = new Date(now);
                nextFundingDate.setMilliseconds(nextFundingDate.getMilliseconds() - 1); // ensure it's <= now
            }

            if (nextFundingDate.getTime() <= now.getTime() && goal.currentAmount < goal.targetAmount) {
                await prisma.$transaction(async (tx) => {
                    const asset = await tx.asset.findUnique({ where: { id: goal.sourceAssetId } });
                    if (!asset) {
                        console.log(`[CRON] Failed to auto-fund goal: ${goal.name}. Asset missing.`);
                        return;
                    }

                    let currentAssetBalance = asset.value;
                    let currentGoalAmount = goal.currentAmount;
                    let loops = 0;
                    
                    let targetAsset = null;
                    let currentTargetBalance = 0;
                    if (goal.targetAssetId) {
                        targetAsset = await tx.asset.findUnique({ where: { id: goal.targetAssetId } });
                        if (targetAsset) currentTargetBalance = targetAsset.value;
                    }
                    
                    const categoryId = await resolveCategoryId(tx, goal.userId, 'GOAL FUNDING');
                    
                    let simulatedDate = new Date(nextFundingDate);
                    // Prevent backdating further than creation date just in case
                    if (goal.createdAt && simulatedDate < goal.createdAt) {
                        simulatedDate = new Date(goal.createdAt);
                    }

                    let transactionsToCreate = [];

                    while (simulatedDate.getTime() <= now.getTime() && currentGoalAmount < goal.targetAmount && loops < 365) {
                        const amountNeeded = goal.targetAmount - currentGoalAmount;
                        const fundAmount = Math.min(goal.recurringAmount, amountNeeded);

                        if (currentAssetBalance < fundAmount) {
                            console.log(`[CRON] Insufficient funds to continue funding goal: ${goal.name}`);
                            break;
                        }

                        currentAssetBalance -= fundAmount;
                        currentGoalAmount += fundAmount;
                        if (targetAsset) currentTargetBalance += fundAmount;
                        
                        if (goal.targetAssetId && targetAsset) {
                            transactionsToCreate.push({
                                userId: goal.userId,
                                assetId: asset.id,
                                toAssetId: targetAsset.id,
                                type: 'TRANSFER',
                                amount: fundAmount,
                                categoryId,
                                description: `Auto-funding transfer for goal: ${goal.name}`,
                                date: new Date(simulatedDate)
                            });
                        } else {
                            transactionsToCreate.push({
                                userId: goal.userId,
                                assetId: asset.id,
                                type: 'EXPENSE',
                                amount: fundAmount,
                                categoryId,
                                description: `Auto-funding for goal: ${goal.name}`,
                                date: new Date(simulatedDate)
                            });
                        }
                        
                        // Advance simulated date
                        if (goal.recurringFrequency === 'DAILY') simulatedDate.setDate(simulatedDate.getDate() + 1);
                        else if (goal.recurringFrequency === 'WEEKLY') simulatedDate.setDate(simulatedDate.getDate() + 7);
                        else if (goal.recurringFrequency === 'MONTHLY') simulatedDate.setMonth(simulatedDate.getMonth() + 1);
                        else if (goal.recurringFrequency === 'YEARLY') simulatedDate.setFullYear(simulatedDate.getFullYear() + 1);
                        
                        loops++;
                    }

                    if (transactionsToCreate.length > 0) {
                        await tx.transaction.createMany({ data: transactionsToCreate });
                    }

                    if (loops > 0) {
                        await tx.asset.update({
                            where: { id: asset.id },
                            data: { value: currentAssetBalance }
                        });
                        
                        if (targetAsset) {
                            await tx.asset.update({
                                where: { id: targetAsset.id },
                                data: { value: currentTargetBalance }
                            });
                        }

                        await tx.goal.update({
                            where: { id: goal.id },
                            data: { 
                                currentAmount: currentGoalAmount,
                                lastFundedAt: now
                            }
                        });
                        console.log(`[CRON] Successfully auto-funded goal ${goal.name} for ${loops} cycles.`);
                    }
                });
            }
        }
    } catch (error) {
        console.error('[CRON] Error in auto-funding task:', error);
    }
};

const processRecurringPlans = async () => {
    try {
        const now = new Date();
        const targetDate = new Date(now);

        const plans = await prisma.plannedExpense.findMany({
            where: {
                type: 'RECURRING',
                nextDueDate: { lte: targetDate }
            }
        });

        for (const plan of plans) {
            await prisma.$transaction(async (tx) => {
                const asset = await tx.asset.findUnique({ where: { id: plan.assetId } });
                if (!asset) {
                    console.log(`[CRON] Failed to process plan: ${plan.name}. Asset missing.`);
                    return;
                }
                
                const isIncome = plan.txType === 'INCOME';
                let currentAssetBalance = asset.value;
                let currentNextDate = new Date(plan.nextDueDate);
                let loops = 0;
                
                let targetAsset = null;
                let currentTargetBalance = 0;
                if (plan.targetAssetId) {
                    targetAsset = await tx.asset.findUnique({ where: { id: plan.targetAssetId } });
                    if (targetAsset) currentTargetBalance = targetAsset.value;
                }

                let transactionsToCreate = [];

                while (currentNextDate.getTime() <= now.getTime() && loops < 365) {
                    if (!isIncome && currentAssetBalance < plan.amount) {
                        console.log(`[CRON] Insufficient funds to continue processing plan: ${plan.name} at ${currentNextDate.toISOString()}`);
                        break;
                    }

                    // Update balances
                    currentAssetBalance = isIncome 
                        ? currentAssetBalance + plan.amount 
                        : currentAssetBalance - plan.amount;
                        
                    if (targetAsset) {
                        currentTargetBalance += plan.amount;
                    }

                    // Create historical transaction
                    if (plan.targetAssetId && targetAsset) {
                        transactionsToCreate.push({
                            userId: plan.userId,
                            assetId: asset.id,
                            toAssetId: targetAsset.id,
                            type: 'TRANSFER',
                            amount: plan.amount,
                            categoryId: plan.categoryId,
                            description: `Auto-transfer: ${plan.name}`,
                            date: new Date(currentNextDate)
                        });
                    } else {
                        transactionsToCreate.push({
                            userId: plan.userId,
                            assetId: asset.id,
                            type: isIncome ? 'INCOME' : 'EXPENSE',
                            amount: plan.amount,
                            categoryId: plan.categoryId,
                            description: `Auto-${isIncome ? 'income' : 'expense'}: ${plan.name}`,
                            date: new Date(currentNextDate)
                        });
                    }
                    
                    // Advance date
                    if (plan.frequency === 'DAILY') currentNextDate.setDate(currentNextDate.getDate() + 1);
                    else if (plan.frequency === 'WEEKLY') currentNextDate.setDate(currentNextDate.getDate() + 7);
                    else if (plan.frequency === 'MONTHLY') currentNextDate.setMonth(currentNextDate.getMonth() + 1);
                    else if (plan.frequency === 'YEARLY') currentNextDate.setFullYear(currentNextDate.getFullYear() + 1);
                    
                    loops++;
                }

                if (transactionsToCreate.length > 0) {
                    await tx.transaction.createMany({ data: transactionsToCreate });
                }

                if (loops > 0) {
                    await tx.asset.update({
                        where: { id: asset.id },
                        data: { value: currentAssetBalance }
                    });
                    
                    if (targetAsset) {
                        await tx.asset.update({
                            where: { id: targetAsset.id },
                            data: { value: currentTargetBalance }
                        });
                    }

                    await tx.plannedExpense.update({
                        where: { id: plan.id },
                        data: { 
                            lastFundedAt: now,
                            nextDueDate: currentNextDate
                        }
                    });
                    console.log(`[CRON] Successfully processed plan ${plan.name} for ${loops} cycles.`);
                }
            });
        }
    } catch (error) {
        console.error('[CRON] Error in recurring plans task:', error);
    }
};
