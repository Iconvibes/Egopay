import { z } from 'zod';

export const accountNumberSchema = z.string().regex(/^\d{10}$/, 'Account number must be exactly 10 digits');

export const nameEnquiryParamsSchema = z.object({
  accountNumber: accountNumberSchema,
});

export const transferSchema = z.object({
  to: accountNumberSchema,
  amount: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    z
      .number({ invalid_type_error: 'Amount must be a number' })
      .positive('Amount must be greater than zero')
      .max(10_000_000, 'Amount exceeds the maximum allowed (₦10,000,000)')
      .refine((n) => Number.isFinite(n), 'Amount must be a valid number')
      .refine((n) => Math.round(n * 100) === n * 100, 'Amount can have at most 2 decimal places'),
  ),
  narration: z.string().trim().max(100, 'Narration must be at most 100 characters').optional(),
});