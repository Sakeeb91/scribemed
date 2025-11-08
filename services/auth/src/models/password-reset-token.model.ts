export interface PasswordResetTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export function mapPasswordResetToken(record: PasswordResetTokenRecord): PasswordResetToken {
  return {
    id: record.id,
    userId: record.user_id,
    tokenHash: record.token_hash,
    expiresAt: record.expires_at,
    usedAt: record.used_at ?? undefined,
    createdAt: record.created_at,
  };
}
