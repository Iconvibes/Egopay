import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as accountController from './account.controller.js';

export const accountRouter = Router();

accountRouter.use(requireAuth);

// No account-number path parameters anywhere: the customer's own account is
// always derived from the authenticated session, which makes IDOR-style
// account manipulation structurally impossible.
accountRouter.post('/', accountController.createAccount);
accountRouter.get('/me', accountController.getMyAccount);
accountRouter.get('/me/balance', accountController.getMyBalance);