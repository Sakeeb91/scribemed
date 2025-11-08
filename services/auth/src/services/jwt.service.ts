import { sign, verify, JwtPayload, Secret } from 'jsonwebtoken';
import type { SignOptions, VerifyOptions } from 'jsonwebtoken';

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
    const options: SignOptions = {
      expiresIn: this.config.jwt.accessTokenTtl as SignOptions['expiresIn'],
      algorithm: 'HS256',
    };
    return sign(payload, this.config.jwt.accessTokenSecret as Secret, options);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const options: VerifyOptions = {
      algorithms: ['HS256'],
    };
    return verify(
      token,
      this.config.jwt.accessTokenSecret as Secret,
      options
    ) as AccessTokenPayload;
  }

  generateRefreshToken(payload: RefreshTokenPayload): string {
    const options: SignOptions = {
      expiresIn: this.config.jwt.refreshTokenTtl as SignOptions['expiresIn'],
      algorithm: 'HS256',
    };
    return sign(payload, this.config.jwt.refreshTokenSecret as Secret, options);
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const options: VerifyOptions = {
      algorithms: ['HS256'],
    };
    return verify(
      token,
      this.config.jwt.refreshTokenSecret as Secret,
      options
    ) as RefreshTokenPayload;
  }
}
