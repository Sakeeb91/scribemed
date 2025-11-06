/**
 * Minimal structured logger interface that mirrors the methods we use across the project.
 * The implementation wraps `console` to avoid an additional runtime dependency while
 * still providing a centralised logging contract.
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Creates a logger instance with a consistent prefix so log aggregation can
 * group messages originating from the same subsystem.
 */
function createConsoleLogger(namespace: string): Logger {
  const formatContext = (context?: Record<string, unknown>): string =>
    context ? ` ${JSON.stringify(context)}` : '';

  return {
    debug(message, context) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug(`[${namespace}] ${message}${formatContext(context)}`);
      }
    },
    info(message, context) {
      console.info(`[${namespace}] ${message}${formatContext(context)}`);
    },
    warn(message, context) {
      console.warn(`[${namespace}] ${message}${formatContext(context)}`);
    },
    error(message, context) {
      console.error(`[${namespace}] ${message}${formatContext(context)}`);
    },
  };
}

/**
 * Shared logger instance used throughout the repository. In the future we can
 * swap the implementation to a structured logger such as Pino without changing
 * any call sites.
 */
export const logger = createConsoleLogger('scribemed');
