import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().optional(),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    country: z.string().length(2, 'Country must be a 2-letter ISO code (e.g. IN, US)').toUpperCase().optional(),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code (e.g. INR, USD)').toUpperCase().optional()
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required')
  })
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required').optional(),
    lastName: z.string().optional(),
    country: z.string().length(2, 'Country must be a 2-letter ISO code (e.g. IN, US)').toUpperCase().optional(),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code (e.g. INR, USD)').toUpperCase().optional()
  })
});

export const updatePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters long')
  })
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required')
  })
});
