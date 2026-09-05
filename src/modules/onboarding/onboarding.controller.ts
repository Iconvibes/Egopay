import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../middleware/auth.js';
import * as onboardingService from './onboarding.service.js';

export async function verifyBvn(req: Request, res: Response): Promise<void> {
  const result = await onboardingService.verifyBvn((req as AuthedRequest).customer.id, req.body);
  res.json(result);
}

export async function verifyNin(req: Request, res: Response): Promise<void> {
  const result = await onboardingService.verifyNin((req as AuthedRequest).customer.id, req.body);
  res.json(result);
}

export async function status(req: Request, res: Response): Promise<void> {
  const customer = await onboardingService.getStatus((req as AuthedRequest).customer.id);
  res.json({ customer });
}