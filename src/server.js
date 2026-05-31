import app from './app.js';
import prisma from './config/db.js';
import { config } from './config/config.js';
import { initCronJobs } from './services/cron.service.js';

async function startServer() {
    try {
        await prisma.$connect();
        console.log('✅ Connected to PostgreSQL via Prisma successfully.');
        
        initCronJobs();
        console.log('⏳ Cron jobs initialized.');

        app.listen(config.port, () => {
            console.log(`🚀 Server running on port ${config.port}`);
        });
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

startServer();