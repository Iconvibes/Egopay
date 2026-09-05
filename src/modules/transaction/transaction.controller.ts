import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../middleware/auth.js';
import * as transactionService from './transaction.service.js';

export async function listTransactions(req: Request, res: Response): Promise<void> {
  const result = await transactionService.listTransactions(
    (req as AuthedRequest).customer.id,
    res.locals.validatedQuery as Parameters<typeof transactionService.listTransactions>[1],
  );
  res.json(result);
}

export async function getTransaction(req: Request, res: Response): Promise<void> {
  const transaction = await transactionService.getTransaction((req as AuthedRequest).customer.id, String(req.params.id));
  res.json({ transaction });
}

export async function getTransactionStatus(req: Request, res: Response): Promise<void> {
  const result = await transactionService.getTransactionStatus(
    (req as AuthedRequest).customer.id,
    String(req.params.id),
  );
  res.json(result);
}