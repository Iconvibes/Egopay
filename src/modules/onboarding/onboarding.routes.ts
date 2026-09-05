import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as onboardingController from './onboarding.controller.js';
import { verifyBvnSchema, verifyNinSchema } from './onboarding.validation.js';

export const onboardingRouter = Router();

onboardingRouter.use(requireAuth);

onboardingRouter.post('/bvn', validateBody(verifyBvnSchema), onboardingController.verifyBvn);
onboardingRouter.post('/nin', validateBody(verifyNinSchema), onboardingController.verifyNin);
onboardingRouter.get('/status', onboardingController.status);