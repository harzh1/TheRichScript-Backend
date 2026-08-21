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
