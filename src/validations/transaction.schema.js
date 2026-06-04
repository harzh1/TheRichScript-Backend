import { z } from 'zod';

export const createTransactionSchema = z.object({
  body: z.object({
    assetId: z.string().uuid('Invalid Asset ID'),
    type: z.enum(['INCOME', 'EXPENSE'], { required_error: 'Type must be INCOME or EXPENSE' }),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    category: z.string().min(1, 'Category is required'),
    description: z.string().min(1, 'Description is required'),
    date: z.string(),
    receiptImageUrl: z.string().url().optional().nullable()
  })
});

export const transactionIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Transaction ID')
  })
});
