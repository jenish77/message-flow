import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.util';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Check for JSON parse error
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Malformed JSON payload',
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? 'Internal Server Error' : 'Client Error',
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  logger.error(`Unhandled error during ${req.method} ${req.originalUrl}: ${err.message}`, {
    stack: err.stack,
    correlationId: req.correlationId,
  });

  res.status(500).json({
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected internal error occurred.',
  });
}
