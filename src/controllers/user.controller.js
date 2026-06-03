import prisma from '../config/db.js';

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
            user: { 
                id: user.id, 
                email: user.email, 
                firstName: user.firstName, 
                lastName: user.lastName,
                country: user.country,
                currency: user.currency
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
