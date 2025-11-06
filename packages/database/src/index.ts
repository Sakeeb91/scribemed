import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '@scribemed/logging';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

/**
 * Runtime database configuration resolved from environment variables or secrets.
 */
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

/**
 * Singleton manager that encapsulates a PostgreSQL connection pool while providing
 * structured logging and helper utilities for higher-level services.
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool;

  private constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max,
      idleTimeoutMillis: config.idleTimeoutMillis,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      ssl: config.ssl
        ? {
            rejectUnauthorized: true,
            ca: process.env.RDS_CA_CERT,
          }
        : false,
      application_name: 'ai-med-docs',
    });

    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected database pool error', { error: err });
    });

    this.pool.on('connect', () => {
      logger.debug('New database connection established');
    });
  }

  /**
   * Returns the shared database connection instance, initialising it on first use.
   */
  public static async getInstance(): Promise<DatabaseConnection> {
    if (!DatabaseConnection.instance) {
      const config = await DatabaseConnection.loadConfig();
      DatabaseConnection.instance = new DatabaseConnection(config);
    }
    return DatabaseConnection.instance;
  }

  /**
   * Loads configuration values and secrets for the connection pool.
   */
  private static async loadConfig(): Promise<DatabaseConfig> {
    let password = process.env.DB_PASSWORD;

    // Load password from AWS Secrets Manager in production
    if (process.env.ENVIRONMENT === 'production' || process.env.ENVIRONMENT === 'staging') {
      const secretsManager = new SecretsManagerClient({
        region: process.env.AWS_REGION,
      });

      try {
        const secretName = `ai-med-docs/db-password-${process.env.ENVIRONMENT}`;
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const secret = await secretsManager.send(command);
        if (!secret.SecretString) {
          throw new Error(`Secret ${secretName} does not contain a string payload`);
        }
        password = secret.SecretString;
      } catch (error) {
        logger.error('Failed to load database password from Secrets Manager', { error });
        throw error;
      }
    }

    if (!password) {
      const message =
        'Database password is not configured. Set DB_PASSWORD or configure Secrets Manager.';
      logger.error(message);
      throw new Error(message);
    }

    return {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password,
      ssl: process.env.ENVIRONMENT !== 'development',
      max: parseInt(process.env.DB_POOL_SIZE || '20'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  /**
   * Executes a SQL query against the shared pool and logs slow operations.
   */
  public async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      // Log slow queries
      if (duration > 1000) {
        logger.warn('Slow query detected', {
          query: text,
          duration,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      logger.error('Database query error', {
        query: text,
        params,
        error,
      });
      throw error;
    }
  }

  /**
   * Runs the provided callback inside a SQL transaction, committing or rolling back automatically.
   */
  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sets PostgreSQL session parameters so row level security policies know the active actor.
   */
  public async setUserContext(userId: string, organizationId: string): Promise<void> {
    await this.query(`SELECT set_config('app.current_user_id', $1, false)`, [userId]);
    await this.query(`SELECT set_config('app.current_organization_id', $2, false)`, [
      organizationId,
    ]);
  }

  /**
   * Performs a lightweight health check by issuing a trivial query.
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Closes the underlying pool and releases its connections.
   */
  public async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database pool closed');
  }

  /**
   * Exposes the raw pool for consumers that need lower level access.
   */
  public getPool(): Pool {
    return this.pool;
  }
}

/**
 * Convenience helper that mirrors the previous export style.
 */
export async function getDatabase(): Promise<DatabaseConnection> {
  return DatabaseConnection.getInstance();
}
