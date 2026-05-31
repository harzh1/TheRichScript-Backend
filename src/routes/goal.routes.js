import express from 'express';
import { getGoals, createGoal, addFundsToGoal, updateGoal, deleteGoal } from '../controllers/goal.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { upload } from '../config/cloudinary.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createGoalSchema, updateGoalSchema, fundGoalSchema, goalIdParamSchema } from '../validations/goal.schema.js';
const router = express.Router();

router.use(protect);

router.route('/')
    .get(getGoals)
    .post(upload.array('images', 5), validate(createGoalSchema), createGoal);

router.route('/:id')
    .put(upload.array('images', 5), validate(updateGoalSchema), updateGoal)
    .delete(validate(goalIdParamSchema), deleteGoal);

router.route('/:id/funds')
    .put(validate(fundGoalSchema), addFundsToGoal);

export default router;
