import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { config } from '../config/config.js';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const sanitizeUser = (user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    country: user.country,
    currency: user.currency,
    avatarUrl: user.avatarUrl || null
});

export const generateAuthTokens = async (userId) => {
    const accessToken = jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtAccessExpiration });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const hashedToken = hashToken(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + config.jwtRefreshExpirationDays * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
        data: {
            token: hashedToken,
            userId,
            expiresAt: refreshExpiresAt
        }
    });

    return {
        accessToken,
        refreshToken
    };
};

export const register = async (req, res) => {
    try {
        const { firstName, lastName, email, password, country, currency } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already in use.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                firstName,
                lastName,
                email,
                passwordHash: hashedPassword,
                country: country ? country.trim().toUpperCase() : 'IN',
                currency: currency ? currency.trim().toUpperCase() : 'INR'
            }
        });

        const { accessToken, refreshToken } = await generateAuthTokens(user.id);

        res.status(201).json({ 
            success: true, 
            message: 'User created successfully', 
            token: accessToken,
            accessToken,
            refreshToken,
            user: sanitizeUser(user),
            data: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        const { accessToken, refreshToken } = await generateAuthTokens(user.id);

        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
        });

        res.status(200).json({
            success: true,
            token: accessToken,
            accessToken,
            refreshToken,
            user: sanitizeUser(user),
            data: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getMe = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }
        res.status(200).json({ 
            success: true, 
            user: sanitizeUser(user),
            data: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, country, currency } = req.body;
        
        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: {
                ...(firstName && { firstName }),
                ...(lastName !== undefined && { lastName }),
                ...(country && { country }),
                ...(currency && { currency })
            }
        });

        res.status(200).json({ 
            success: true, 
            message: 'Profile updated successfully',
            user: sanitizeUser(user),
            data: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateAvatar = async (req, res) => {
    try {
        const avatarUrl = req.file ? req.file.path : (req.body.avatarUrl || null);
        if (!avatarUrl) {
            return res.status(400).json({ success: false, error: 'No avatar image file or URL provided.' });
        }

        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: { avatarUrl }
        });

        res.status(200).json({
            success: true,
            message: 'Profile photo updated successfully',
            user: sanitizeUser(user),
            data: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const removeAvatar = async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: { avatarUrl: null }
        });

        res.status(200).json({
            success: true,
            message: 'Profile photo removed successfully',
            user: sanitizeUser(user),
            data: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Incorrect current password.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: req.user.userId },
            data: { passwordHash: hashedPassword }
        });

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteAccount = async (req, res) => {
    try {
        const { password } = req.body || {};
        if (!password) {
            return res.status(400).json({ success: false, error: 'Password is required to delete your account.' });
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
            prisma.notification.deleteMany({
                where: { userId }
            }),
            prisma.auditLog.deleteMany({
                where: { userId }
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
            prisma.contact.deleteMany({
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
            }),
            prisma.refreshToken.deleteMany({
                where: { userId }
            }),
            prisma.user.delete({
                where: { id: userId }
            })
        ]);

        res.status(200).json({
            success: true,
            message: 'Account and all associated data permanently deleted successfully.'
        });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const refreshTokenHandler = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'Refresh token is required.' });
        }

        const hashedToken = hashToken(refreshToken);
        const tokenRecord = await prisma.refreshToken.findUnique({
            where: { token: hashedToken },
            include: { user: true }
        });

        if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt < new Date()) {
            return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
        }

        if (!tokenRecord.user) {
            return res.status(401).json({ success: false, error: 'Associated user no longer exists.' });
        }

        // Token Rotation: revoke/delete the used refresh token and issue a fresh pair
        const newRefreshToken = crypto.randomBytes(40).toString('hex');
        const newHashedToken = hashToken(newRefreshToken);
        const newRefreshExpiresAt = new Date(Date.now() + config.jwtRefreshExpirationDays * 24 * 60 * 60 * 1000);
        const newAccessToken = jwt.sign({ userId: tokenRecord.userId }, config.jwtSecret, { expiresIn: config.jwtAccessExpiration });

        await prisma.$transaction([
            prisma.refreshToken.delete({
                where: { id: tokenRecord.id }
            }),
            prisma.refreshToken.create({
                data: {
                    token: newHashedToken,
                    userId: tokenRecord.userId,
                    expiresAt: newRefreshExpiresAt
                }
            })
        ]);

        res.status(200).json({
            success: true,
            message: 'Token refreshed successfully',
            token: newAccessToken,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user: sanitizeUser(tokenRecord.user),
            data: sanitizeUser(tokenRecord.user)
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const logoutHandler = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            const hashedToken = hashToken(refreshToken);
            await prisma.refreshToken.deleteMany({
                where: { token: hashedToken }
            });
        }

        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};