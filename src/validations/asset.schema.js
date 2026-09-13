import { z } from 'zod';

export const createAssetSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Asset name is required'),
    type: z.string().min(1, 'Asset type is required'),
    value: z.coerce.number().min(0, 'Asset value cannot be negative'),
    quantity: z.coerce.number().optional().nullable(),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code').toUpperCase().optional()
  })
});

export const updateAssetSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Asset ID'),
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    value: z.coerce.number().min(0, 'Asset value cannot be negative').optional(),
    quantity: z.coerce.number().optional().nullable(),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code').toUpperCase().optional()
  })
});

export const assetIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Asset ID'),
  })
});

export const transferAssetSchema = z.object({
  body: z.object({
    fromAssetId: z.string().uuid('Invalid source asset ID'),
    toAssetId: z.string().uuid('Invalid destination asset ID'),
    amount: z.coerce.number().min(0.01, 'Transfer amount must be positive'),
    destinationAmount: z.coerce.number().positive('Destination amount must be positive').optional(),
    exchangeRate: z.coerce.number().positive('Exchange rate must be positive').optional(),
    category: z.string().optional(),
    date: z.string().optional(),
    description: z.string().optional()
  })
});
