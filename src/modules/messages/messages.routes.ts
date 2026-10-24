import { Router } from 'express';
import { messagesController } from './messages.controller';
import { requireTenant } from '../../middlewares/tenant.middleware';
import { validateBody, validateQuery } from '../../middlewares/validation.middleware';
import {
  CreateMessageSchema,
  GetConversationMessagesQuerySchema,
} from './messages.validator';

// Router for /api/v1/messages
export const messagesRouter = Router();

// POST /api/v1/messages
messagesRouter.post(
  '/',
  requireTenant,
  validateBody(CreateMessageSchema),
  messagesController.createMessage.bind(messagesController)
);

// GET /api/v1/messages/:messageId
messagesRouter.get(
  '/:messageId',
  requireTenant,
  messagesController.getMessage.bind(messagesController)
);

// Router for /api/v1/conversations
export const conversationsRouter = Router();

// GET /api/v1/conversations/:conversationId/messages
conversationsRouter.get(
  '/:conversationId/messages',
  requireTenant,
  validateQuery(GetConversationMessagesQuerySchema),
  messagesController.getConversationMessages.bind(messagesController)
);
