import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/config.js';
import prisma from '../config/db.js';

export const initTelegramBot = () => {
    if (!config.telegramToken || config.telegramToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
        console.warn('⚠️ Telegram Token not configured. Bot is disabled.');
        return;
    }

    const bot = new TelegramBot(config.telegramToken, { polling: true });
    console.log('🤖 Telegram Bot initialized and polling...');

    bot.onText(/(spent|earned)\s+(\d+)\s+(on|for|from)\s+(.+)/i, async (msg, match) => {
        const chatId = msg.chat.id;
        const action = match[1].toLowerCase();
        const amount = Number(match[2]);
        const description = match[4];

        const type = action === 'spent' ? 'EXPENSE' : 'INCOME';

        try {
            const user = await prisma.user.findFirst({ 
                where: { telegramChatId: chatId.toString() } 
            });
            
            if (!user) {
                return bot.sendMessage(chatId, "⚠️ Please link your Telegram account to the platform first.");
            }

            // Find a default asset to attach the transaction to
            const asset = await prisma.asset.findFirst({
                where: { userId: user.id }
            });

            if (!asset) {
                return bot.sendMessage(chatId, "⚠️ Please create at least one Asset in FinSpace before logging transactions via Telegram.");
            }

            await prisma.$transaction(async (tx) => {
                await tx.transaction.create({
                    data: {
                        userId: user.id,
                        assetId: asset.id,
                        type,
                        amount,
                        category: 'MISCELLANEOUS',
                        description,
                        date: new Date()
                    }
                });

                const newBalance = type === 'INCOME' 
                    ? asset.value + amount 
                    : asset.value - amount;

                await tx.asset.update({
                    where: { id: asset.id },
                    data: { value: newBalance }
                });
            });

            bot.sendMessage(chatId, `✅ Successfully logged ${type}: ₹${amount} for ${description}`);
        } catch (err) {
            console.error('[Telegram Service Error]', err);
            bot.sendMessage(chatId, "❌ Error logging transaction. Please try again later.");
        }
    });
};