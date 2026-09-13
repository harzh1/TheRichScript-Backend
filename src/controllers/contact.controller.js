import prisma from '../config/db.js';

// GET /contacts - list all contacts for authenticated user
export const getContacts = async (req, res) => {
    try {
        const contacts = await prisma.contact.findMany({
            where: { userId: req.user.userId },
            include: { _count: { select: { debts: true } } },
            orderBy: { name: 'asc' }
        });
        res.status(200).json({ success: true, data: contacts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /contacts - create a contact
export const createContact = async (req, res) => {
    try {
        const { name, phone, email, notes } = req.body;
        const contact = await prisma.contact.create({
            data: {
                userId: req.user.userId,
                name: name.trim(),
                ...(phone && { phone: phone.trim() }),
                ...(email && { email: email.trim() }),
                ...(notes && { notes: notes.trim() })
            }
        });
        res.status(201).json({ success: true, data: contact });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'A contact with that name already exists' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

// PUT /contacts/:id - update a contact
export const updateContact = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, email, notes } = req.body;

        const existing = await prisma.contact.findFirst({
            where: { id, userId: req.user.userId }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Contact not found' });
        }

        const updated = await prisma.contact.update({
            where: { id },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(phone !== undefined && { phone: phone ? phone.trim() : null }),
                ...(email !== undefined && { email: email ? email.trim() : null }),
                ...(notes !== undefined && { notes: notes ? notes.trim() : null })
            }
        });

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'A contact with that name already exists' });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

// DELETE /contacts/:id - delete (blocks if referenced by debts)
export const deleteContact = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await prisma.contact.findFirst({
            where: { id, userId: req.user.userId },
            include: { _count: { select: { debts: true } } }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Contact not found' });
        }

        if (existing._count.debts > 0) {
            return res.status(409).json({
                success: false,
                error: `Cannot delete contact "${existing.name}" — it is referenced by ${existing._count.debts} debt(s). Remove those references first.`
            });
        }

        await prisma.contact.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Contact deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
