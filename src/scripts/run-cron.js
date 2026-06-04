import prisma from '../config/db.js';
import { runAllCronJobs } from '../services/cron.service.js';

const run = async () => {
    console.log('Starting standalone cron job execution...');
    try {
        await runAllCronJobs();
        console.log('Cron job execution completed successfully.');
    } catch (error) {
        console.error('Error during cron execution:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
};

run();
