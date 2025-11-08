import { randomUUID } from 'crypto';

import { getDatabase } from '@scribemed/database';
import { logger } from '@scribemed/logging';

import { AppConfig } from '../config/env';
import { mapPasswordResetToken } from '../models/password-reset-token.model';
import { Session } from '../models/session.model';
import {
  defaultSecurityState,
  mapSecurityRecord,
  UserSecurityState,
} from '../models/user-security.model';
import { hashToken } from '../utils/crypto.util';
import { generateSecureToken } from '../utils/token.util';

import { AuditLogService } from './audit-log.service';
import { JWTService, AccessTokenPayload } from './jwt.service';
import { MFAService } from './mfa.service';
import { NotificationService } from './notification.service';
import { PasswordService } from './password.service';
import { CreateSessionInput, SessionMetadata, SessionService } from './session.service';

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  role: string;
  context: RequestContext;
}

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
  context: RequestContext;
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  mfaEnabled: boolean;
}

export interface AuthResponse {
  user: AuthenticatedUser;
  tokens?: AuthTokens;
  requiresMfa: boolean;
}

export interface RefreshRequest {
  sessionId: string;
  refreshToken: string;
  context: RequestContext;
}

export interface PasswordResetRequest {
  email: string;
  context: RequestContext;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
  context: RequestContext;
}

interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: string;
  organization_id: string;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  email_verified: boolean;
  is_active: boolean;
}

/**
 * Primary orchestrator that wires together password hashing, MFA, tokens, and sessions.
 */
export class AuthService {
  private readonly passwordService: PasswordService;
  private readonly mfaService: MFAService;
  private readonly jwtService: JWTService;
  private readonly sessionService: SessionService;
  private readonly auditLog: AuditLogService;
  private readonly notificationService: NotificationService;
  private readonly maxFailedAttempts = 5;
  private readonly lockoutMinutes = 30;

  constructor(private readonly config: AppConfig) {
    this.passwordService = new PasswordService();
    this.mfaService = new MFAService(config);
    this.jwtService = new JWTService(config);
    this.sessionService = new SessionService(config);
    this.auditLog = new AuditLogService();
    this.notificationService = new NotificationService();
  }

  async register(request: RegisterRequest): Promise<{ userId: string }> {
    const db = await getDatabase();
    const email = request.email.toLowerCase().trim();

    const existing = await db.query(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );
    if (existing.rows.length > 0) {
      throw new Error('Email already registered');
    }

    const passwordValidation = this.passwordService.validateStrength(request.password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.reasons?.join(', ') ?? 'Weak password');
    }

    const passwordHash = await this.passwordService.hashPassword(request.password);
    const result = await db.query(
      `INSERT INTO users (
        email, password_hash, first_name, last_name, organization_id, role, email_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, false)
      RETURNING id`,
      [
        email,
        passwordHash,
        request.firstName,
        request.lastName,
        request.organizationId,
        request.role,
      ]
    );

    const userId = result.rows[0].id;
    await db.query(
      `INSERT INTO user_security (user_id, failed_login_attempts)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const verificationToken = generateSecureToken(48);
    await this.notificationService.sendVerificationEmail(email, verificationToken);

    await this.auditLog.record({
      event: 'register',
      success: true,
      userId,
      ipAddress: request.context.ipAddress,
      userAgent: request.context.userAgent,
    });

    logger.info('User registered', { userId, email });
    return { userId };
  }

  async login(request: LoginRequest): Promise<AuthResponse> {
    const dbUser = await this.getUserByEmail(request.email.toLowerCase().trim());
    if (!dbUser) {
      await this.auditLog.record({
        event: 'login_failed',
        success: false,
        ipAddress: request.context.ipAddress,
        userAgent: request.context.userAgent,
        message: 'User not found',
      });
      throw new Error('Invalid credentials');
    }

    if (!dbUser.email_verified) {
      throw new Error('Email not verified');
    }

    if (!dbUser.is_active) {
      throw new Error('Account disabled');
    }

    const security = await this.getSecurityState(dbUser.id);
    if (security.lockedUntil && security.lockedUntil > new Date()) {
      throw new Error('Account locked. Try again later.');
    }

    const passwordMatches = await this.passwordService.verifyPassword(
      request.password,
      dbUser.password_hash
    );
    if (!passwordMatches) {
      await this.handleFailedLogin(dbUser.id, security, request.context);
      throw new Error('Invalid credentials');
    }

    await this.resetFailedAttempts(dbUser.id);

    if (dbUser.mfa_enabled) {
      if (!request.mfaCode) {
        return {
          user: this.mapUser(dbUser),
          requiresMfa: true,
        };
      }

      if (!dbUser.mfa_secret || !this.mfaService.verifyToken(dbUser.mfa_secret, request.mfaCode)) {
        await this.auditLog.record({
          event: 'mfa_challenge',
          success: false,
          userId: dbUser.id,
          ipAddress: request.context.ipAddress,
          userAgent: request.context.userAgent,
          message: 'Invalid MFA code',
        });
        throw new Error('Invalid MFA code');
      }
    }

    const tokens = await this.issueTokens(dbUser, request.context);

    await this.auditLog.record({
      event: 'login_success',
      success: true,
      userId: dbUser.id,
      ipAddress: request.context.ipAddress,
      userAgent: request.context.userAgent,
    });

    return {
      user: this.mapUser(dbUser),
      tokens,
      requiresMfa: false,
    };
  }

  async refreshTokens(request: RefreshRequest): Promise<AuthTokens> {
    const payload = this.jwtService.verifyRefreshToken(request.refreshToken);
    if (payload.sessionId !== request.sessionId) {
      throw new Error('Invalid refresh token');
    }

    const session = await this.sessionService.validateRefreshToken(
      request.sessionId,
      request.refreshToken
    );
    if (!session) {
      throw new Error('Session expired');
    }

    const user = await this.getUserById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const newRefreshToken = this.jwtService.generateRefreshToken({
      userId: user.id,
      sessionId: request.sessionId,
    });

    await this.sessionService.rotateSession(request.sessionId, newRefreshToken, request.context);

    const accessToken = this.jwtService.generateAccessToken(
      this.buildAccessPayload(user, request.sessionId)
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      sessionId: request.sessionId,
    };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.sessionService.revokeSession(sessionId);
    await this.auditLog.record({
      event: 'logout',
      success: true,
      userId,
    });
  }

  async listSessions(userId: string): Promise<Session[]> {
    return this.sessionService.getUserSessions(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.sessionService.revokeSession(sessionId);
    await this.auditLog.record({
      event: 'session_revoked',
      success: true,
      userId,
      metadata: { sessionId },
    });
  }

  async requestPasswordReset(request: PasswordResetRequest): Promise<void> {
    const db = await getDatabase();
    const user = await this.getUserByEmail(request.email.toLowerCase().trim());
    if (!user) {
      return;
    }

    const token = generateSecureToken(48);
    const expiresAt = new Date(Date.now() + this.config.passwordResetMinutes * 60 * 1000);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(token), expiresAt]
    );

    await this.notificationService.sendPasswordResetEmail(user.email, token);
    await this.auditLog.record({
      event: 'password_reset_requested',
      success: true,
      userId: user.id,
      ipAddress: request.context.ipAddress,
      userAgent: request.context.userAgent,
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const db = await getDatabase();
    const hashedToken = hashToken(input.token);
    const result = await db.query(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1`,
      [hashedToken]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }

    const token = mapPasswordResetToken(result.rows[0]);
    if (token.usedAt || token.expiresAt < new Date()) {
      throw new Error('Invalid or expired reset token');
    }

    const passwordValidation = this.passwordService.validateStrength(input.newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.reasons?.join(', ') ?? 'Weak password');
    }

    const passwordHash = await this.passwordService.hashPassword(input.newPassword);
    await db.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      token.userId,
      passwordHash,
    ]);
    await db.query(`UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, [
      token.id,
    ]);

    await this.sessionService.revokeAllSessions(token.userId);
    await this.auditLog.record({
      event: 'password_reset_completed',
      success: true,
      userId: token.userId,
    });
  }

  async initMfa(
    userId: string
  ): Promise<{ secret: string; otpauthUrl: string; backupCodes: string[] }> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const setup = this.mfaService.generateSetup(user.email);
    const db = await getDatabase();
    await db.query(`UPDATE users SET mfa_secret = $2, mfa_enabled = false WHERE id = $1`, [
      userId,
      setup.secret,
    ]);
    return setup;
  }

  async verifyMfa(userId: string, code: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user || !user.mfa_secret) {
      throw new Error('MFA not initialised');
    }

    if (!this.mfaService.verifyToken(user.mfa_secret, code)) {
      throw new Error('Invalid MFA code');
    }

    const db = await getDatabase();
    await db.query(`UPDATE users SET mfa_enabled = true WHERE id = $1`, [userId]);
    await this.auditLog.record({
      event: 'mfa_enabled',
      success: true,
      userId,
    });
  }

  async disableMfa(userId: string): Promise<void> {
    const db = await getDatabase();
    await db.query(`UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1`, [
      userId,
    ]);
  }

  private async issueTokens(user: DbUser, context: SessionMetadata): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const refreshToken = this.jwtService.generateRefreshToken({
      userId: user.id,
      sessionId,
    });

    const sessionInput: CreateSessionInput = {
      sessionId,
      userId: user.id,
      refreshToken,
      metadata: context,
    };
    await this.sessionService.createSession(sessionInput);

    const accessToken = this.jwtService.generateAccessToken(
      this.buildAccessPayload(user, sessionId)
    );

    return {
      accessToken,
      refreshToken,
      sessionId,
    };
  }

  private buildAccessPayload(user: DbUser, sessionId: string): AccessTokenPayload {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      sessionId,
    };
  }

  private mapUser(user: DbUser): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      organizationId: user.organization_id,
      mfaEnabled: user.mfa_enabled,
    };
  }

  private async getUserByEmail(email: string): Promise<DbUser | null> {
    const db = await getDatabase();
    const result = await db.query(`SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`, [
      email,
    ]);
    return result.rows[0] ?? null;
  }

  private async getUserById(userId: string): Promise<DbUser | null> {
    const db = await getDatabase();
    const result = await db.query(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [
      userId,
    ]);
    return result.rows[0] ?? null;
  }

  private async getSecurityState(userId: string): Promise<UserSecurityState> {
    const db = await getDatabase();
    const result = await db.query(`SELECT * FROM user_security WHERE user_id = $1`, [userId]);
    if (result.rows.length === 0) {
      return defaultSecurityState(userId);
    }
    return mapSecurityRecord(result.rows[0]);
  }

  private async handleFailedLogin(
    userId: string,
    security: UserSecurityState,
    context: RequestContext
  ): Promise<void> {
    const attempts = security.failedLoginAttempts + 1;
    const lockedUntil =
      attempts >= this.maxFailedAttempts
        ? new Date(Date.now() + this.lockoutMinutes * 60 * 1000)
        : null;

    const db = await getDatabase();
    await db.query(
      `INSERT INTO user_security (user_id, failed_login_attempts, last_failed_login_at, locked_until)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET failed_login_attempts = $2, last_failed_login_at = CURRENT_TIMESTAMP, locked_until = $3`,
      [userId, attempts, lockedUntil]
    );

    await this.auditLog.record({
      event: 'login_failed',
      success: false,
      userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      message: lockedUntil ? 'Account locked due to failures' : 'Invalid password',
    });
  }

  private async resetFailedAttempts(userId: string): Promise<void> {
    const db = await getDatabase();
    await db.query(
      `UPDATE user_security
       SET failed_login_attempts = 0,
           last_failed_login_at = NULL,
           locked_until = NULL
       WHERE user_id = $1`,
      [userId]
    );
  }
}
