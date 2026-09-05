import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../middleware/auth.js';
import * as transferService from './transfer.service.js';

export async function nameEnquiry(req: Request, res: Response): Promise<void> {
  const result = await transferService.nameEnquiry(String(req.params.accountNumber));
  res.json({ recipient: result });
}

export async function transfer(req: Request, res: Response): Promise<void> {
  const result = await transferService.transfer((req as AuthedRequest).customer.id, req.body);
  res.json(result);
}