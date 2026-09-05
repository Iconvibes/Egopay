import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import * as transferController from './transfer.controller.js';
import { nameEnquiryParamsSchema, transferSchema } from './transfer.validation.js';

export const transferRouter = Router();

transferRouter.use(requireAuth);

transferRouter.get(
  '/name-enquiry/:accountNumber',
  validateParams(nameEnquiryParamsSchema),
  transferController.nameEnquiry,
);
transferRouter.post('/', validateBody(transferSchema), transferController.transfer);