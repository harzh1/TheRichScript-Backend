import express from 'express';
import { getPlans, createPlan, updatePlan, deletePlan } from '../controllers/plan.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getPlans)
    .post(createPlan);

router.route('/:id')
    .put(updatePlan)
    .delete(deletePlan);

export default router;
