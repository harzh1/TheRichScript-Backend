import express from 'express';
import { getGoals, createGoal, addFundsToGoal, updateGoal, deleteGoal } from '../controllers/goal.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getGoals)
    .post(upload.array('images', 5), createGoal);

router.route('/:id')
    .put(upload.array('images', 5), updateGoal)
    .delete(deleteGoal);

router.route('/:id/funds')
    .put(addFundsToGoal);

export default router;
