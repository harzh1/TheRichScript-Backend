import { z } from 'zod';

export const createCategoryLimitSchema = z.object({
  body: z.object({
    categoryName: z.string().min(1, 'Category name is required'),
    monthlyLimit: z.number().nonnegative('Limit cannot be negative').optional().nullable(),
    yearlyLimit: z.number().nonnegative('Limit cannot be negative').optional().nullable()
  })
});

export const createUserCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Category name is required')
  })
});
