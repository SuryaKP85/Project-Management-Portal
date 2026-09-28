import crypto from 'crypto';
import { config } from '../../config/env';
import { parseEncryptionKey } from './tokenCrypto';
import { microsoftError, microsoftRequest, safeUpstreamCode } from './microsoftGraphClient';

/**
 * Sprint 10A — Microsoft 365 account connection (OAuth 2.0 authorization code
 * flow with PKCE, confidential client).
 *
 * This connects an already signed-in V2 user to their Microsoft account so the
 * server can call Graph on their behalf. It is NOT a portal login: nothing
 * here creates a session or a portal user.
 */

/** Exactly the Sprint 10A scopes. Mail and Teams scopes are deliberately absent. */
export const MICROSOFT_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Calendars.Read'] as const;

/** How long an authorization request may take before its state is refused. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type MicrosoftConfigurationIssue = 'missing-client-credentials' | 'missing-encryption-key' | 'invalid-encryption-key';

interface PendingAuthorization {
  userId: string;
  codeVerifier: string;
  expiresAt: number;
}

export interface MicrosoftTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scope: string;
  idToken?: string;
}

/**
 * Pending authorizations keyed by state. Server memory only: the verifier never
 * leaves the server and each state is removed the moment it is looked up.
 */
const pendingAuthorizations = new Map<string, PendingAuthorization>();

const base64url = (buf: Buffer) => buf.toString('base64url');

function pruneExpired(now: number): void {
  for (const [state, entry] of pendingAuthorizations) {
    if (entry.expiresAt <= now) pendingAuthorizations.delete(state);
  }
}

export const MicrosoftIdentityService = {
  configurationIssue(): MicrosoftConfigurationIssue | null {
    if (!config.microsoft.clientId || !config.microsoft.clientSecret) return 'missing-client-credentials';
    if (!String(config.microsoft.tokenEncryptionKey || '').trim()) return 'missing-encryption-key';
    if (!parseEncryptionKey(config.microsoft.tokenEncryptionKey)) return 'invalid-encryption-key';
    return null;
  },

  /** True only when credentials AND a valid token encryption key are present. */
  isConfigured(): boolean {
    return this.configurationIssue() === null;
  },

  /** Throws a 503 unless the integration is fully configured. */
  assertConfigured(): void {
    const issue = this.configurationIssue();
    if (issue) {
      throw microsoftError(503, 'MICROSOFT_NOT_CONFIGURED', `Microsoft 365 integration is not configured (${issue}).`);
    }
  },

  /** The token encryption key, or a 503 — never a fallback. */
  encryptionKey(): Buffer {
    const key = parseEncryptionKey(config.microsoft.tokenEncryptionKey);
    if (!key) {
      throw microsoftError(503, 'MICROSOFT_NOT_CONFIGURED', 'Microsoft token encryption key is missing or invalid; tokens cannot be stored.');
    }
    return key;
  },

  authorityUrl(): string {
    return `https://login.microsoftonline.com/${encodeURIComponent(config.microsoft.tenantId || 'common')}/oauth2/v2.0`;
  },

  /**
   * Starts an authorization for the signed-in user: a random single-use state,
   * a PKCE verifier kept server-side, and the S256 challenge in the URL.
   */
  beginAuthorization(userId: string, now: number = Date.now()): { authorizationUrl: string; state: string } {
    this.assertConfigured();
    pruneExpired(now);
    const state = base64url(crypto.randomBytes(32));
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    pendingAuthorizations.set(state, { userId, codeVerifier, expiresAt: now + OAUTH_STATE_TTL_MS });

    const params = new URLSearchParams({
      client_id: config.microsoft.clientId,
      response_type: 'code',
      redirect_uri: config.microsoft.redirectUri,
      response_mode: 'query',
      scope: MICROSOFT_SCOPES.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return { authorizationUrl: `${this.authorityUrl()}/authorize?${params.toString()}`, state };
  },

  /**
   * Validates and consumes a state. The entry is deleted on every lookup, so a
   * state can never be replayed — not even after a failed attempt.
   */
  consumeAuthorization(state: string, userId: string, now: number = Date.now()): PendingAuthorization {
    const entry = state ? pendingAuthorizations.get(state) : undefined;
    if (state) pendingAuthorizations.delete(state);
    if (!entry) {
      throw microsoftError(400, 'MICROSOFT_STATE_INVALID', 'The Microsoft authorization request is invalid or has already been used. Please try connecting again.');
    }
    if (entry.expiresAt <= now) {
      throw microsoftError(400, 'MICROSOFT_STATE_EXPIRED', 'The Microsoft authorization request expired. Please try connecting again.');
    }
    if (entry.userId !== userId) {
      throw microsoftError(403, 'MICROSOFT_STATE_MISMATCH', 'This Microsoft authorization was started by a different portal user.');
    }
    return entry;
  },

  async exchangeCode(code: string, codeVerifier: string): Promise<MicrosoftTokenSet> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.microsoft.redirectUri,
      code_verifier: codeVerifier,
      scope: MICROSOFT_SCOPES.join(' '),
    }, 'MICROSOFT_TOKEN_EXCHANGE_FAILED');
  },

  async refresh(refreshToken: string): Promise<MicrosoftTokenSet> {
    return this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: MICROSOFT_SCOPES.join(' '),
    }, 'MICROSOFT_REFRESH_FAILED');
  },

  async tokenRequest(fields: Record<string, string>, failureCode: string): Promise<MicrosoftTokenSet> {
    const body = new URLSearchParams({
      client_id: config.microsoft.clientId,
      client_secret: config.microsoft.clientSecret,
      ...fields,
    }).toString();
    const result = await microsoftRequest(`${this.authorityUrl()}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
    if (!result.ok || !result.body?.access_token) {
      const oauthError = safeUpstreamCode(result.body?.error);
      const reconnect = oauthError === 'invalid_grant' || oauthError === 'interaction_required';
      throw microsoftError(
        reconnect ? 424 : 502,
        reconnect ? 'MICROSOFT_RECONNECT_REQUIRED' : failureCode,
        reconnect
          ? 'Microsoft requires you to reconnect your Microsoft 365 account.'
          : `Microsoft rejected the token request (${oauthError}).`,
        { upstreamStatus: result.status, oauthError }
      );
    }
    return {
      accessToken: String(result.body.access_token),
      refreshToken: result.body.refresh_token ? String(result.body.refresh_token) : undefined,
      expiresInSeconds: Number(result.body.expires_in) > 0 ? Number(result.body.expires_in) : 3600,
      scope: String(result.body.scope || ''),
      idToken: result.body.id_token ? String(result.body.id_token) : undefined,
    };
  },

  /**
   * The tenant id (`tid`) from the ID token returned directly by the token
   * endpoint over TLS. Only the claim is read; nothing else is trusted from it.
   */
  tenantFromIdToken(idToken?: string): string | undefined {
    if (!idToken) return undefined;
    try {
      const payload = JSON.parse(Buffer.from(idToken.split('.')[1] || '', 'base64url').toString('utf8'));
      return typeof payload.tid === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(payload.tid) ? payload.tid : undefined;
    } catch {
      return undefined;
    }
  },

  /** Test seam: number of authorizations awaiting their callback. */
  pendingCount(): number {
    return pendingAuthorizations.size;
  },
};
