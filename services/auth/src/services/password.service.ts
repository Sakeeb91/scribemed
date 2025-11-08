import bcrypt from 'bcrypt';

export interface PasswordValidationResult {
  valid: boolean;
  reasons?: string[];
}

/**
 * Centralises password validation and hashing policies so future changes (such
 * as migrating to argon2) touch a single module.
 */
export class PasswordService {
  constructor(private readonly saltRounds = 12) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  validateStrength(password: string): PasswordValidationResult {
    const failures: string[] = [];

    if (password.length < 12) {
      failures.push('Password must be at least 12 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      failures.push('Password must contain an uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      failures.push('Password must contain a lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      failures.push('Password must contain a number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      failures.push('Password must contain a symbol');
    }

    return {
      valid: failures.length === 0,
      reasons: failures.length ? failures : undefined,
    };
  }
}
