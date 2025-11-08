# Authentication Service

The authentication service provides OAuth-style email/password login with MFA, refresh-token backed session management, and RBAC middleware for downstream services. It exposes REST endpoints under `/api/v1/auth`, `/api/v1/mfa`, and `/api/v1/sessions`.

## Components

- **Controllers** – HTTP handlers for auth, MFA, and session operations.
- **Services** – `AuthService`, `SessionService`, `PasswordService`, `MFAService`, and `JWTService` encapsulate domain logic.
- **Middleware** – `auth.middleware` validates JWT access tokens, `rbac.middleware` enforces role restrictions, and `rate-limit.middleware` protects the surface area.
- **Persistence** – New tables (`user_security`, `sessions`, `password_reset_tokens`, `auth_audit_logs`) track lockouts, refresh tokens, reset requests, and audit trails.

## Key Flows

1. **Registration** – Validates password strength, creates the user, stores security metadata, and emits a verification email (currently logged for local development).
2. **Login** – Verifies credentials, enforces lockouts, challenges for MFA when enabled, creates refresh-backed sessions, and issues JWT access tokens.
3. **Token Refresh** – Validates the refresh token against the session record, rotates the stored hash, and returns new access/refresh tokens.
4. **Password Reset** – Generates hashed reset tokens, emails the user, and revokes all sessions on completion.
5. **Session Management** – Allows authenticated users to list or revoke sessions; privileged roles can enforce organization-wide policies via the RBAC middleware.

## Configuration

Environment variables parsed via `loadConfig`:

| Variable                                               | Description                             |
| ------------------------------------------------------ | --------------------------------------- |
| `AUTH_SERVICE_PORT`                                    | Service port (default: 8085)            |
| `JWT_ACCESS_TOKEN_SECRET` / `JWT_REFRESH_TOKEN_SECRET` | 32+ character secrets for signing JWTs  |
| `JWT_ACCESS_TOKEN_TTL` / `JWT_REFRESH_TOKEN_TTL`       | Access/refresh TTLs (e.g. `15m`, `30d`) |
| `SESSION_TTL_HOURS`                                    | Lifetime of refresh sessions in hours   |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES`                     | Reset token validity window             |
| `MFA_ISSUER`                                           | Issuer label embedded in TOTP seeds     |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS`     | Rate limiting configuration             |

Database credentials come from the shared `@scribemed/database` package and rely on the existing environment (or AWS Secrets Manager in higher environments).

## API Surface

See `docs/api/README.md` for request/response details. High-level endpoints:

| Method   | Path                           | Description                                     |
| -------- | ------------------------------ | ----------------------------------------------- |
| `POST`   | `/api/v1/auth/register`        | Register a user and trigger email verification  |
| `POST`   | `/api/v1/auth/login`           | Login with email/password (+ optional MFA)      |
| `POST`   | `/api/v1/auth/refresh`         | Exchange a refresh token for a new access token |
| `POST`   | `/api/v1/auth/logout`          | Revoke the current session                      |
| `POST`   | `/api/v1/auth/password/forgot` | Request a password reset email                  |
| `POST`   | `/api/v1/auth/password/reset`  | Complete the password reset flow                |
| `POST`   | `/api/v1/mfa/setup`            | Generates an MFA secret and backup codes        |
| `POST`   | `/api/v1/mfa/verify`           | Confirms MFA enrollment                         |
| `DELETE` | `/api/v1/mfa/disable`          | Disables MFA for the current user               |
| `GET`    | `/api/v1/sessions`             | Lists recent sessions                           |
| `DELETE` | `/api/v1/sessions/:sessionId`  | Revokes a specific session                      |

## Security Considerations

- Refresh tokens are hashed with SHA-256 before being stored to guard against leakage.
- Login attempts are throttled via `user_security` counters and rate-limiting middleware.
- MFA uses TOTP with issuer metadata so authenticator apps label accounts correctly.
- Every auth event is recorded in `auth_audit_logs` for traceability.
