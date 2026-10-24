import { Router } from 'express';
import { webhooksController } from './webhooks.controller';
import { validateBody } from '../../middlewares/validation.middleware';
import { ProviderWebhookSchema } from './webhooks.validator';

const router = Router();

// POST /api/v1/webhooks/provider
router.post(
  '/provider',
  validateBody(ProviderWebhookSchema),
  webhooksController.handleProviderWebhook.bind(webhooksController)
);

export const webhooksRouter = router;
