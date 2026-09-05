import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { syncAccountBalance } from './balanceSync.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * One pass over every open account. Failures are isolated per account
 * (Promise.allSettled) and a failed pass never crashes the loop.
 */
async function tick(): Promise<void> {
  if (running) return; // don't overlap passes
  running = true;
  try {
    const accounts = await prisma.account.findMany({ select: { id: true, accountNumber: true } });
    if (accounts.length === 0) return;
    const results = await Promise.allSettled(accounts.map((a) => syncAccountBalance(a.id, a.accountNumber)));
    const failures = results.filter((r) => r.status === 'rejected').length;
    if (failures > 0) {
      logger.warn({ failures, total: accounts.length }, 'balance poller: some accounts failed to sync');
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          logger.warn(
            { account: accounts[i]?.accountNumber, err: r.reason instanceof Error ? r.reason.message : String(r.reason) },
            'balance poller: account sync rejected',
          );
        }
      });
    }
  } catch (err) {
    logger.warn({ err: String(err) }, 'balance poller pass failed');
  } finally {
    running = false;
  }
}

/** Start the incoming-payment poller. Idempotent; safe to call once at boot. */
export function startBalancePoller(): void {
  if (timer) return;
  const intervalMs = env.BALANCE_POLL_INTERVAL_S * 1000;
  // First pass immediately, then on the interval.
  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  logger.info({ intervalS: env.BALANCE_POLL_INTERVAL_S }, 'balance poller started (incoming-payment detection)');
}

export function stopBalancePoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}