import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const transactions = await prisma.transaction.findMany();
    
    // Check analytics logic
    const userId = transactions.length > 0 ? transactions[0].userId : null;
    
    if (userId) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        const monthlyExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, date: { gte: startOfMonth } },
            _sum: { amount: true }
        });
        console.log("Monthly Expenses (This month):", monthlyExpenses);

        const lastMonthExpenses = await prisma.transaction.groupBy({
            by: ['categoryId'],
            where: { userId, date: { gte: startOfLastMonth, lt: startOfMonth } },
            _sum: { amount: true }
        });
        console.log("Monthly Expenses (Last month):", lastMonthExpenses);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
