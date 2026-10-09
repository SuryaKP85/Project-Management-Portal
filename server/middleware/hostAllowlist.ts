import os from 'os';
import { Request, Response, NextFunction } from 'express';

/**
 * Sprint 25 — DNS-rebinding defence. A page on an attacker's domain can make that
 * domain resolve to this server; its requests then look same-origin. Every request
 * must therefore name a host this server answers for:
 * - always: localhost, 127.0.0.1, ::1;
 * - the hosts of APP_URL, CORS_ALLOWED_ORIGINS and MICROSOFT_REDIRECT_URI;
 * - PM_PORTAL_ALLOWED_HOSTS (comma-separated names or addresses, e.g. a LAN DNS name);
 * - the listen address, and when listening on every interface, this computer's
 *   name and interface addresses (so LAN access by IP or machine name keeps working).
 * Anything else gets 421. The decision never depends on what the request claims.
 */

/** The bare, lower-case host of a Host header, origin or URL ('' when there is none). */
export function hostOf(value: string | undefined): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  let host = raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) {
    try {
      host = new URL(raw).host;
    } catch {
      return '';
    }
  }
  host = host.replace(/\/.*$/, '');
  if (host.startsWith('[')) return host.slice(1, host.indexOf(']') > 0 ? host.indexOf(']') : undefined);
  if ((host.match(/:/g) || []).length > 1) return host; // a bare IPv6 address
  return host.replace(/:\d+$/, '');
}

const ALL_INTERFACES = new Set(['0.0.0.0', '::', '']);

export function allowedHosts(env: NodeJS.ProcessEnv = process.env, listenHost = '127.0.0.1'): Set<string> {
  const hosts = new Set<string>(['localhost', '127.0.0.1', '::1']);
  const add = (value: string | undefined) => {
    const host = hostOf(value);
    if (host) hosts.add(host);
  };
  add(env.APP_URL);
  add(env.MICROSOFT_REDIRECT_URI);
  for (const origin of String(env.CORS_ALLOWED_ORIGINS || '').split(',')) add(origin);
  for (const host of String(env.PM_PORTAL_ALLOWED_HOSTS || '').split(',')) add(host);
  if (ALL_INTERFACES.has(listenHost)) {
    add(os.hostname());
    for (const list of Object.values(os.networkInterfaces())) {
      for (const entry of list || []) add(entry.address);
    }
  } else {
    add(listenHost);
  }
  return hosts;
}

export function hostAllowlist(allowed: Set<string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const host = hostOf(req.headers.host);
    if (host && allowed.has(host)) return next();
    res.status(421).json({
      success: false,
      error: {
        code: 'MISDIRECTED_REQUEST',
        message: 'This server does not answer for that host name. An administrator can add it to PM_PORTAL_ALLOWED_HOSTS.',
      },
    });
  };
}
