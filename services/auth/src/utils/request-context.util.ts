import { Request } from 'express';

import { RequestContext } from '../services/auth.service';

export function buildRequestContext(req: Request): RequestContext {
  return {
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip,
    userAgent: req.headers['user-agent'],
  };
}
