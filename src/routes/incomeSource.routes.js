import express from 'express';
import {
    getIncomeSources,
    getIncomeSourcesSummary,
    createIncomeSource,
    updateIncomeSource,
    deleteIncomeSource
} from '../controllers/incomeSource.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

router.use(protect);

router.route('/summary')
    .get(getIncomeSourcesSummary);

router.route('/')
    .get(getIncomeSources)
    .post(upload.single('icon'), createIncomeSource);

router.route('/:id')
    .put(upload.single('icon'), updateIncomeSource)
    .delete(deleteIncomeSource);

export default router;
