import { Request, Response, NextFunction } from 'express';
import { webhooksService } from './webhooks.service';

export class WebhooksController {
  async handleProviderWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await webhooksService.processProviderEvent(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const webhooksController = new WebhooksController();
