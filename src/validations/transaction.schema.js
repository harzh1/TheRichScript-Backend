import { z } from 'zod';

export const createTransactionSchema = z.object({
  body: z.object({
    assetId: z.string().uuid('Invalid Asset ID'),
    toAssetId: z.string().uuid('Invalid target asset ID').optional().nullable(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], { required_error: 'Type must be INCOME, EXPENSE, or TRANSFER' }),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code').toUpperCase().optional(),
    exchangeRate: z.coerce.number().positive('Exchange rate must be positive').optional(),
    targetAmount: z.coerce.number().positive('Target amount must be positive').optional(),
    category: z.string().min(1, 'Category cannot be empty').optional().nullable(),
    incomeSourceId: z.string().uuid().optional().nullable(),
    incomeSource: z.string().optional().nullable(),
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
    toAssetId: z.string().uuid('Invalid target asset ID').optional().nullable(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code').toUpperCase().optional(),
    exchangeRate: z.coerce.number().positive('Exchange rate must be positive').optional(),
    targetAmount: z.coerce.number().positive('Target amount must be positive').optional(),
    category: z.string().min(1, 'Category cannot be empty').optional(),
    incomeSourceId: z.string().uuid().optional().nullable(),
    incomeSource: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    date: z.string().optional(),
    receiptImageUrl: z.string().url().optional().nullable()
  })
});
