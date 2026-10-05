import { isDbConnected, query } from '../config/database';
import { persistentMap } from '../config/persistence';

/**
 * Sprint 10A — one Microsoft 365 connection per portal user. Token columns
 * hold AES-256-GCM ciphertext only (see tokenCrypto); this repository never
 * sees plaintext tokens.
 */
export interface MicrosoftConnection {
  userId: string;
  msUserId: string;
  msTenantId?: string;
  accountEmail?: string;
  scopes: string[];
  accessTokenEnc: string;
  refreshTokenEnc?: string | null;
  expiresAt: string;
  connectedAt: string;
  updatedAt: string;
}

// Sprint 20: restored from / saved to the embedded data file in persistent mode.
const memoryConnections = persistentMap<MicrosoftConnection>('microsoftConnections');

function fromRow(row: any): MicrosoftConnection {
  return {
    userId: row.user_id,
    msUserId: row.ms_user_id,
    msTenantId: row.ms_tenant_id || undefined,
    accountEmail: row.account_email || undefined,
    scopes: String(row.scopes || '').split(' ').filter(Boolean),
    accessTokenEnc: row.access_token_enc,
    refreshTokenEnc: row.refresh_token_enc || null,
    expiresAt: new Date(row.expires_at).toISOString(),
    connectedAt: new Date(row.connected_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export const MicrosoftConnectionRepository = {
  async findByUserId(userId: string): Promise<MicrosoftConnection | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM microsoft_connections WHERE user_id = $1', [userId]);
      return res.rows.length ? fromRow(res.rows[0]) : null;
    }
    const found = memoryConnections.get(userId);
    return found ? { ...found, scopes: [...found.scopes] } : null;
  },

  /** Insert or replace the user's connection (reconnect replaces tokens and scopes). */
  async upsert(connection: MicrosoftConnection): Promise<MicrosoftConnection> {
    if (isDbConnected()) {
      await query(
        `INSERT INTO microsoft_connections
           (user_id, ms_user_id, ms_tenant_id, account_email, scopes, access_token_enc, refresh_token_enc, expires_at, connected_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id) DO UPDATE SET
           ms_user_id = EXCLUDED.ms_user_id,
           ms_tenant_id = EXCLUDED.ms_tenant_id,
           account_email = EXCLUDED.account_email,
           scopes = EXCLUDED.scopes,
           access_token_enc = EXCLUDED.access_token_enc,
           refresh_token_enc = EXCLUDED.refresh_token_enc,
           expires_at = EXCLUDED.expires_at,
           connected_at = EXCLUDED.connected_at,
           updated_at = EXCLUDED.updated_at`,
        [
          connection.userId,
          connection.msUserId,
          connection.msTenantId || null,
          connection.accountEmail || null,
          connection.scopes.join(' '),
          connection.accessTokenEnc,
          connection.refreshTokenEnc || null,
          connection.expiresAt,
          connection.connectedAt,
          connection.updatedAt,
        ]
      );
      return connection;
    }
    memoryConnections.set(connection.userId, { ...connection, scopes: [...connection.scopes] });
    return connection;
  },

  /** Replaces only the token columns after a refresh; the rotated refresh token is always written. */
  async updateTokens(userId: string, tokens: { accessTokenEnc: string; refreshTokenEnc?: string | null; expiresAt: string; scopes?: string[] }): Promise<boolean> {
    const updatedAt = new Date().toISOString();
    if (isDbConnected()) {
      const res = await query(
        `UPDATE microsoft_connections
            SET access_token_enc = $1, refresh_token_enc = $2, expires_at = $3, scopes = COALESCE($4, scopes), updated_at = $5
          WHERE user_id = $6`,
        [tokens.accessTokenEnc, tokens.refreshTokenEnc || null, tokens.expiresAt, tokens.scopes ? tokens.scopes.join(' ') : null, updatedAt, userId]
      );
      return (res.rowCount ?? 0) > 0;
    }
    const existing = memoryConnections.get(userId);
    if (!existing) return false;
    memoryConnections.set(userId, {
      ...existing,
      accessTokenEnc: tokens.accessTokenEnc,
      refreshTokenEnc: tokens.refreshTokenEnc ?? null,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes ? [...tokens.scopes] : existing.scopes,
      updatedAt,
    });
    return true;
  },

  async deleteByUserId(userId: string): Promise<boolean> {
    if (isDbConnected()) {
      const res = await query('DELETE FROM microsoft_connections WHERE user_id = $1', [userId]);
      return (res.rowCount ?? 0) > 0;
    }
    return memoryConnections.delete(userId);
  },
};
