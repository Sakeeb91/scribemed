import { NextFunction, Request, Response } from 'express';

import { logger } from '@scribemed/logging';

import { AppConfig } from '../config/env';
import { JWTService } from '../services/jwt.service';

export function createAuthMiddleware(config: AppConfig) {
  const jwtService = new JWTService(config);

  const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing bearer token' });
        return;
      }
      const token = header.substring(7);
      const payload = jwtService.verifyAccessToken(token);
      req.user = {
        id: payload.userId,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
        sessionId: payload.sessionId,
      };
      next();
    } catch (error) {
      logger.warn('Authentication failed', { error });
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };

  return { authenticate };
}
