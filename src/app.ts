import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { accountRouter } from './modules/account/account.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { cronRouter } from './modules/cron/cron.routes.js';
import { devRouter } from './modules/dev/dev.routes.js';
import { notificationRouter } from './modules/notification/notification.routes.js';
import { onboardingRouter } from './modules/onboarding/onboarding.routes.js';
import { transactionRouter } from './modules/transaction/transaction.routes.js';
import { transferRouter } from './modules/transfer/transfer.routes.js';

// Where the built frontend lives (frontend/dist). Resolved relative to this
// module so it works both from src/ (tsx) and from dist/ (compiled build).
const FRONTEND_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist');
const HAS_FRONTEND = fs.existsSync(path.join(FRONTEND_DIST, 'index.html'));

function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'http request',
    );
  });
  next();
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // required for correct rate limiting behind proxies
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      // "*" -> reflect the request origin (no credentials mode), otherwise a
      // comma-separated allowlist.
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);
  // Rate limiting applies to the API only — static assets and the SPA fallback
  // shouldn't consume the per-client request budget.
  app.use('/api', globalLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'egopay-bank', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/onboarding', onboardingRouter);
  app.use('/api/accounts', accountRouter);
  app.use('/api/transfers', transferRouter);
  app.use('/api/transactions', transactionRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api', cronRouter);
  app.use('/api', devRouter);

  if (HAS_FRONTEND) {
    // Serve the built OPay-inspired frontend so the whole app runs on one port
    // with no separate Vite dev server needed. Hashed assets are immutable and
    // cached for 1h, but index.html / sw.js / the manifest must never be
    // HTTP-cached — otherwise browsers and the service worker serve a stale
    // bundle until the cache expires.
    app.use(
      express.static(FRONTEND_DIST, {
        index: 'index.html',
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          const name = path.basename(filePath);
          if (name === 'index.html' || name === 'sw.js' || name === 'manifest.webmanifest') {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    // SPA fallback: client-side routes (/, /home, /send, ...) all render index.html.
    // API paths are untouched and keep returning JSON errors via the handlers above.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      return res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
  } else {
    logger.warn(
      { frontendDist: FRONTEND_DIST },
      'frontend/dist not found — serving API only. Run `npm run build:frontend` to enable the web app.',
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}