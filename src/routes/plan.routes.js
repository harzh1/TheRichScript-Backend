import express from 'express';
import { getPlans, createPlan, updatePlan, deletePlan } from '../controllers/plan.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createPlanSchema, planIdParamSchema } from '../validations/plan.schema.js';
const router = express.Router();

router.use(protect);

router.route('/')
    .get(getPlans)
    .post(validate(createPlanSchema), createPlan);

router.route('/:id')
    .put(validate(planIdParamSchema), updatePlan)
    .delete(validate(planIdParamSchema), deletePlan);

export default router;
