import { z } from 'zod';

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED']).optional(),
  type: z.enum(['INTRABANK', 'INTERBANK']).optional(),
});

export const transactionIdParamsSchema = z.object({
  id: z.string().min(1, 'Transaction id is required').max(64, 'Invalid transaction id'),
});