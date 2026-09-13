import { z } from 'zod';

export const createTransactionSchema = z.object({
  body: z.object({
    assetId: z.string().uuid('Invalid Asset ID'),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], { required_error: 'Type must be INCOME, EXPENSE, or TRANSFER' }),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    category: z.string().min(1, 'Category cannot be empty').optional().nullable(),
    description: z.string().optional().nullable(),
    date: z.string(),
    receiptImageUrl: z.string().url().optional().nullable()
  })
});

export const transactionIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Transaction ID')
  })
});

export const updateTransactionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Transaction ID')
  }),
  body: z.object({
    assetId: z.string().uuid('Invalid Asset ID').optional(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
    category: z.string().min(1, 'Category cannot be empty').optional(),
    incomeSourceId: z.string().uuid().optional().nullable(),
    incomeSource: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    date: z.string().optional(),
    receiptImageUrl: z.string().url().optional().nullable()
  })
});
