import speakeasy from 'speakeasy';

import { AppConfig } from '../config/env';
import { generateSecureToken } from '../utils/token.util';

export interface MfaSetup {
  secret: string;
  otpauthUrl: string;
  backupCodes: string[];
}

/**
 * Handles creation and validation of time-based one-time passwords (TOTP).
 */
export class MFAService {
  constructor(private readonly config: AppConfig) {}

  generateSetup(email: string): MfaSetup {
    const secret = speakeasy.generateSecret({
      length: 32,
      name: `${this.config.mfa.issuer} (${email})`,
    });

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url ?? '',
      backupCodes: this.generateBackupCodes(),
    };
  }

  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });
  }

  private generateBackupCodes(count = 5): string[] {
    return Array.from({ length: count }, () => generateSecureToken(12));
  }
}
