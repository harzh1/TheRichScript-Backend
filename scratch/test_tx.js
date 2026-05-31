import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function test() {
    try {
        const user = await prisma.user.findFirst();
        const asset = await prisma.asset.findFirst({ where: { userId: user.id } });
        
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
        
        const formData = new FormData();
        formData.append('type', 'EXPENSE');
        formData.append('amount', '100');
        formData.append('category', 'TEST');
        formData.append('description', '');
        formData.append('assetId', asset.id);
        formData.append('date', new Date().toISOString());

        console.log('Sending request...');
        const res = await fetch('http://localhost:5000/api/transactions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Response:', text);
    } catch (err) {
        console.error('Fetch error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
