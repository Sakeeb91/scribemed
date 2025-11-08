import jwt, { JwtPayload } from 'jsonwebtoken';

import { AppConfig } from '../config/env';

export interface AccessTokenPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  sessionId: string;
}

export interface RefreshTokenPayload extends JwtPayload {
  userId: string;
  sessionId: string;
}

/**
 * Small wrapper around jsonwebtoken so the rest of the codebase interacts with
 * a typed interface instead of raw strings.
 */
export class JWTService {
  constructor(private readonly config: AppConfig) {}

  generateAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.config.jwt.accessTokenSecret, {
      expiresIn: this.config.jwt.accessTokenTtl,
      algorithm: 'HS256',
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, this.config.jwt.accessTokenSecret, {
      algorithms: ['HS256'],
    }) as AccessTokenPayload;
  }

  generateRefreshToken(payload: RefreshTokenPayload): string {
    return jwt.sign(payload, this.config.jwt.refreshTokenSecret, {
      expiresIn: this.config.jwt.refreshTokenTtl,
      algorithm: 'HS256',
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return jwt.verify(token, this.config.jwt.refreshTokenSecret, {
      algorithms: ['HS256'],
    }) as RefreshTokenPayload;
  }
}
