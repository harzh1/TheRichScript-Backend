import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 5000,
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/finance_platform',
    jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_for_harsh',
    telegramToken: process.env.TELEGRAM_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',
};