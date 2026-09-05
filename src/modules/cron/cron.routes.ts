import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../../config/env.js';
import { Errors } from '../../lib/appError.js';
import { prisma } from '../../lib/prisma.js';
import { syncAccountBalance } from '../../services/balanceSync.js';

function requireCronSecret(req: Request, _res: Response, next: NextFunction): void {
  if (!env.CRON_SECRET) {
    throw Errors.notFound('Cron endpoint is not enabled', 'CRON_DISABLED');
  }
  // Vercel Cron sends the secret in the Authorization header
  // (CRON_SECRET env var is injected as a Bearer token automatically).
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-cron-secret'] as string | undefined);
  if (token !== env.CRON_SECRET) {
    throw Errors.forbidden('Invalid cron secret', 'INVALID_CRON_SECRET');
  }
  next();
}

export const cronRouter = Router();

/**
 * Reconciles every account's ledger balance — the serverless replacement for
 * the in-process background poller. Triggered by Vercel Cron (or any external
 * scheduler) via GET /api/cron/reconcile with the CRON_SECRET. Each pass
 * detects and records incoming payments exactly like the poller does.
 */
cronRouter.get('/cron/reconcile', requireCronSecret, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const accounts = await prisma.account.findMany({ select: { id: true, accountNumber: true } });
    const results = await Promise.allSettled(accounts.map((a) => syncAccountBalance(a.id, a.accountNumber)));
    const credits = results.filter((r) => r.status === 'fulfilled' && r.value?.creditDetected).length;
    const failures = results.filter((r) => r.status === 'rejected').length;
    res.json({ ok: true, accounts: accounts.length, creditsDetected: credits, failures });
  } catch (err) {
    next(err);
  }
});
