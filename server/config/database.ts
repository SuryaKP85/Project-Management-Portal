import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from './env';

let pool: Pool | null = null;
let isPostgresConnected = false;

export async function initDatabase(): Promise<{ isPostgres: boolean }> {
  if (config.databaseUrl) {
    try {
      pool = new Pool({
        connectionString: config.databaseUrl,
        ssl: config.isProduction ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 3000,
      });

      // Test connection
      const client = await pool.connect();
      client.release();
      isPostgresConnected = true;
      console.log('✅ PostgreSQL database connected successfully.');
      return { isPostgres: true };
    } catch (err: any) {
      console.warn(`⚠️ PostgreSQL connection attempt failed (${err.message}). Using local embedded data store.`);
      isPostgresConnected = false;
      pool = null;
    }
  } else {
    console.log('ℹ️ No DATABASE_URL provided. Running with high-performance local embedded data store.');
  }

  return { isPostgres: false };
}

export async function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  if (pool && isPostgresConnected) {
    return pool.query<T>(text, params);
  }
  throw new Error('Database pool not connected. Use repository adapter fallback.');
}

export function isDbConnected(): boolean {
  return isPostgresConnected;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isPostgresConnected = false;
  }
}
