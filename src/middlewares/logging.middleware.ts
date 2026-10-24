import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.util';

export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`, {
      correlationId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      tenantId: req.tenantId || req.headers['x-tenant-id'],
      durationMs: duration,
      body: req.body,
    });
  });

  next();
}
