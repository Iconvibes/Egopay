import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { startBalancePoller, stopBalancePoller } from './services/balancePoller.js';

async function main(): Promise<void> {
  // Verify the database is reachable before listening.
  await prisma.$connect();
  logger.info('database connection established');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`egopay-bank listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Background incoming-payment detection: reconciles ledger balances on an
  // interval and records credits + notifications for money that arrived.
  startBalancePoller();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopBalancePoller();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Force-exit if graceful shutdown stalls.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (err) => {
  logger.error({ err }, 'failed to start server');
  await prisma.$disconnect();
  process.exit(1);
});