import { TransactionDirection, TransactionStatus } from '@prisma/client';
import { Errors } from '../../lib/appError.js';
import { transactionDto } from '../../lib/dto.js';
import { prisma } from '../../lib/prisma.js';
import { notifyTransferOutcome } from '../notification/notification.service.js';
import { NibssError, nibssClient } from '../../services/nibss/index.js';

export interface ListTransactionsQuery {
  page: number;
  limit: number;
  status?: 'PENDING' | 'SUCCESS' | 'FAILED';
  type?: 'INTRABANK' | 'INTERBANK';
}

/**
 * The customer's OWN transaction history. The customerId filter comes from
 * the authenticated session, so no client-supplied value can widen the scope.
 */
export async function listTransactions(customerId: string, query: ListTransactionsQuery) {
  const where = {
    customerId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: items.map(transactionDto),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * A single transaction owned by the customer. Ownership is enforced here —
 * a transaction id belonging to another customer is indistinguishable from
 * one that does not exist (403).
 */
export async function getTransaction(customerId: string, transactionId: string) {
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, customerId },
  });
  if (!tx) {
    throw Errors.forbidden('You do not have access to this transaction', 'TRANSACTION_ACCESS_DENIED');
  }
  return transactionDto(tx);
}

/**
 * Live status from the NibssByPhoenix TSQ endpoint, synced into our local
 * record. Ownership is enforced before any external call is made.
 */
export async function getTransactionStatus(customerId: string, transactionId: string) {
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, customerId },
  });
  if (!tx) {
    throw Errors.forbidden('You do not have access to this transaction', 'TRANSACTION_ACCESS_DENIED');
  }

  if (!tx.reference) {
    // The external call never completed, so there is no TSQ to query yet.
    return { transaction: transactionDto(tx), source: 'local' };
  }

  let external;
  try {
    external = await nibssClient.getTransactionStatus(tx.reference);
  } catch (err) {
    if (err instanceof NibssError) {
      if (err.statusCode === 404) {
        // Upstream no longer knows this reference; keep our last known state.
        return { transaction: transactionDto(tx), source: 'local', note: err.message };
      }
      if (err.statusCode === 401) throw Errors.badGateway('Fintech authentication with the transaction service failed');
      if (err.code === 'TIMEOUT') throw Errors.gatewayTimeout('The transaction status service timed out. Please try again.');
      if (err.code === 'NETWORK') throw Errors.badGateway('The transaction status service is unreachable. Please try again later.');
      throw Errors.badGateway(`The transaction status service returned an error (${err.message})`);
    }
    throw err;
  }

  const externalStatus = (external.status ?? '').toUpperCase();
  const mapped: TransactionStatus | null =
    externalStatus === 'SUCCESS'
      ? TransactionStatus.SUCCESS
      : externalStatus === 'FAILED'
        ? TransactionStatus.FAILED
        : externalStatus === 'PENDING'
          ? TransactionStatus.PENDING
          : null;

  if (mapped && mapped !== tx.status && tx.status === TransactionStatus.PENDING) {
    // A transfer with a previously-unknown outcome just settled. The update is
    // guarded on status: PENDING so that if two status polls race, exactly one
    // wins the transition and records the debit alert.
    const { count } = await prisma.transaction.updateMany({
      where: { id: tx.id, status: TransactionStatus.PENDING },
      data: { status: mapped, completedAt: new Date() },
    });
    if (count === 1 && tx.direction === TransactionDirection.DEBIT) {
      // Awaited so the alert survives serverless environments (Vercel),
      // where the process is frozen the instant the response is sent.
      await notifyTransferOutcome({
        customerId,
        amount: Number(tx.amount),
        counterparty: tx.recipientName ?? tx.toAccount,
        status: mapped === TransactionStatus.SUCCESS ? 'SUCCESS' : 'FAILED',
      });
    }
    const fresh = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    return { transaction: transactionDto(fresh), source: 'nibss' };
  }

  return { transaction: transactionDto(tx), source: 'nibss' };
}