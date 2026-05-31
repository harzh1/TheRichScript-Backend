import express from 'express';
import { getCategoryLimits, setCategoryLimits } from '../controllers/category.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createCategoryLimitSchema } from '../validations/category.schema.js';
const router = express.Router();

router.use(protect);

router.route('/')
    .get(getCategoryLimits)
    .post(validate(createCategoryLimitSchema), setCategoryLimits);

export default router;
