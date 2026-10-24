import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocument } from './config/swagger';
import { requestLogging } from './middlewares/logging.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { messagesRouter, conversationsRouter } from './modules/messages/messages.routes';
import { webhooksRouter } from './modules/webhooks/webhooks.routes';
import { healthRouter } from './modules/health/health.routes';

export function createApp(): Application {
  const app = express();

  // Basic security and parsing middleware
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Structured privacy-preserving logging
  app.use(requestLogging);

  // Swagger Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });
  app.get('/docs', (_req: Request, res: Response) => {
    res.redirect('/api-docs');
  });

  // Mount modular API routes
  app.use('/api/v1/messages', messagesRouter);
  app.use('/api/v1/conversations', conversationsRouter);
  app.use('/api/v1/webhooks', webhooksRouter);
  app.use('/health', healthRouter);

  // 404 handler for undefined routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      statusCode: 404,
      error: 'Not Found',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    });
  });

  // Global centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
