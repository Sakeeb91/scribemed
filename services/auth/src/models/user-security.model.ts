/**
 * Row stored in the `user_security` table to track lockout state.
 */
export interface UserSecurityRecord {
  user_id: string;
  failed_login_attempts: number;
  last_failed_login_at: Date | null;
  locked_until: Date | null;
  password_changed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserSecurityState {
  userId: string;
  failedLoginAttempts: number;
  lastFailedLoginAt?: Date;
  lockedUntil?: Date;
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function mapSecurityRecord(record: UserSecurityRecord): UserSecurityState {
  return {
    userId: record.user_id,
    failedLoginAttempts: record.failed_login_attempts,
    lastFailedLoginAt: record.last_failed_login_at ?? undefined,
    lockedUntil: record.locked_until ?? undefined,
    passwordChangedAt: record.password_changed_at ?? undefined,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function defaultSecurityState(userId: string): UserSecurityState {
  const now = new Date();
  return {
    userId,
    failedLoginAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}
