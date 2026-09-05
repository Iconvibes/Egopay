import type { Request, Response } from 'express';
import type { AuthedRequest } from '../../middleware/auth.js';
import * as notificationService from './notification.service.js';

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const result = await notificationService.listNotifications((req as AuthedRequest).customer.id, {
    unreadOnly: req.query.unreadOnly === 'true',
  });
  res.json(result);
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const result = await notificationService.markAllRead((req as AuthedRequest).customer.id);
  res.json(result);
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const result = await notificationService.markRead((req as AuthedRequest).customer.id, String(req.params.id));
  res.json(result);
}