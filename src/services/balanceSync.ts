import { Prisma, TransactionDirection, TransactionStatus, TransactionType } from '@prisma/client';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { nibssClient } from './nibss/index.js';

export interface BalanceSyncResult {
  /** Fresh ledger balance, already persisted to the local cache. */
  balance: number;
  /** True when an incoming payment was detected and recorded. */
  creditDetected: boolean;
  /** Amount of the detected incoming payment (when creditDetected). */
  amount?: number;
}

/**
 * Serializes syncs per account so a poll tick and a user-initiated balance
 * refresh can never double-record the same incoming payment.
 */
const inFlight = new Map<string, Promise<BalanceSyncResult | null>>();

/**
 * Fetches the live ledger balance for an account and reconciles it with the
 * local cache. The external API never exposes incoming transfers, so an
 * incoming payment is *detected* as a positive delta (ledger > cache): money
 * arrived that this app did not send out. That delta is recorded as an
 * INCOMING/CREDIT transaction plus a Notification, so the payment surfaces in
 * history and as an in-app alert.
 *
 * Callers: the background poller and every user-initiated balance query.
 * Throws when the external API is unreachable (callers decide how to surface).
 */
export async function syncAccountBalance(accountId: string, accountNumber: string): Promise<BalanceSyncResult | null> {
  const existing = inFlight.get(accountId);
  if (existing) {
    // A sync for this account is already running — share its outcome instead
    // of racing it (avoids duplicate CREDIT records from concurrent calls).
    return existing;
  }

  const task = (async (): Promise<BalanceSyncResult | null> => {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) return null;

    const res = await nibssClient.getBalance(accountNumber);
    const ledger = Math.round(res.balance * 100) / 100;
    const cache = Math.round(Number(account.balance) * 100) / 100;
    const delta = Math.round((ledger - cache) * 100) / 100;

    // Positive delta = incoming payment. (>= 1 kobo; float-safety margin.)
    if (delta >= 0.01) {
      const amount = delta;
      // Synthetic unique reference: the same credit can never be recorded
      // twice — a concurrent sync that computes the same reference loses the
      // unique-constraint race and is treated as already recorded.
      const reference = `INCOMING-${accountNumber}-${Math.round(ledger * 100)}-${Date.now()}`;
      try {
        await prisma.$transaction([
          prisma.transaction.create({
            data: {
              customerId: account.customerId,
              reference,
              fromAccount: 'EXTERNAL', // sender details are not exposed upstream
              toAccount: accountNumber,
              amount,
              type: TransactionType.INCOMING,
              direction: TransactionDirection.CREDIT,
              status: TransactionStatus.SUCCESS,
              narration: 'Incoming transfer',
              completedAt: new Date(),
            },
          }),
          prisma.notification.create({
            data: {
              customerId: account.customerId,
              kind: 'INCOMING_CREDIT',
              title: 'Payment received',
              message: `You received ₦${amount.toFixed(2)}`,
              amount,
            },
          }),
          prisma.account.update({ where: { id: accountId }, data: { balance: ledger } }),
        ]);
        logger.info({ accountId, amount }, 'incoming payment detected on ledger');
        return { balance: ledger, creditDetected: true, amount };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Another sync already recorded this credit — only refresh the cache.
          await prisma.account.update({ where: { id: accountId }, data: { balance: ledger } });
          return { balance: ledger, creditDetected: false };
        }
        throw err;
      }
    }

    // Negative delta should not happen (only this app debits the account);
    // if it does, trust the ledger and resync the cache so the next diff is 0.
    if (delta <= -0.01) {
      logger.warn({ accountId, delta }, 'ledger balance fell without a local transfer — cache resynced');
    }
    await prisma.account.update({ where: { id: accountId }, data: { balance: ledger } });
    return { balance: ledger, creditDetected: false };
  })();

  inFlight.set(accountId, task);
  try {
    return await task;
  } finally {
    inFlight.delete(accountId);
  }
}

/**
 * Best-effort variant for fire-and-forget call sites (e.g. after a transfer)
 * where a failure must not fail the surrounding operation.
 */
export async function syncAccountBalanceBestEffort(accountId: string, accountNumber: string): Promise<void> {
  try {
    await syncAccountBalance(accountId, accountNumber);
  } catch {
    // Cache refresh is best-effort; the poller / next query will retry.
  }
}