import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Category name is required'),
    monthlyLimit: z.coerce.number().nonnegative('Limit cannot be negative').optional().nullable(),
    yearlyLimit: z.coerce.number().nonnegative('Limit cannot be negative').optional().nullable()
  })
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Category name is required').optional(),
    monthlyLimit: z.coerce.number().nonnegative('Limit cannot be negative').optional().nullable(),
    yearlyLimit: z.coerce.number().nonnegative('Limit cannot be negative').optional().nullable()
  })
});
