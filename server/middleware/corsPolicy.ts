import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
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

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True when the request carries the session cookie (read from the raw header: this check runs before cookie-parser). */
function hasSessionCookie(req: Request): boolean {
  return /(?:^|;)\s*auth_token=[^;\s]/.test(String(req.get('cookie') || ''));
}

/**
 * Sprint 25 — CSRF defence for the cookie session. SameSite=Lax still sends the
 * cookie from another origin of the same site (another port on localhost, a sibling
 * host on the LAN), and an HTML form reaches the API without a CORS preflight. So a
 * state-changing request (anything but GET/HEAD/OPTIONS — the Microsoft OAuth
 * callback is a GET and never checked) must show where it comes from:
 * - Origin present: it must be this server's own origin or an allowed one
 *   (CORS_ALLOWED_ORIGINS, APP_URL); "null" and anything else are refused.
 * - No Origin: Sec-Fetch-Site must be "same-origin".
 * - Neither header: accepted only when the request does NOT carry the session
 *   cookie. That is the API-client contract: a client without browser metadata
 *   authenticates with "Authorization: Bearer <token>" and sends no cookie — a
 *   header a cross-site page cannot attach without a (refused) CORS preflight.
 *   With the cookie and no metadata the request is refused, never assumed safe.
 */
export function sameOriginWrites(allowed: Set<string> = allowedOrigins(), appUrl = config.appUrl) {
  const trusted = new Set(allowed);
  try {
    trusted.add(new URL(appUrl).origin);
  } catch {
    /* no usable APP_URL */
  }
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    const site = req.get('sec-fetch-site');
    let ok: boolean;
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        /* "null" or malformed: not this server */
      }
      ok = trusted.has(origin) || (!!originHost && originHost === String(req.get('host') || '').toLowerCase());
    } else if (site) {
      ok = site === 'same-origin';
    } else {
      ok = !hasSessionCookie(req);
    }
    if (ok) return next();
    res.status(403).json({
      success: false,
      error: { code: 'CROSS_ORIGIN_REQUEST', message: 'This change must be made from the portal itself (API clients: send Authorization: Bearer, without the session cookie).' },
    });
  };
}
