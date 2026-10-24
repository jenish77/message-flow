import { Request, Response } from 'express';
import { prisma } from '../../db/prisma';

export class HealthController {
  async getHealth(_req: Request, res: Response): Promise<void> {
    const timestamp = new Date().toISOString();
    try {
      // Simple probe to verify database connectivity without leaking credentials
      await prisma.$queryRaw`SELECT 1`;

      res.status(200).json({
        status: 'ok',
        timestamp,
        services: {
          database: 'up',
        },
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        timestamp,
        services: {
          database: 'down',
        },
      });
    }
  }
}

export const healthController = new HealthController();
