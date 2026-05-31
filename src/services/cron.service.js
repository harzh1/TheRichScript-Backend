import cron from 'node-cron';
import prisma from '../config/db.js';

export const initCronJobs = () => {
    // Run every day at midnight (0 0 * * *)
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily auto-funding task...');
        await processAutoFunding();
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
