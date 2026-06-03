import { z, ZodError } from 'zod';

const createPlanSchema = z.object({
  body: z.object({
    assetId: z.string().uuid('Invalid Asset ID'),
    targetAssetId: z.string().uuid('Invalid Target Asset ID').optional().nullable(),
    name: z.string().min(1, 'Plan name is required'),
    category: z.string().min(1, 'Category is required'),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    type: z.enum(['MANUAL', 'RECURRING'], { required_error: 'Type must be MANUAL or RECURRING' }),
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional().nullable(),
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

try {
  createPlanSchema.parse({
    body: {
      assetId: '123e4567-e89b-12d3-a456-426614174000',
      targetAssetId: '123e4567-e89b-12d3-a456-426614174001',
      name: 'Test Plan',
      category: 'TEST',
      amount: 100,
      type: 'RECURRING',
      frequency: 'monthly',
      nextDueDate: '2026-06-03'
    }
  });
} catch (err) {
  if (err instanceof ZodError || err?.name === 'ZodError') {
    try {
      const errorMessages = err.errors.map((e) => `${e.path.join('.')} - ${e.message}`).join(', ');
      console.log('400 BAD REQUEST:', errorMessages);
    } catch (innerErr) {
      console.error('INNER ERROR MAP:', innerErr);
    }
  } else {
    console.log('500 ERROR:', err);
  }
}
