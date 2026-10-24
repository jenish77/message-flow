import { Request, Response, NextFunction } from 'express';

// Extend Express Request type to include tenantId and correlationId
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      correlationId?: string;
    }
  }
}

export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  const tenantIdHeader = req.headers['x-tenant-id'];

  if (!tenantIdHeader || typeof tenantIdHeader !== 'string' || !tenantIdHeader.trim()) {
    res.status(401).json({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or empty x-tenant-id header. Multi-tenant isolation requires a valid tenant identifier.',
    });
    return;
  }

  const tenantId = tenantIdHeader.trim();

  // If request has a body with tenantId, ensure they match to prevent spoofing
  if (req.body && req.body.tenantId && req.body.tenantId !== tenantId) {
    res.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: `Tenant mismatch: x-tenant-id header ('${tenantId}') does not match payload tenantId ('${req.body.tenantId}').`,
    });
    return;
  }

  req.tenantId = tenantId;
  next();
}
