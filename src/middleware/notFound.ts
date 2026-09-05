import type { NextFunction, Request, Response } from 'express';
import { Errors } from '../lib/appError.js';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(Errors.notFound('Route not found'));
}