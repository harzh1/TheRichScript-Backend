import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import assetRoutes from './routes/asset.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import categoryRoutes from './routes/category.routes.js';
import planRoutes from './routes/plan.routes.js';
import goalRoutes from './routes/goal.routes.js';
import debtRoutes from './routes/debt.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import { initTelegramBot } from './services/telegram.service.js';

const app = express();

app.use(cors());
app.use(express.json());

// Initialize Telegram bot if token exists
if (process.env.TELEGRAM_BOT_TOKEN) {
    initTelegramBot();
}

app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use((err, req, res, next) => {
    console.error('[Global Error]', err.stack);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
});

export default app;