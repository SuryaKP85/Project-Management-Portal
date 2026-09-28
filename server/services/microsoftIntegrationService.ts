import crypto from 'crypto';
import { MicrosoftIdentityService, MICROSOFT_SCOPES } from '../integrations/microsoft365/microsoftIdentityService';
import { graphGet, microsoftError } from '../integrations/microsoft365/microsoftGraphClient';
import { encryptToken, decryptToken } from '../integrations/microsoft365/tokenCrypto';
import { MicrosoftConnectionRepository } from '../repositories/microsoftConnectionRepository';
import { UserRepository } from '../repositories/userRepository';
import { ActivityRepository } from '../repositories/activityRepository';

/**
 * Sprint 10A — Microsoft 365 connection and Outlook calendar (read-only) for
 * the signed-in V2 user. Every operation acts only on the caller's own
 * connection. Responses never contain tokens, codes or verifiers.
 */

export const CALENDAR_DEFAULT_DAYS = 7;
export const CALENDAR_MAX_DAYS = 31;
export const CALENDAR_MAX_EVENTS = 50;
/** Access tokens this close to expiry are refreshed before use. */
export const REFRESH_SKEW_MS = 2 * 60 * 1000;

export interface MicrosoftActor {
  id: string;
  firstName?: string;
  lastName?: string;
}

export interface MicrosoftStatus {
  configured: boolean;
  connected: boolean;
  accountEmail?: string;
  tenantId?: string;
  connectedAt?: string;
  scopes?: string[];
}

export interface OutlookCalendarEvent {
  id: string;
  subject: string;
  start: string | null;
  end: string | null;
  isAllDay: boolean;
  location: string | null;
  organizer: string | null;
  webLink: string | null;
  isCancelled: boolean;
  showAs: string | null;
}

export interface OutlookCalendar {
  accountEmail?: string;
  range: { start: string; end: string; days: number };
  events: OutlookCalendarEvent[];
  truncated: boolean;
}

function actorName(actor: MicrosoftActor): string {
  return `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.id;
}

/** Audit entry with metadata only: never tokens, codes, verifiers or state. */
async function audit(actor: MicrosoftActor, event: 'connected' | 'disconnected', details: Record<string, unknown>): Promise<void> {
  await ActivityRepository.create({
    id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    entityType: 'user',
    entityId: actor.id,
    action: 'update',
    actorId: actor.id,
    actorName: actorName(actor),
    details: { integration: 'microsoft365', event, ...details },
    createdAt: new Date().toISOString(),
  });
}

/** Graph returns UTC wall-clock times without an offset when asked for UTC; make them ISO instants. */
function toIsoInstant(value: { dateTime?: string; timeZone?: string } | undefined): string | null {
  const dt = value?.dateTime;
  if (!dt) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(dt)) return new Date(dt).toISOString();
  if (!value?.timeZone || value.timeZone === 'UTC') return new Date(`${dt}Z`).toISOString();
  return dt;
}

/** Hosts Graph uses for event webLinks (work/school and personal Outlook). */
const OUTLOOK_LINK_HOSTS = ['office365.com', 'office.com', 'outlook.com', 'live.com', 'microsoft.com'];

/** Keeps a webLink only when it is https on a Microsoft Outlook host; anything else becomes null. */
function safeOutlookLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && OUTLOOK_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Maps one Graph event to the stable application shape. Only https Outlook links are kept. */
export function mapCalendarEvent(raw: any): OutlookCalendarEvent {
  const link = safeOutlookLink(raw?.webLink);
  const organizer = raw?.organizer?.emailAddress;
  return {
    id: String(raw?.id ?? ''),
    subject: typeof raw?.subject === 'string' && raw.subject.trim() ? raw.subject.trim() : '(No subject)',
    start: toIsoInstant(raw?.start),
    end: toIsoInstant(raw?.end),
    isAllDay: raw?.isAllDay === true,
    location: typeof raw?.location?.displayName === 'string' && raw.location.displayName.trim() ? raw.location.displayName.trim() : null,
    organizer: (organizer?.name || organizer?.address) ? String(organizer.name || organizer.address) : null,
    webLink: link,
    isCancelled: raw?.isCancelled === true,
    showAs: typeof raw?.showAs === 'string' ? raw.showAs : null,
  };
}

export const MicrosoftIntegrationService = {
  async getStatus(userId: string): Promise<MicrosoftStatus> {
    const configured = MicrosoftIdentityService.isConfigured();
    const connection = await MicrosoftConnectionRepository.findByUserId(userId);
    if (!connection) return { configured, connected: false };
    return {
      configured,
      connected: true,
      accountEmail: connection.accountEmail,
      tenantId: connection.msTenantId,
      connectedAt: connection.connectedAt,
      scopes: connection.scopes,
    };
  },

  /** Returns the Microsoft authorize URL for the caller; the browser navigates to it. */
  startConnect(userId: string, options: { now?: number } = {}): { authorizationUrl: string } {
    const { authorizationUrl } = MicrosoftIdentityService.beginAuthorization(userId, options.now);
    return { authorizationUrl };
  },

  /**
   * Handles the OAuth callback for the signed-in user: validates the state,
   * exchanges the code with the PKCE verifier, resolves the Graph identity,
   * refuses identities linked to another portal user, then stores encrypted
   * tokens and the identity association.
   */
  async completeConnect(
    actor: MicrosoftActor,
    params: { state?: string; code?: string; error?: string },
    options: { now?: number } = {}
  ): Promise<MicrosoftStatus> {
    MicrosoftIdentityService.assertConfigured();
    const now = options.now ?? Date.now();
    if (params.error) {
      // The state is still consumed so an error response cannot be replayed later.
      if (params.state) {
        try { MicrosoftIdentityService.consumeAuthorization(params.state, actor.id, now); } catch { /* reported below */ }
      }
      throw microsoftError(400, 'MICROSOFT_OAUTH_ERROR', `Microsoft did not complete the connection (${String(params.error).replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'error'}).`);
    }
    if (!params.state || !params.code) {
      throw microsoftError(400, 'MICROSOFT_STATE_INVALID', 'The Microsoft authorization response is incomplete. Please try connecting again.');
    }
    const pending = MicrosoftIdentityService.consumeAuthorization(params.state, actor.id, now);
    const key = MicrosoftIdentityService.encryptionKey();

    const tokens = await MicrosoftIdentityService.exchangeCode(params.code, pending.codeVerifier);
    const me = await graphGet(tokens.accessToken, '/me', { $select: 'id,mail,userPrincipalName' });
    const msUserId = typeof me?.id === 'string' ? me.id : '';
    if (!msUserId) {
      throw microsoftError(502, 'MICROSOFT_GRAPH_ERROR', 'Microsoft did not return an account identity.');
    }
    const tenantId = MicrosoftIdentityService.tenantFromIdToken(tokens.idToken);
    const accountEmail = String(me.mail || me.userPrincipalName || '').trim() || undefined;

    const linkedTo = await UserRepository.findByMsUserId(msUserId);
    if (linkedTo && linkedTo.id !== actor.id) {
      throw microsoftError(409, 'MICROSOFT_ACCOUNT_LINKED', 'This Microsoft account is already connected to another portal user.');
    }

    try {
      await UserRepository.setMicrosoftIdentity(actor.id, msUserId, tenantId);
    } catch (err: any) {
      if (err && err.code === '23505') {
        throw microsoftError(409, 'MICROSOFT_ACCOUNT_LINKED', 'This Microsoft account is already connected to another portal user.');
      }
      throw err;
    }

    const at = new Date(now).toISOString();
    const scopes = tokens.scope ? tokens.scope.split(' ').filter(Boolean) : [...MICROSOFT_SCOPES];
    await MicrosoftConnectionRepository.upsert({
      userId: actor.id,
      msUserId,
      msTenantId: tenantId,
      accountEmail,
      scopes,
      accessTokenEnc: encryptToken(tokens.accessToken, key),
      refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken, key) : null,
      expiresAt: new Date(now + tokens.expiresInSeconds * 1000).toISOString(),
      connectedAt: at,
      updatedAt: at,
    });
    await audit(actor, 'connected', { accountEmail, tenantId, scopes });
    return this.getStatus(actor.id);
  },

  /** Deletes the stored tokens and clears the identity association. Idempotent. */
  async disconnect(actor: MicrosoftActor): Promise<MicrosoftStatus> {
    const existing = await MicrosoftConnectionRepository.findByUserId(actor.id);
    await MicrosoftConnectionRepository.deleteByUserId(actor.id);
    await UserRepository.clearMicrosoftIdentity(actor.id);
    if (existing) {
      await audit(actor, 'disconnected', { accountEmail: existing.accountEmail, tenantId: existing.msTenantId });
    }
    return { configured: MicrosoftIdentityService.isConfigured(), connected: false };
  },

  /**
   * A usable access token for the caller, refreshing it when it is close to
   * expiry (or when `force` is set). Any rotated refresh token is persisted.
   */
  async getAccessToken(userId: string, options: { now?: number; force?: boolean } = {}): Promise<string> {
    MicrosoftIdentityService.assertConfigured();
    const now = options.now ?? Date.now();
    const connection = await MicrosoftConnectionRepository.findByUserId(userId);
    if (!connection) {
      throw microsoftError(404, 'MICROSOFT_NOT_CONNECTED', 'No Microsoft 365 account is connected.');
    }
    const key = MicrosoftIdentityService.encryptionKey();
    if (!options.force && new Date(connection.expiresAt).getTime() - now > REFRESH_SKEW_MS) {
      return decryptToken(connection.accessTokenEnc, key);
    }
    if (!connection.refreshTokenEnc) {
      throw microsoftError(424, 'MICROSOFT_RECONNECT_REQUIRED', 'The Microsoft authorization expired. Please reconnect your Microsoft 365 account.');
    }
    const refreshed = await MicrosoftIdentityService.refresh(decryptToken(connection.refreshTokenEnc, key));
    await MicrosoftConnectionRepository.updateTokens(userId, {
      accessTokenEnc: encryptToken(refreshed.accessToken, key),
      // Microsoft may rotate the refresh token; keep the previous one only if none was returned.
      refreshTokenEnc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken, key) : connection.refreshTokenEnc,
      expiresAt: new Date(now + refreshed.expiresInSeconds * 1000).toISOString(),
      scopes: refreshed.scope ? refreshed.scope.split(' ').filter(Boolean) : undefined,
    });
    return refreshed.accessToken;
  },

  /** Upcoming Outlook events for the caller's own connected account (Calendars.Read). */
  async getCalendar(userId: string, days: number = CALENDAR_DEFAULT_DAYS, options: { now?: number } = {}): Promise<OutlookCalendar> {
    const now = options.now ?? Date.now();
    const span = Math.min(CALENDAR_MAX_DAYS, Math.max(1, Math.floor(days)));
    const start = new Date(now).toISOString();
    const end = new Date(now + span * 24 * 60 * 60 * 1000).toISOString();
    const query = {
      startDateTime: start,
      endDateTime: end,
      $orderby: 'start/dateTime',
      $top: String(CALENDAR_MAX_EVENTS),
      $select: 'id,subject,start,end,isAllDay,location,organizer,webLink,isCancelled,showAs',
    };
    const headers = { Prefer: 'outlook.timezone="UTC"' };

    let body: any;
    try {
      body = await graphGet(await this.getAccessToken(userId, { now }), '/me/calendarView', query, headers);
    } catch (err: any) {
      // One forced refresh if Graph rejected an access token that looked valid.
      if (err?.code !== 'MICROSOFT_RECONNECT_REQUIRED' || err?.upstreamStatus !== 401) throw err;
      body = await graphGet(await this.getAccessToken(userId, { now, force: true }), '/me/calendarView', query, headers);
    }
    const connection = await MicrosoftConnectionRepository.findByUserId(userId);
    const raw = Array.isArray(body?.value) ? body.value : [];
    return {
      accountEmail: connection?.accountEmail,
      range: { start, end, days: span },
      events: raw.slice(0, CALENDAR_MAX_EVENTS).map(mapCalendarEvent),
      truncated: Boolean(body?.['@odata.nextLink']) || raw.length > CALENDAR_MAX_EVENTS,
    };
  },
};
