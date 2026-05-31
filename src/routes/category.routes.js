import express from 'express';
import { getCategoryLimits, setCategoryLimits } from '../controllers/category.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getCategoryLimits)
    .post(setCategoryLimits);

export default router;
