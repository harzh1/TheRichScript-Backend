import { z } from 'zod';

export const createDebtSchema = z.object({
  body: z.object({
    assetId: z.string().uuid('Invalid Asset ID'),
    type: z.enum(['LENT', 'BORROWED'], { required_error: 'Type must be LENT or BORROWED' }),
    person: z.string().optional(),
    personName: z.string().optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    dueDate: z.string().optional(),
    contactId: z.string().uuid('Invalid Contact ID').optional().nullable(),
    notes: z.string().optional().nullable()
  }).refine(data => data.person || data.personName, {
    message: "Person name is required",
    path: ["personName"]
  })
});

export const settleDebtSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Debt ID'),
  }),
  body: z.object({
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    assetId: z.string().uuid('Invalid Asset ID')
  })
});

export const updateDebtSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Debt ID'),
  }),
  body: z.object({
    assetId: z.string().uuid('Invalid Asset ID').optional(),
    type: z.enum(['LENT', 'BORROWED']).optional(),
    person: z.string().optional(),
    personName: z.string().optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
    dueDate: z.string().optional().nullable(),
    contactId: z.string().uuid('Invalid Contact ID').optional().nullable(),
    notes: z.string().optional().nullable()
  })
});

export const debtIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Debt ID'),
  })
});
