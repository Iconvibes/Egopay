import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../middleware/auth.js';
import * as accountService from './account.service.js';

export async function createAccount(req: Request, res: Response): Promise<void> {
  const account = await accountService.createAccount((req as AuthedRequest).customer.id);
  res.status(201).json({ message: 'Account created successfully', account });
}

export async function getMyAccount(req: Request, res: Response): Promise<void> {
  const account = await accountService.getMyAccount((req as AuthedRequest).customer.id);
  res.json({ account });
}

export async function getMyBalance(req: Request, res: Response): Promise<void> {
  const account = await accountService.getMyBalance((req as AuthedRequest).customer.id);
  res.json({ account });
}