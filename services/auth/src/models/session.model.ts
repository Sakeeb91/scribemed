/**
 * Raw session row as returned from PostgreSQL.
 */
export interface SessionRecord {
  session_id: string;
  user_id: string;
  refresh_token: string;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  last_activity_at: Date | null;
  created_at: Date;
}

/**
 * Domain shape used within the auth service.
 */
export interface Session {
  id: string;
  userId: string;
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  lastActivityAt?: Date;
}

export function mapSessionRecord(record: SessionRecord): Session {
  return {
    id: record.session_id,
    userId: record.user_id,
    refreshToken: record.refresh_token,
    ipAddress: record.ip_address ?? undefined,
    userAgent: record.user_agent ?? undefined,
    createdAt: record.created_at,
    expiresAt: record.expires_at,
    revokedAt: record.revoked_at ?? undefined,
    lastActivityAt: record.last_activity_at ?? undefined,
  };
}
