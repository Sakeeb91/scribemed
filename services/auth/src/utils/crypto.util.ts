import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Creates a SHA-256 hash that can be stored in the database instead of the
 * original token. Hashing prevents leakage if the tokens table is compromised.
 */
export function hashToken(rawValue: string): string {
  return createHash('sha256').update(rawValue).digest('hex');
}

/**
 * Generates a cryptographically strong random secret that can be used for MFA
 * seeds or reset tokens.
 */
export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Performs a constant time comparison to minimise timing attacks when comparing
 * hashed values.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}
