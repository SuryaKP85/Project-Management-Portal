import { config } from '../../config/env';

/**
 * Sprint 10A — the only place the server talks to Microsoft over HTTP.
 *
 * Uses Node's built-in fetch (no SDK dependency) with a hard timeout. Tests
 * swap the transport with setMicrosoftFetch(), so no real tenant is needed.
 * Nothing here logs request bodies, codes or tokens.
 */

export const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

export interface MicrosoftFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  headers?: { get(name: string): string | null };
}
export type MicrosoftFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<MicrosoftFetchResponse>;

let fetchOverride: MicrosoftFetch | null = null;

/** Test seam: replace the HTTP transport (pass null to restore the built-in fetch). */
export function setMicrosoftFetch(fn: MicrosoftFetch | null): void {
  fetchOverride = fn;
}

function transport(): MicrosoftFetch {
  return fetchOverride ?? (globalThis.fetch as unknown as MicrosoftFetch);
}

/** Error with the status and code the global error handler maps; `detail` never carries secrets. */
export type MicrosoftError = Error & { status: number; code: string; upstreamStatus?: number; oauthError?: string };

export function microsoftError(status: number, code: string, message: string, extra: Partial<MicrosoftError> = {}): MicrosoftError {
  return Object.assign(new Error(message), { status, code }, extra) as MicrosoftError;
}

/** Keeps an upstream error code readable but harmless (letters, digits, underscore, dot). */
export function safeUpstreamCode(value: unknown): string {
  return String(value ?? 'unknown').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 60) || 'unknown';
}

/** One HTTP call with a timeout. Returns the status and parsed JSON body (or {} when there is none). */
export async function microsoftRequest(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  timeoutMs: number = config.microsoft.graphTimeoutMs
): Promise<{ ok: boolean; status: number; body: any; retryAfter?: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport()(url, { ...init, signal: controller.signal });
    let body: any = {};
    try {
      body = await response.json();
    } catch {
      // Empty bodies are normal (for example Graph sendMail answers 202 with none).
      body = {};
    }
    let retryAfter: string | null = null;
    try {
      retryAfter = response.headers?.get?.('retry-after') ?? null;
    } catch {
      retryAfter = null;
    }
    return { ok: response.ok, status: response.status, body: body ?? {}, retryAfter };
  } catch (err: any) {
    if (err && err.name === 'AbortError') {
      throw microsoftError(504, 'MICROSOFT_TIMEOUT', `Microsoft did not respond within ${timeoutMs}ms.`);
    }
    throw microsoftError(502, 'MICROSOFT_UNREACHABLE', 'Microsoft services could not be reached.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST a JSON payload to Microsoft Graph with a delegated access token
 * (Sprint 10B). Returns the raw status so the caller maps failures for its
 * operation; transport failures still throw MICROSOFT_TIMEOUT / UNREACHABLE.
 * Nothing is retried here.
 */
export async function graphPost(
  accessToken: string,
  path: string,
  payload: unknown
): Promise<{ ok: boolean; status: number; body: any; retryAfter?: string | null }> {
  return microsoftRequest(`${GRAPH_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** GET against Microsoft Graph with a delegated access token. */
export async function graphGet(
  accessToken: string,
  path: string,
  query: Record<string, string> = {},
  headers: Record<string, string> = {}
): Promise<any> {
  const qs = new URLSearchParams(query).toString();
  const url = `${GRAPH_BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  const result = await microsoftRequest(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...headers },
  });
  if (!result.ok) {
    const upstream = safeUpstreamCode(result.body?.error?.code);
    throw microsoftError(
      result.status === 401 ? 424 : 502,
      result.status === 401 ? 'MICROSOFT_RECONNECT_REQUIRED' : 'MICROSOFT_GRAPH_ERROR',
      result.status === 401
        ? 'Microsoft rejected the stored authorization. Please reconnect your Microsoft 365 account.'
        : `Microsoft Graph request failed (${result.status} ${upstream}).`,
      { upstreamStatus: result.status }
    );
  }
  return result.body;
}
