import app from './app.js';
import prisma from './config/db.js';
import { config } from './config/config.js';
import cron from 'node-cron';
import { runAllCronJobs } from './services/cron.service.js';

async function startServer() {
    try {
        await prisma.$connect();
        console.log('✅ Connected to PostgreSQL via Prisma successfully.');

        // Schedule daily recurring transactions & auto-funding cron job at 00:00 (Midnight)
        cron.schedule('0 0 * * *', async () => {
            console.log('⏰ [AUTO-CRON] Running daily recurring transactions & auto-funding tasks...');
            try {
                await runAllCronJobs();
                console.log('✅ [AUTO-CRON] Daily scheduled tasks completed.');
            } catch (err) {
                console.error('❌ [AUTO-CRON] Error during scheduled tasks:', err);
            }
        });

        // Run once on server startup to catch up any missed cycles
        runAllCronJobs().catch(err => console.error('❌ [AUTO-CRON] Startup sync error:', err));

        app.listen(config.port, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${config.port} (0.0.0.0)`);
        });
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

startServer();