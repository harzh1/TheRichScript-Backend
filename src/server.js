import app from './app.js';
import prisma from './config/db.js';
import { config } from './config/config.js';

async function startServer() {
    try {
        await prisma.$connect();
        console.log('✅ Connected to PostgreSQL via Prisma successfully.');

        app.listen(config.port, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${config.port} (0.0.0.0)`);
        });
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

startServer();