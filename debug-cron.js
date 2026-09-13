import { runAllCronJobs } from './src/services/cron.service.js';
import prisma from './src/config/db.js';

async function test() {
    await runAllCronJobs();
}

test().catch(console.error).finally(() => prisma.$disconnect());
