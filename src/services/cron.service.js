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
            let isDue = false;
            let diffDays = 0;
            
            if (!goal.lastFundedAt) {
                isDue = true;
            } else {
                const diffTime = Math.abs(now - goal.lastFundedAt);
                diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (goal.recurringFrequency === 'DAILY' && diffDays >= 1) isDue = true;
                if (goal.recurringFrequency === 'WEEKLY' && diffDays >= 7) isDue = true;
                if (goal.recurringFrequency === 'MONTHLY' && diffDays >= 30) isDue = true;
                if (goal.recurringFrequency === 'YEARLY' && diffDays >= 365) isDue = true;
            }

            if (isDue && goal.currentAmount < goal.targetAmount) {
                await prisma.$transaction(async (tx) => {
                    const asset = await tx.asset.findUnique({ where: { id: goal.sourceAssetId } });
                    if (!asset) {
                        console.log(`[CRON] Failed to auto-fund goal: ${goal.name}. Asset missing.`);
                        return;
                    }

                    // Calculate missed cycles based on diffDays if lastFundedAt exists, otherwise 1 cycle
                    let cyclesToProcess = 1;
                    if (goal.lastFundedAt) {
                        if (goal.recurringFrequency === 'DAILY') cyclesToProcess = Math.floor(diffDays / 1);
                        else if (goal.recurringFrequency === 'WEEKLY') cyclesToProcess = Math.floor(diffDays / 7);
                        else if (goal.recurringFrequency === 'MONTHLY') cyclesToProcess = Math.floor(diffDays / 30);
                        else if (goal.recurringFrequency === 'YEARLY') cyclesToProcess = Math.floor(diffDays / 365);
                    }
                    
                    if (cyclesToProcess <= 0) return;

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
                    
                    let simulatedDate = goal.lastFundedAt ? new Date(goal.lastFundedAt) : new Date(now);

                    while (loops < cyclesToProcess && currentGoalAmount < goal.targetAmount && loops < 365) {
                        const amountNeeded = goal.targetAmount - currentGoalAmount;
                        const fundAmount = Math.min(goal.recurringAmount, amountNeeded);

                        if (currentAssetBalance < fundAmount) {
                            console.log(`[CRON] Insufficient funds to continue funding goal: ${goal.name}`);
                            break;
                        }

                        currentAssetBalance -= fundAmount;
                        currentGoalAmount += fundAmount;
                        if (targetAsset) currentTargetBalance += fundAmount;
                        
                        // Advance simulated date for accurate transaction history
                        if (goal.lastFundedAt) {
                            if (goal.recurringFrequency === 'DAILY') simulatedDate.setDate(simulatedDate.getDate() + 1);
                            else if (goal.recurringFrequency === 'WEEKLY') simulatedDate.setDate(simulatedDate.getDate() + 7);
                            else if (goal.recurringFrequency === 'MONTHLY') simulatedDate.setMonth(simulatedDate.getMonth() + 1);
                            else if (goal.recurringFrequency === 'YEARLY') simulatedDate.setFullYear(simulatedDate.getFullYear() + 1);
                        }

                        if (goal.targetAssetId && targetAsset) {
                            await tx.transaction.create({
                                data: {
                                    userId: goal.userId,
                                    assetId: asset.id,
                                    toAssetId: targetAsset.id,
                                    type: 'TRANSFER',
                                    amount: fundAmount,
                                    categoryId,
                                    description: `Auto-funding transfer for goal: ${goal.name}`,
                                    date: new Date(simulatedDate)
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
                                    date: new Date(simulatedDate)
                                }
                            });
                        }
                        
                        loops++;
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
        const targetDate = new Date(now.getTime() + 14 * 60 * 60 * 1000);

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

                while (currentNextDate <= targetDate && loops < 365) {
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
                        await tx.transaction.create({
                            data: {
                                userId: plan.userId,
                                assetId: asset.id,
                                toAssetId: targetAsset.id,
                                type: 'TRANSFER',
                                amount: plan.amount,
                                categoryId: plan.categoryId,
                                description: `Auto-transfer: ${plan.name}`,
                                date: new Date(currentNextDate)
                            }
                        });
                    } else {
                        await tx.transaction.create({
                            data: {
                                userId: plan.userId,
                                assetId: asset.id,
                                type: isIncome ? 'INCOME' : 'EXPENSE',
                                amount: plan.amount,
                                categoryId: plan.categoryId,
                                description: `Auto-${isIncome ? 'income' : 'expense'}: ${plan.name}`,
                                date: new Date(currentNextDate)
                            }
                        });
                    }
                    
                    // Advance date
                    if (plan.frequency === 'DAILY') currentNextDate.setDate(currentNextDate.getDate() + 1);
                    else if (plan.frequency === 'WEEKLY') currentNextDate.setDate(currentNextDate.getDate() + 7);
                    else if (plan.frequency === 'MONTHLY') currentNextDate.setMonth(currentNextDate.getMonth() + 1);
                    else if (plan.frequency === 'YEARLY') currentNextDate.setFullYear(currentNextDate.getFullYear() + 1);
                    
                    loops++;
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
