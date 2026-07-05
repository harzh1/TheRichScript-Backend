import express from 'express';
import { runAllCronJobs } from '../services/cron.service.js';
import { protect } from '../middleware/auth.middleware.js';

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

// Authenticated route for users to manually trigger cron jobs
router.post('/trigger', protect, async (req, res) => {
    try {
        console.log(`[CRON] Manual Trigger Initiated by User ${req.user.userId}`);
        await runAllCronJobs();
        return res.json({ success: true, message: 'Cron jobs executed successfully.' });
    } catch (error) {
        console.error('[CRON] Manual Execution Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
