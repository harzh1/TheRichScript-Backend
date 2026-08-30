import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { sanitizeUser } from './auth.controller.js';

export const updateSettings = async (req, res) => {
    try {
        const { firstName, lastName, country, currency } = req.body;
        
        const updateData = {};
        if (firstName) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (country) updateData.country = country;
        if (currency) updateData.currency = currency;

        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: updateData
        });

        res.status(200).json({ 
            success: true, 
            user: sanitizeUser(user),
            data: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const resetUserData = async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ success: false, error: 'Password is required to reset all financial data.' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Incorrect password.' });
        }

        const userId = req.user.userId;

        await prisma.$transaction([
            prisma.goalImage.deleteMany({
                where: { goal: { userId } }
            }),
            prisma.goal.deleteMany({
                where: { userId }
            }),
            prisma.plannedExpense.deleteMany({
                where: { userId }
            }),
            prisma.transaction.deleteMany({
                where: { userId }
            }),
            prisma.debt.deleteMany({
                where: { userId }
            }),
            prisma.categoryLimit.deleteMany({
                where: { userId }
            }),
            prisma.incomeSource.deleteMany({
                where: { userId }
            }),
            prisma.asset.deleteMany({
                where: { userId }
            }),
            prisma.userCategory.deleteMany({
                where: { userId }
            }),
            prisma.userAssetType.deleteMany({
                where: { userId }
            })
        ]);

        res.status(200).json({
            success: true,
            message: 'All financial records and data have been reset successfully.'
        });
    } catch (error) {
        console.error('Error resetting user data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
