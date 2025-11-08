import { getDatabase } from '@scribemed/database';

export type AuthEventType =
  | 'register'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'mfa_challenge'
  | 'mfa_enabled'
  | 'session_revoked';

export interface AuditLogInput {
  userId?: string;
  event: AuthEventType;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes authentication events to the auth_audit_logs table for traceability.
 */
export class AuditLogService {
  async record(entry: AuditLogInput): Promise<void> {
    const db = await getDatabase();
    await db.query(
      `INSERT INTO auth_audit_logs (user_id, event_type, ip_address, user_agent, success, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.userId ?? null,
        entry.event,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
        entry.success,
        entry.message ?? null,
        entry.metadata ?? {},
      ]
    );
  }
}
