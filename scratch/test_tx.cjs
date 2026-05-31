const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function test() {
    try {
        // We need a user and asset
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const user = await prisma.user.findFirst();
        const asset = await prisma.asset.findFirst({ where: { userId: user.id } });
        
        // Mock token logic if necessary or bypass by creating token
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });

        const form = new FormData();
        form.append('type', 'EXPENSE');
        form.append('amount', '100');
        form.append('category', 'TEST');
        form.append('description', 'undefined');
        form.append('assetId', asset.id);
        form.append('date', new Date().toISOString());

        console.log('Sending request...');
        const res = await axios.post('http://localhost:5000/api/transactions', form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`
            }
        });
        console.log('Success:', res.data);
    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
    }
}

test();
