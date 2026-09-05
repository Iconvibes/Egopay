import { Errors } from '../../lib/appError.js';
import { notificationDto } from '../../lib/dto.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Records an outgoing-transfer settlement alert (success or failure) — the
 * debit-alert counterpart to incoming credits. Called when a transfer settles
 * immediately at send time, and when a PENDING transfer later resolves via a
 * TSQ status sync.
 */
export async function notifyTransferOutcome(input: {
  customerId: string;
  amount: number;
  /** Resolved recipient name, or the account number when unknown. */
  counterparty: string;
  status: 'SUCCESS' | 'FAILED';
}): Promise<void> {
  const amt = input.amount.toFixed(2);
  const to = input.counterparty;
  try {
    await prisma.notification.create({
      data: {
        customerId: input.customerId,
        kind: input.status === 'SUCCESS' ? 'OUTGOING_SUCCESS' : 'OUTGOING_FAILED',
        title: input.status === 'SUCCESS' ? 'Transfer successful' : 'Transfer failed',
        message:
          input.status === 'SUCCESS'
            ? `You sent ₦${amt} to ${to}`
            : `Your transfer of ₦${amt} to ${to} was not completed`,
        amount: input.amount,
      },
    });
  } catch (err) {
    // Alerts are auxiliary — never let a notification failure break a transfer
    // response or a status sync.
    logger.warn({ err: String(err) }, 'failed to record transfer outcome notification');
  }
}

export async function listNotifications(customerId: string, opts: { unreadOnly?: boolean }) {
  const where = {
    customerId,
    ...(opts.unreadOnly ? { read: false } : {}),
  };

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { customerId, read: false } }),
  ]);

  return { items: items.map(notificationDto), unreadCount };
}

export async function markAllRead(customerId: string) {
  await prisma.notification.updateMany({
    where: { customerId, read: false },
    data: { read: true },
  });
  return { ok: true };
}

export async function markRead(customerId: string, notificationId: string) {
  // Ownership is enforced here: a notification id belonging to another
  // customer is indistinguishable from one that does not exist.
  const found = await prisma.notification.findFirst({ where: { id: notificationId, customerId } });
  if (!found) {
    throw Errors.notFound('Notification not found');
  }
  await prisma.notification.update({ where: { id: found.id }, data: { read: true } });
  return { ok: true };
}