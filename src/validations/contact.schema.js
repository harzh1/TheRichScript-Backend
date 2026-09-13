import { z } from 'zod';

export const createContactSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Contact name is required'),
    phone: z.string().optional().nullable(),
    email: z.string().email('Invalid email').optional().nullable(),
    notes: z.string().optional().nullable()
  })
});

export const updateContactSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Contact ID')
  }),
  body: z.object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
    phone: z.string().optional().nullable(),
    email: z.string().email('Invalid email').optional().nullable(),
    notes: z.string().optional().nullable()
  })
});

export const contactIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Contact ID')
  })
});
