import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateParams, validateQuery } from '../../middleware/validate.js';
import * as transactionController from './transaction.controller.js';
import { listTransactionsQuerySchema, transactionIdParamsSchema } from './transaction.validation.js';

export const transactionRouter = Router();

transactionRouter.use(requireAuth);

transactionRouter.get('/', validateQuery(listTransactionsQuerySchema), transactionController.listTransactions);
transactionRouter.get(
  '/:id/status',
  validateParams(transactionIdParamsSchema),
  transactionController.getTransactionStatus,
);
transactionRouter.get('/:id', validateParams(transactionIdParamsSchema), transactionController.getTransaction);