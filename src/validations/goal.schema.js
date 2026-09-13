import { z } from 'zod';

const imageUrlsSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value : [value];
  },
  z.array(z.string().url()).optional()
);

export const createGoalSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Goal name is required'),
    targetAmount: z.coerce.number().positive('Target amount must be greater than 0'),
    expectedDate: z.string().min(1, 'Expected date is required'),
    initialDeposit: z.coerce.number().nonnegative().optional().nullable(),
    assetId: z.string().uuid('Invalid Asset ID').optional().nullable(),
    isPinned: z.preprocess(val => val === 'true' || val === true, z.boolean()).optional(),
    recurringAmount: z.coerce.number().nonnegative().optional().nullable(),
    recurringFrequency: z.string().optional().nullable(),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code').toUpperCase().optional(),
    sourceAssetId: z.string().uuid('Invalid Asset ID').optional().nullable(),
    targetAssetId: z.string().uuid('Invalid Target Asset ID').optional().nullable(),
    imageUrls: imageUrlsSchema
  }).passthrough()
});

export const updateGoalSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Goal ID')
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    targetAmount: z.coerce.number().positive('Target amount must be greater than 0').optional(),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code').toUpperCase().optional(),
    expectedDate: z.string().optional(),
    isPinned: z.preprocess(val => val === 'true' || val === true, z.boolean()).optional(),
    recurringAmount: z.coerce.number().nonnegative().optional().nullable(),
    recurringFrequency: z.string().optional().nullable(),
    sourceAssetId: z.string().uuid('Invalid Asset ID').optional().nullable(),
    targetAssetId: z.string().uuid('Invalid Target Asset ID').optional().nullable(),
    imageUrls: imageUrlsSchema
  })
});

export const fundGoalSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Goal ID')
  }),
  body: z.object({
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    assetId: z.string().uuid('Invalid Asset ID'),
    destinationAmount: z.coerce.number().positive().optional(),
    exchangeRate: z.coerce.number().positive().optional()
  })
});

export const goalIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Goal ID')
  })
});
