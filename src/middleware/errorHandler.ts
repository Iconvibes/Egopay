import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/appError.js';
import { logger } from '../lib/logger.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Central error handler. Converts AppError and known Prisma errors into
 * consistent JSON; everything else becomes a generic 500 with the real error
 * only written to the server log. Stack traces and upstream payloads never
 * reach the client.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (res.locals.requestId as string) ?? '-';

  if (err instanceof AppError) {
    logger.warn({ requestId, status: err.statusCode, code: err.code, message: err.message }, 'request failed');
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      logger.warn({ requestId, target }, 'unique constraint violation');
      res.status(409).json({
        error: { code: 'CONFLICT', message: `A record with this ${target} already exists` },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      return;
    }
  }

  logger.error({ requestId, err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred. Please try again later.' },
  });
}