import { AsyncLocalStorage } from 'async_hooks';
import fs from 'fs';
import path from 'path';
import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';
import { config } from './env';
import { holdSaves, releaseSaves, setPostgresStore } from './persistence';

let pool: Pool | null = null;
let isPostgresConnected = false;

/**
 * Sprint 24 — values cross the database boundary in the application's own
 * types. A DATE (OID 1082) stays the 'YYYY-MM-DD' text PostgreSQL sends: the
 * driver default turns it into a local-midnight Date, which serialises as the
 * previous day east of UTC and broke every string comparison in the services.
 * NUMERIC (OID 1700) becomes a number instead of text (progress values were
 * concatenated). TIMESTAMP columns keep the driver's Date (an exact instant).
 */
export const PG_DATE_OID = 1082;
export const PG_NUMERIC_OID = 1700;
types.setTypeParser(PG_DATE_OID, (value: string) => value);
types.setTypeParser(PG_NUMERIC_OID, (value: string) => Number(value));

/** Sprint 24: a statement still running after this long is cancelled by PostgreSQL. */
export const STATEMENT_TIMEOUT_MS = 60_000;

/**
 * Sprint 24 — TLS for the PostgreSQL connection. In production the server
 * certificate is verified by default (optionally against PM_PORTAL_DB_SSL_CA_FILE);
 * PM_PORTAL_DB_SSL_ALLOW_UNVERIFIED=true is the explicit, never-default opt-out.
 * Outside production TLS is off unless a CA file is configured (as before;
 * sslmode in DATABASE_URL still applies). Certificate contents are never logged.
 *
 * node-postgres lets TLS parameters in DATABASE_URL (sslmode, ssl,
 * uselibpqcompat, sslrootcert/sslcert/sslkey) replace this option entirely, so
 * startup refuses the combinations that would silently undo it: a CA file
 * next to URL TLS parameters (the CA would be ignored), and — in production
 * without the explicit opt-out — URL parameters that turn TLS or certificate
 * verification off. The URL itself is never printed.
 */
function urlTlsSettings(databaseUrl: string): { present: boolean; unverified: boolean } {
  let params: URLSearchParams;
  try {
    params = new URL(databaseUrl).searchParams;
  } catch {
    return { present: false, unverified: false };
  }
  const mode = (params.get('sslmode') || '').toLowerCase();
  const present = ['sslmode', 'ssl', 'uselibpqcompat', 'sslrootcert', 'sslcert', 'sslkey'].some((k) => params.has(k));
  const unverified =
    ['disable', 'no-verify'].includes(mode) ||
    ['false', '0'].includes((params.get('ssl') || '').toLowerCase()) ||
    (params.get('uselibpqcompat') === 'true' && !['verify-ca', 'verify-full'].includes(mode));
  return { present, unverified };
}

export function databaseSslOptions(env: NodeJS.ProcessEnv = process.env, isProduction = config.isProduction, databaseUrl = config.databaseUrl): false | { rejectUnauthorized: boolean; ca?: string } {
  const caFile = (env.PM_PORTAL_DB_SSL_CA_FILE || '').trim();
  const allowUnverified = env.PM_PORTAL_DB_SSL_ALLOW_UNVERIFIED === 'true';
  const fromUrl = urlTlsSettings(databaseUrl || '');
  if (caFile && fromUrl.present) {
    throw new DatabaseStartupError('PM_PORTAL_DB_SSL_CA_FILE cannot be combined with TLS parameters in DATABASE_URL (sslmode, ssl, uselibpqcompat, sslrootcert, sslcert, sslkey): the URL settings would replace the CA. Remove them from DATABASE_URL.');
  }
  if (isProduction && fromUrl.unverified && !allowUnverified) {
    throw new DatabaseStartupError('DATABASE_URL turns off TLS or server-certificate verification (sslmode, ssl or uselibpqcompat). Remove that setting, or set PM_PORTAL_DB_SSL_ALLOW_UNVERIFIED=true to accept it explicitly.');
  }
  if (!isProduction && !caFile) return false;
  const ssl: { rejectUnauthorized: boolean; ca?: string } = { rejectUnauthorized: !allowUnverified };
  if (caFile) {
    try {
      ssl.ca = fs.readFileSync(caFile, 'utf8');
    } catch (err: any) {
      throw new DatabaseStartupError(`PM_PORTAL_DB_SSL_CA_FILE could not be read (${caFile}): ${err.code || err.message}`);
    }
  }
  return ssl;
}

/** Sprint 24: an error on an idle pooled client is logged; the pool replaces the client (the process must not crash). */
export function onPoolError(err: Error): void {
  console.error('PostgreSQL pool error (the connection will be replaced):', err.message);
}

/** Sprint 20: a startup condition the server must not run past. */
export class DatabaseStartupError extends Error {}

/** The schema applied at startup in PostgreSQL mode (PM_PORTAL_SCHEMA_FILE overrides). */
export function schemaFilePath(): string {
  return path.resolve(process.env.PM_PORTAL_SCHEMA_FILE || path.join(process.cwd(), 'server', 'db', 'schema.sql'));
}

/** Applies the idempotent schema file in one round trip; any failure stops startup. */
export async function applySchema(db: { query: (sql: string) => Promise<unknown> }, file = schemaFilePath()): Promise<void> {
  let sql: string;
  try {
    sql = fs.readFileSync(file, 'utf8');
  } catch (err: any) {
    throw new DatabaseStartupError(`The database schema file could not be read (${file}): ${err.message}`);
  }
  try {
    await db.query(sql);
  } catch (err: any) {
    throw new DatabaseStartupError(`The database schema could not be applied (${file}): ${err.message}`);
  }
}

/**
 * Sprint 20 — PostgreSQL or nothing. When DATABASE_URL is set the database
 * must be reachable and its schema applied, otherwise startup fails: a
 * configured PostgreSQL deployment never quietly becomes an in-memory one.
 * Without DATABASE_URL the embedded store is used (see persistence.ts).
 */
export async function initDatabase(): Promise<{ isPostgres: boolean }> {
  if (!config.databaseUrl) return { isPostgres: false };
  const candidate = new Pool({
    connectionString: config.databaseUrl,
    ssl: databaseSslOptions(),
    connectionTimeoutMillis: 3000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });
  candidate.on('error', onPoolError);
  try {
    const client = await candidate.connect();
    client.release();
  } catch (err: any) {
    await candidate.end().catch(() => {});
    throw new DatabaseStartupError(
      `DATABASE_URL is set but PostgreSQL could not be reached (${err.message}). The server does not fall back to the embedded store when PostgreSQL is configured: fix the connection, or remove DATABASE_URL to use the embedded store.`
    );
  }
  try {
    await applySchema(candidate);
  } catch (err) {
    await candidate.end().catch(() => {});
    throw err;
  }
  pool = candidate;
  isPostgresConnected = true;
  setPostgresStore(true);
  console.log('✅ PostgreSQL connected and schema applied.');
  return { isPostgres: true };
}

export async function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  // Sprint 18: inside withTransaction every query runs on the transaction's client.
  const tx = transactionStorage.getStore();
  if (tx?.client) {
    return tx.client.query<T>(text, params);
  }
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
    setPostgresStore(false);
  }
}

/** Sprint 24 — readiness: in PostgreSQL mode, whether the database answers a trivial query now. */
export async function databaseReady(): Promise<boolean> {
  if (!isPostgresConnected) return true;
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ====================================================================
// Sprint 18 — transactions.
//
// withTransaction(fn) runs fn as one unit of work:
// - PostgreSQL: BEGIN on a dedicated pool client; every query() issued
//   inside fn (in its async context) uses that client; COMMIT when fn
//   resolves, ROLLBACK when it throws. Nothing inside reaches the pool.
// - Both modes: repositories record their in-memory writes through
//   trackMemoryWrite(); if the unit fails, those writes are undone in reverse
//   order, so the memory store (the whole store in memory mode, the mirror in
//   PostgreSQL mode) is left as it was. Only the keys this unit wrote are
//   restored, so concurrent requests' writes are untouched.
// Nested calls join the outer unit.
// ====================================================================

interface TransactionState {
  client: PoolClient | null;
  undo: Array<() => void>;
  savepoints: number;
}

const transactionStorage = new AsyncLocalStorage<TransactionState>();

export function inTransaction(): boolean {
  return transactionStorage.getStore() !== undefined;
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (transactionStorage.getStore()) return fn();
  const state: TransactionState = { client: null, undo: [], savepoints: 0 };
  if (pool && isPostgresConnected) state.client = await pool.connect();
  // Sprint 20: no embedded snapshot is taken while this unit may still roll back.
  holdSaves();
  try {
    return await transactionStorage.run(state, async () => {
      if (state.client) await state.client.query('BEGIN');
      const result = await fn();
      if (state.client) await state.client.query('COMMIT');
      return result;
    });
  } catch (err) {
    if (state.client) {
      try {
        await state.client.query('ROLLBACK');
      } catch (rollbackErr: any) {
        console.warn('ROLLBACK failed:', rollbackErr?.message);
      }
    }
    for (const undo of state.undo.reverse()) undo();
    throw err;
  } finally {
    state.client?.release();
    releaseSaves();
  }
}

/**
 * Records the current value of map[key] before a repository changes it, so a
 * failed transaction can put it back. Outside a transaction it does nothing.
 */
export function trackMemoryWrite<K, V>(map: Map<K, V>, key: K): void {
  const tx = transactionStorage.getStore();
  if (!tx) return;
  const existed = map.has(key);
  const previous = map.get(key);
  tx.undo.push(() => {
    if (existed) map.set(key, previous as V);
    else map.delete(key);
  });
}

/**
 * Runs one statement group that may fail recoverably (for example a unique
 * violation that is retried). Inside a PostgreSQL transaction it is wrapped in
 * a SAVEPOINT, so a failure does not abort the whole transaction; elsewhere it
 * simply runs.
 */
export async function withSavepoint<T>(fn: () => Promise<T>): Promise<T> {
  const tx = transactionStorage.getStore();
  if (!tx?.client) return fn();
  tx.savepoints += 1;
  const name = `sp_${tx.savepoints}`;
  await tx.client.query(`SAVEPOINT ${name}`);
  try {
    const result = await fn();
    await tx.client.query(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (err) {
    await tx.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    throw err;
  }
}

/**
 * Test seam (Sprint 18): substitutes a stand-in pool so tests can check that a
 * transaction's statements go through one client with BEGIN/COMMIT/ROLLBACK,
 * without a live database. Pass null to restore. Never call outside tests.
 */
export function setDatabasePoolForTests(testPool: unknown | null): () => void {
  const previous = { pool, isPostgresConnected };
  pool = (testPool as Pool) || null;
  isPostgresConnected = !!testPool;
  setPostgresStore(!!testPool);
  return () => {
    pool = previous.pool;
    isPostgresConnected = previous.isPostgresConnected;
    setPostgresStore(previous.isPostgresConnected);
  };
}
