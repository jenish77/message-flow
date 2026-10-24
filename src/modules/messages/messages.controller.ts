import { Request, Response, NextFunction } from 'express';
import { messagesService } from './messages.service';

export class MessagesController {
  async createMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const message = await messagesService.createMessage(req.body);
      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  }

  async getMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const messageId = req.params.messageId;
      const tenantId = req.tenantId!;
      const message = await messagesService.getMessageById(messageId, tenantId);
      res.status(200).json(message);
    } catch (error) {
      next(error);
    }
  }

  async getConversationMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const conversationId = req.params.conversationId;
      const tenantId = req.tenantId!;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

      const result = await messagesService.getConversationMessages(
        conversationId,
        tenantId,
        limit,
        cursor
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const messagesController = new MessagesController();
