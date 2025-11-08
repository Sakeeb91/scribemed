# API Documentation

This folder will contain API specifications, schema definitions, and integration guides for the platform.

## Authentication & Authorization

| Endpoint                             | Description                                      | Request Body                                                     | Response                                   |
| ------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------ |
| `POST /api/v1/auth/register`         | Create an account and trigger email verification | `{ email, password, firstName, lastName, organizationId, role }` | `201 Created` with `{ message }`           |
| `POST /api/v1/auth/login`            | Login and receive tokens (or MFA challenge)      | `{ email, password, mfaCode? }`                                  | `{ user, tokens?, requiresMfa }`           |
| `POST /api/v1/auth/refresh`          | Rotate refresh token and issue new access token  | `{ sessionId, refreshToken }`                                    | `{ accessToken, refreshToken, sessionId }` |
| `POST /api/v1/auth/logout`           | Revoke the current session                       | `Authorization: Bearer <access>`                                 | `204 No Content`                           |
| `POST /api/v1/auth/password/forgot`  | Request password reset email                     | `{ email }`                                                      | `202 Accepted`                             |
| `POST /api/v1/auth/password/reset`   | Complete password reset                          | `{ token, newPassword }`                                         | `204 No Content`                           |
| `POST /api/v1/mfa/setup`             | Generate TOTP secret + backup codes              | `Authorization` header                                           | `{ secret, otpauthUrl, backupCodes }`      |
| `POST /api/v1/mfa/verify`            | Confirm MFA enrollment                           | `{ code }`                                                       | `204 No Content`                           |
| `DELETE /api/v1/mfa/disable`         | Disable MFA for current user                     | `Authorization` header                                           | `204 No Content`                           |
| `GET /api/v1/sessions`               | List active sessions                             | `Authorization` header                                           | `{ sessions: Session[] }`                  |
| `DELETE /api/v1/sessions/:sessionId` | Revoke a specific session                        | `Authorization` header                                           | `204 No Content`                           |

### Token Format

- **Access tokens**: JWT signed with HS256 containing `userId`, `email`, `role`, `organizationId`, and `sessionId`.
- **Refresh tokens**: JWT signed with HS256 stored hashed in the `sessions` table to enable rotation + revocation.

### Error Handling

All endpoints return JSON errors with `{ error: string }` and contextual HTTP status codes (`400` for validation, `401`/`403` for auth failures, etc.). Audit events are logged to `auth_audit_logs` for every success/failure.
