import dotenv from 'dotenv';
dotenv.config();

/**
 * Gemini defaults. Declared once here so the provider and any future consumer
 * share a single source of truth; both are overridable per environment.
 */
export const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';

/**
 * Server-side ceiling for a single Gemini call, in milliseconds. Kept below the
 * browser client's 15s request timeout (PM-Portal/js/services/apiClient.js) so
 * the server fails first and the LocalRule fallback still has time to answer.
 */
export const GEMINI_DEFAULT_TIMEOUT_MS = 12000;

/** The development session secret. Never acceptable in production (Sprint 20). */
export const DEFAULT_JWT_SECRET = 'enterprise_default_secret_key_surya_v2';
/** Published sample values (code and .env.example) that must not secure a production deployment. */
const KNOWN_SAMPLE_JWT_SECRETS = new Set([DEFAULT_JWT_SECRET, 'enterprise_super_secret_jwt_key_surya_pm_portal_v2']);

export class ConfigurationError extends Error {}

/**
 * Sprint 20 — production refuses an insecure session secret instead of
 * silently using the development default. Never logs the value.
 */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  if (isUnsafeJwtSecret(env.JWT_SECRET)) {
    throw new ConfigurationError(
      `NODE_ENV=production requires JWT_SECRET to be a random value of at least 32 characters (not the development default or the .env.example sample). Generate one, for example: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
    );
  }
}

/** Sprint 22A: a session secret anyone could know: missing, the development default, a published sample, or short. */
export function isUnsafeJwtSecret(secret: string | undefined): boolean {
  const value = secret || '';
  return !value || KNOWN_SAMPLE_JWT_SECRETS.has(value) || value.length < 32;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Sprint 22A — the address the server listens on. A token signed with a known
 * secret could be forged by anyone who can reach the server, so:
 * - with a strong JWT_SECRET: PM_PORTAL_HOST, or 0.0.0.0 (every interface) as before;
 * - without one: this computer only (127.0.0.1, or a loopback PM_PORTAL_HOST). One that
 *   would expose the server to the network is refused, with instructions.
 * The secret itself is never printed.
 */
export function resolveListenHost(env: NodeJS.ProcessEnv = process.env): { host: string; loopbackOnly: boolean } {
  const requested = String(env.PM_PORTAL_HOST || '').trim();
  if (!isUnsafeJwtSecret(env.JWT_SECRET)) return { host: requested || '0.0.0.0', loopbackOnly: false };
  if (!requested) return { host: '127.0.0.1', loopbackOnly: true };
  if (LOOPBACK_HOSTS.has(requested.toLowerCase())) return { host: requested, loopbackOnly: true };
  throw new ConfigurationError(
    `PM_PORTAL_HOST=${requested} would make the portal reachable from other computers, but JWT_SECRET is not set to a private value (it is missing, the development default, the .env.example sample, or shorter than 32 characters), so anyone on the network could forge a sign-in. Set JWT_SECRET to a random value of at least 32 characters, for example: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))", or remove PM_PORTAL_HOST to keep the portal on this computer only.`
  );
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  // Sprint 20: extra browser origins allowed to call the API with credentials (comma-separated).
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || '',
  sessionExpiry: process.env.SESSION_EXPIRY || '7d',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
  geminiTimeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || String(GEMINI_DEFAULT_TIMEOUT_MS), 10),
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/v1/auth/microsoft/callback',
    // Sprint 10A: 32-byte AES-256-GCM key for stored OAuth tokens. No default:
    // without it the integration reports not-configured and stores nothing.
    tokenEncryptionKey: process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY || '',
    graphTimeoutMs: parseInt(process.env.MICROSOFT_GRAPH_TIMEOUT_MS || '10000', 10),
  },
  jira: {
    // Sprint 15A: optional base URL of the organisation's Jira (for example
    // https://company.atlassian.net or a self-hosted https host). Used only to
    // build and recognise Jira issue links; there is no Jira API access.
    baseUrl: process.env.JIRA_BASE_URL || '',
  },
};
