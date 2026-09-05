import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as notificationController from './notification.controller.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get('/', notificationController.listNotifications);
notificationRouter.post('/read-all', notificationController.markAllRead);
notificationRouter.post('/:id/read', notificationController.markRead);