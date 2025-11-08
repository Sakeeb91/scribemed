import type { Request } from 'express';

declare global {
  namespace Express {
    interface UserClaims {
      id: string;
      email: string;
      role: string;
      organizationId: string;
      sessionId: string;
    }

    interface Request {
      user?: UserClaims;
    }
  }
}

export type AuthenticatedRequest = Request & {
  user: Express.UserClaims;
};
