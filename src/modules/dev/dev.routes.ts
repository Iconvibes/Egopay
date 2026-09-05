import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../../config/env.js';
import { Errors } from '../../lib/appError.js';
import { validateBody } from '../../middleware/validate.js';
import * as devController from './dev.controller.js';
import { seedBvnSchema, seedNinSchema } from './dev.validation.js';

function requireDevAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!env.DEV_ADMIN_KEY) {
    throw Errors.notFound('Dev utilities are not enabled', 'DEV_UTILITIES_DISABLED');
  }
  if (req.headers['x-admin-key'] !== env.DEV_ADMIN_KEY) {
    throw Errors.forbidden('Invalid admin key', 'INVALID_ADMIN_KEY');
  }
  next();
}

export const devRouter = Router();

devRouter.post('/dev/seed-bvn', requireDevAdmin, validateBody(seedBvnSchema), devController.seedBvn);
devRouter.post('/dev/seed-nin', requireDevAdmin, validateBody(seedNinSchema), devController.seedNin);