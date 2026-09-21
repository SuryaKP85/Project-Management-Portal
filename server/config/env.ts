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

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'enterprise_default_secret_key_surya_v2',
  sessionExpiry: process.env.SESSION_EXPIRY || '7d',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
  geminiTimeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || String(GEMINI_DEFAULT_TIMEOUT_MS), 10),
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/v1/auth/microsoft/callback',
  },
};
