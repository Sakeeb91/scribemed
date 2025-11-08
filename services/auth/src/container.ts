import { AppConfig } from './config/env';
import { AuthService } from './services/auth.service';

export interface ServiceContainer {
  authService: AuthService;
}

export function createContainer(config: AppConfig): ServiceContainer {
  const authService = new AuthService(config);
  return { authService };
}
