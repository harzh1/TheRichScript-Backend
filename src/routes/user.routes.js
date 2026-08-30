import express from 'express';
import { updateSettings, resetUserData } from '../controllers/user.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.put('/settings', updateSettings);
router.post('/reset-data', resetUserData);

export default router;
