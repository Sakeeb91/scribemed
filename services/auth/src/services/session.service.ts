import { getDatabase } from '@scribemed/database';
import { logger } from '@scribemed/logging';

import { AppConfig } from '../config/env';
import { mapSessionRecord, Session } from '../models/session.model';
import { hashToken } from '../utils/crypto.util';

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateSessionInput {
  sessionId: string;
  userId: string;
  refreshToken: string;
  metadata: SessionMetadata;
}

/**
 * Persists refresh-token backed sessions and coordinates rotation / revocation.
 */
export class SessionService {
  constructor(private readonly config: AppConfig) {}

  async createSession(input: CreateSessionInput): Promise<Session> {
    const db = await getDatabase();
    const expiresAt = new Date(Date.now() + this.config.sessionTtlHours * 60 * 60 * 1000);

    const result = await db.query(
      `INSERT INTO sessions (session_id, user_id, refresh_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.sessionId,
        input.userId,
        hashToken(input.refreshToken),
        input.metadata.ipAddress,
        input.metadata.userAgent,
        expiresAt,
      ]
    );

    return mapSessionRecord(result.rows[0]);
  }

  async rotateSession(
    sessionId: string,
    refreshToken: string,
    metadata: SessionMetadata
  ): Promise<Session> {
    const db = await getDatabase();
    const expiresAt = new Date(Date.now() + this.config.sessionTtlHours * 60 * 60 * 1000);

    const result = await db.query(
      `UPDATE sessions
       SET refresh_token = $2,
           ip_address = COALESCE($3, ip_address),
           user_agent = COALESCE($4, user_agent),
           expires_at = $5,
           last_activity_at = CURRENT_TIMESTAMP
       WHERE session_id = $1 AND revoked_at IS NULL
       RETURNING *`,
      [sessionId, hashToken(refreshToken), metadata.ipAddress, metadata.userAgent, expiresAt]
    );

    if (result.rows.length === 0) {
      throw new Error('Session not found or revoked');
    }

    return mapSessionRecord(result.rows[0]);
  }

  async revokeSession(sessionId: string): Promise<void> {
    const db = await getDatabase();
    await db.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_id = $1`, [
      sessionId,
    ]);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    const db = await getDatabase();
    await db.query(`UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1`, [
      userId,
    ]);
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const db = await getDatabase();
    const result = await db.query(
      `SELECT * FROM sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    return result.rows.map(mapSessionRecord);
  }

  async validateRefreshToken(sessionId: string, refreshToken: string): Promise<Session | null> {
    const db = await getDatabase();
    const result = await db.query(
      `SELECT * FROM sessions
       WHERE session_id = $1
         AND refresh_token = $2
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`,
      [sessionId, hashToken(refreshToken)]
    );

    if (result.rows.length === 0) {
      logger.warn('Refresh token validation failed', { sessionId });
      return null;
    }

    return mapSessionRecord(result.rows[0]);
  }
}
