import { z } from 'zod';

export const createPlanSchema = z.object({
  body: z.object({
    assetId: z.string().uuid('Invalid Asset ID'),
    targetAssetId: z.string().uuid('Invalid Target Asset ID').optional().nullable(),
    name: z.string().min(1, 'Plan name is required'),
    category: z.string().min(1, 'Category is required'),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    type: z.enum(['MANUAL', 'RECURRING'], { required_error: 'Type must be MANUAL or RECURRING' }),
    frequency: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).optional().nullable(),
    nextDueDate: z.string().optional().nullable()
  }).refine(data => {
    if (data.type === 'RECURRING' && (!data.frequency || !data.nextDueDate)) {
      return false;
    }
    return true;
  }, {
    message: "Recurring plans require frequency and next due date",
    path: ["frequency"]
  })
});

export const planIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Plan ID')
  })
});
