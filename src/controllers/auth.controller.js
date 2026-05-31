import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { config } from '../config/config.js';

export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email already in use.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                passwordHash: hashedPassword
            }
        });

        const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

        res.status(201).json({ 
            success: true, 
            message: 'User created successfully', 
            token,
            user: { id: user.id, email: user.email, name: user.name } 
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

        const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

        res.status(200).json({
            success: true,
            token,
            user: { id: user.id, email: user.email, name: user.name }
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
        res.status(200).json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};