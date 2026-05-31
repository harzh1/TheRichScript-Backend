import express from 'express';
import { getAnalyticsSummary } from '../controllers/analytics.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getAnalyticsSummary);

export default router;
