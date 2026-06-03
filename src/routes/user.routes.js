import express from 'express';
import { updateSettings } from '../controllers/user.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.put('/settings', updateSettings);

export default router;
