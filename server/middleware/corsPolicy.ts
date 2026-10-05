import cors from 'cors';
import type { Request } from 'express';
import { config, ConfigurationError } from '../config/env';

/**
 * Sprint 20 — CORS allowlist (replaces reflecting any Origin with credentials).
 *
 * - Same-origin browser requests (Origin equals this server's own address)
 *   always work, so the portal keeps working on localhost and on the LAN.
 * - Other origins get CORS headers, credentials included, only when listed in
 *   CORS_ALLOWED_ORIGINS (comma-separated, e.g. https://pm.example.com).
 *   Outside production, http://localhost:<PORT> and http://127.0.0.1:<PORT>
 *   are added for local development; production uses only what is configured.
 * - Any other origin gets no CORS headers, so browsers do not expose responses
 *   to it.
 */

/** Normalised origin (scheme://host[:port]); throws ConfigurationError for anything else. */
function toOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError(`CORS_ALLOWED_ORIGINS contains an invalid origin: '${value}'.`);
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new ConfigurationError(`CORS_ALLOWED_ORIGINS entries must be bare origins such as https://pm.example.com (got '${value}').`);
  }
  return url.origin;
}

export function allowedOrigins(raw = config.corsAllowedOrigins, production = config.isProduction, port = config.port): Set<string> {
  const origins = new Set(raw.split(',').map((v) => v.trim()).filter(Boolean).map(toOrigin));
  if (!production) {
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
  }
  return origins;
}

/** True when the browser origin may receive credentialed responses. */
export function isOriginAllowed(origin: string | undefined, req: Pick<Request, 'protocol' | 'get'>, allowed: Set<string>): boolean {
  if (!origin) return false;
  if (allowed.has(origin)) return true;
  const host = req.get('host');
  return !!host && origin === `${req.protocol}://${host}`;
}

export function corsPolicy(allowed: Set<string> = allowedOrigins()) {
  return cors((req, callback) => {
    const request = req as unknown as Request;
    const ok = isOriginAllowed(request.get('origin') || undefined, request, allowed);
    callback(null, ok ? { origin: true, credentials: true } : { origin: false });
  });
}
