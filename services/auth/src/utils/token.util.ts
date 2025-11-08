import { randomBytes } from 'crypto';

/**
 * Generates a URL-safe token using random bytes. The resulting token omits
 * ambiguous characters so it can be sent via email or SMS safely.
 */
export function generateSecureToken(byteLength = 48): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Creates a short numeric code (used for MFA challenges) with leading zeros
 * preserved.
 */
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  const code = Math.floor(Math.random() * max).toString();
  return code.padStart(digits, '0');
}

/**
 * Convenience helper to produce refresh tokens with sufficient entropy.
 */
export function generateRefreshToken(): string {
  return generateSecureToken(64);
}
