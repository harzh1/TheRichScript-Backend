import express from 'express';
import { runAllCronJobs } from '../services/cron.service.js';

const router = express.Router();

router.all('/run', async (req, res) => {
    try {
        const secret = req.headers['x-cron-secret'] || req.query.secret;
        
        if (!secret || secret !== process.env.CRON_SECRET) {
            console.warn('[CRON] Unauthorized cron attempt');
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        console.log('[CRON] API Trigger Initiated');
        await runAllCronJobs();
        
        return res.json({ success: true, message: 'Cron jobs executed successfully.' });
    } catch (error) {
        console.error('[CRON] API Execution Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
