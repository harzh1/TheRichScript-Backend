import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 8080,
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/finance_platform',
    jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_for_harsh',
    jwtAccessExpiration: process.env.JWT_ACCESS_EXPIRATION || '7d',
    jwtRefreshExpirationDays: parseInt(process.env.JWT_REFRESH_EXPIRATION_DAYS || '30', 10),
    telegramToken: process.env.TELEGRAM_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',
};