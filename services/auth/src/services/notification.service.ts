import { logger } from '@scribemed/logging';

/**
 * Placeholder notification service. In production this would delegate to SES or
 * another provider; for now we log the payload so flows can be tested.
 */
export class NotificationService {
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    logger.info('Sending verification email', { email, token });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    logger.info('Sending password reset email', { email, token });
  }
}
