import express from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../controllers/category.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createCategorySchema, updateCategorySchema } from '../validations/category.schema.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getCategories)
    .post(validate(createCategorySchema), createCategory);

router.route('/:id')
    .put(validate(updateCategorySchema), updateCategory)
    .delete(deleteCategory);

export default router;
