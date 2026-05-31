import { z } from 'zod';

export const createGoalSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Goal name is required'),
    targetAmount: z.number().positive('Target amount must be greater than 0'),
    expectedDate: z.string().min(1, 'Expected date is required'),
    isPinned: z.boolean().optional(),
    recurringAmount: z.number().nonnegative().optional().nullable(),
    recurringFrequency: z.string().optional().nullable(),
    sourceAssetId: z.string().uuid('Invalid Asset ID').optional().nullable(),
    imageUrls: z.array(z.string().url()).optional()
  })
});

export const updateGoalSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Goal ID')
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    targetAmount: z.number().positive('Target amount must be greater than 0').optional(),
    expectedDate: z.string().optional(),
    isPinned: z.boolean().optional(),
    recurringAmount: z.number().nonnegative().optional().nullable(),
    recurringFrequency: z.string().optional().nullable(),
    sourceAssetId: z.string().uuid('Invalid Asset ID').optional().nullable(),
    imageUrls: z.array(z.string().url()).optional()
  })
});

export const fundGoalSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Goal ID')
  }),
  body: z.object({
    amount: z.number().positive('Amount must be greater than 0'),
    assetId: z.string().uuid('Invalid Asset ID')
  })
});

export const goalIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Goal ID')
  })
});
