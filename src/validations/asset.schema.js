import { z } from 'zod';

export const createAssetSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Asset name is required'),
    type: z.string().min(1, 'Asset type is required'),
    value: z.number().min(0, 'Asset value cannot be negative'),
    quantity: z.number().optional().nullable()
  })
});

export const updateAssetSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Asset ID'),
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    value: z.number().min(0, 'Asset value cannot be negative').optional(),
    quantity: z.number().optional().nullable()
  })
});

export const assetIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Asset ID'),
  })
});
