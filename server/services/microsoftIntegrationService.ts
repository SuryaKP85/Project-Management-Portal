import crypto from 'crypto';
import { MicrosoftIdentityService, MICROSOFT_SCOPES, normalizeScopes, hasScope } from '../integrations/microsoft365/microsoftIdentityService';
import { graphGet, graphPost, microsoftError } from '../integrations/microsoft365/microsoftGraphClient';
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
  /** Sprint 10B: true only when the stored connection was granted Mail.Send. */
  canSendMail: boolean;
  accountEmail?: string;
  tenantId?: string;
  connectedAt?: string;
  scopes?: string[];
}

/** Sprint 10B send limits. */
export const SEND_MAX_RECIPIENTS = 10;
export const SEND_MAX_SUBJECT = 255;
export const SEND_MAX_BODY = 20000;
/** Bounds work on hostile input before de-duplication. */
const SEND_MAX_RAW_RECIPIENTS = 50;
const SEND_ALLOWED_FIELDS = new Set(['to', 'subject', 'body', 'confirmed']);

export interface OutlookSendRequest {
  to: string[];
  subject: string;
  body: string;
}

export interface OutlookSendResult {
  sent: true;
  recipientCount: number;
  sentAt: string;
}

/** Subject, recipients: no C0 controls or DEL. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const FORBIDDEN_ADDRESS_CHARS = /[<>(),;:"\[\]\\]/;
const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_PART = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function validateAddress(raw: unknown, index: number, errors: string[]): string | null {
  if (typeof raw !== 'string') {
    errors.push(`Recipient ${index + 1} must be a string.`);
    return null;
  }
  const address = raw.trim().toLowerCase();
  if (!address) {
    errors.push(`Recipient ${index + 1} is empty.`);
    return null;
  }
  if (/\s/.test(address) || CONTROL_CHARS.test(address)) {
    errors.push(`Recipient ${index + 1} must not contain spaces or control characters (display names are not supported).`);
    return null;
  }
  if (FORBIDDEN_ADDRESS_CHARS.test(address)) {
    errors.push(`Recipient ${index + 1} contains characters that are not allowed in an address.`);
    return null;
  }
  if (address.length > 254) {
    errors.push(`Recipient ${index + 1} exceeds 254 characters.`);
    return null;
  }
  const at = address.lastIndexOf('@');
  const local = at > 0 ? address.slice(0, at) : '';
  const domain = at > 0 ? address.slice(at + 1) : '';
  if (at <= 0 || address.indexOf('@') !== at || !domain) {
    errors.push(`Recipient ${index + 1} is not a valid email address.`);
    return null;
  }
  if (local.length > 64) {
    errors.push(`Recipient ${index + 1} has a local part longer than 64 characters.`);
    return null;
  }
  if (!LOCAL_PART.test(local) || !DOMAIN_PART.test(domain)) {
    errors.push(`Recipient ${index + 1} is not a valid email address.`);
    return null;
  }
  return address;
}

/**
 * Validates a send request. Returns the normalized request, or the list of
 * problems. The request can never carry an identity: the sender is always the
 * signed-in user's own connection.
 */
export function validateSendRequest(input: unknown): { ok: true; value: OutlookSendRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }
  const body = input as Record<string, unknown>;
  const unsupported = Object.keys(body).filter((k) => !SEND_ALLOWED_FIELDS.has(k));
  if (unsupported.length) {
    errors.push(`Unsupported field(s): ${unsupported.map((k) => k.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40)).join(', ')}.`);
  }
  if (body.confirmed !== true) {
    errors.push("Field 'confirmed' must be true to send.");
  }

  let to: string[] = [];
  if (!Array.isArray(body.to)) {
    errors.push("Field 'to' must be an array of email addresses.");
  } else if (body.to.length === 0) {
    errors.push("Field 'to' needs at least one recipient.");
  } else if (body.to.length > SEND_MAX_RAW_RECIPIENTS) {
    errors.push(`Field 'to' accepts at most ${SEND_MAX_RECIPIENTS} recipients.`);
  } else {
    const seen = new Set<string>();
    body.to.forEach((raw, i) => {
      const address = validateAddress(raw, i, errors);
      if (address && !seen.has(address)) {
        seen.add(address);
        to.push(address);
      }
    });
    if (to.length > SEND_MAX_RECIPIENTS) {
      errors.push(`Field 'to' accepts at most ${SEND_MAX_RECIPIENTS} recipients.`);
    }
  }

  let subject = '';
  if (typeof body.subject !== 'string') {
    errors.push("Field 'subject' is required.");
  } else {
    subject = body.subject.trim();
    if (!subject) errors.push("Field 'subject' cannot be empty.");
    else if (subject.length > SEND_MAX_SUBJECT) errors.push(`Field 'subject' cannot exceed ${SEND_MAX_SUBJECT} characters.`);
    else if (CONTROL_CHARS.test(subject)) errors.push("Field 'subject' must not contain control characters or line breaks.");
  }

  let text = '';
  if (typeof body.body !== 'string') {
    errors.push("Field 'body' is required.");
  } else {
    text = body.body;
    if (!text.trim()) errors.push("Field 'body' cannot be empty.");
    else if (text.length > SEND_MAX_BODY) errors.push(`Field 'body' cannot exceed ${SEND_MAX_BODY} characters.`);
    else if (text.includes('\u0000')) errors.push("Field 'body' must not contain NUL characters.");
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { to, subject, body: text } };
}

/** Wording shared by every outcome where Microsoft may have accepted the message. */
const SENT_ITEMS_HINT = 'Check your Outlook Sent Items before trying again.';

/** Maps a non-accepted Graph sendMail answer. Upstream codes and messages are never surfaced. */
function mapSendFailure(status: number, retryAfter?: string | null): Error {
  if (status === 403) {
    return microsoftError(424, 'MICROSOFT_PERMISSION_REQUIRED', 'Microsoft 365 did not allow sending from this account. Reconnect Microsoft 365 in Settings to grant permission, or ask your administrator.');
  }
  if (status === 429) {
    const seconds = Number.parseInt(String(retryAfter ?? ''), 10);
    const wait = Number.isFinite(seconds) && seconds > 0 && seconds <= 3600 ? ` Try again in ${seconds} seconds.` : ' Try again later.';
    return microsoftError(429, 'MICROSOFT_RATE_LIMITED', `Microsoft is limiting requests right now; the email was not sent.${wait}`);
  }
  if (status === 400 || status === 413) {
    return microsoftError(422, 'MICROSOFT_MAIL_REJECTED', 'Microsoft rejected the message; it was not sent. Check the recipients and content.');
  }
  return microsoftError(502, 'MICROSOFT_GRAPH_ERROR', `Microsoft reported an error and the email was not confirmed as sent. ${SENT_ITEMS_HINT}`);
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

/**
 * Audit entry with metadata only: never tokens, codes, verifiers, state, or
 * (for mail) recipients, subject or body. Uses the existing action vocabulary.
 */
async function audit(actor: MicrosoftActor, event: 'connected' | 'disconnected' | 'mail_sent', details: Record<string, unknown>): Promise<void> {
  await ActivityRepository.create({
    id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    entityType: 'user',
    entityId: actor.id,
    action: event === 'mail_sent' ? 'create' : 'update',
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
    if (!connection) return { configured, connected: false, canSendMail: false };
    const scopes = normalizeScopes(connection.scopes);
    return {
      configured,
      connected: true,
      canSendMail: configured && hasScope(scopes, 'Mail.Send'),
      accountEmail: connection.accountEmail,
      tenantId: connection.msTenantId,
      connectedAt: connection.connectedAt,
      scopes,
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
    const scopes = tokens.scope ? normalizeScopes(tokens.scope) : [...MICROSOFT_SCOPES];
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
    return { configured: MicrosoftIdentityService.isConfigured(), connected: false, canSendMail: false };
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
    // Refresh with the scopes this connection was granted (a 10A connection has no Mail.Send).
    const refreshed = await MicrosoftIdentityService.refresh(decryptToken(connection.refreshTokenEnc, key), connection.scopes);
    await MicrosoftConnectionRepository.updateTokens(userId, {
      accessTokenEnc: encryptToken(refreshed.accessToken, key),
      // Microsoft may rotate the refresh token; keep the previous one only if none was returned.
      refreshTokenEnc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken, key) : connection.refreshTokenEnc,
      expiresAt: new Date(now + refreshed.expiresInSeconds * 1000).toISOString(),
      scopes: refreshed.scope ? normalizeScopes(refreshed.scope) : undefined,
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

  /**
   * Sprint 10B — sends a plain-text email through the caller's own connected
   * account (Graph /me/sendMail). The request must already be validated.
   *
   * No request data is kept after the attempt. The only automatic retry is a
   * single forced token refresh when Graph answers 401 (Graph did not accept
   * the message); every other failure, including a timeout, is returned as-is.
   */
  async sendMail(actor: MicrosoftActor, request: OutlookSendRequest, options: { now?: number } = {}): Promise<OutlookSendResult> {
    MicrosoftIdentityService.assertConfigured();
    const now = options.now ?? Date.now();
    const connection = await MicrosoftConnectionRepository.findByUserId(actor.id);
    if (!connection) {
      throw microsoftError(404, 'MICROSOFT_NOT_CONNECTED', 'No Microsoft 365 account is connected.');
    }
    if (!hasScope(connection.scopes, 'Mail.Send')) {
      throw microsoftError(424, 'MICROSOFT_PERMISSION_REQUIRED', 'Outlook sending is not enabled for this connection. Reconnect Microsoft 365 in Settings to grant permission to send email.');
    }

    const payload = {
      message: {
        subject: request.subject,
        body: { contentType: 'Text', content: request.body },
        toRecipients: request.to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    };

    const post = async (accessToken: string) => {
      try {
        return await graphPost(accessToken, '/me/sendMail', payload);
      } catch (err: any) {
        if (err?.code === 'MICROSOFT_TIMEOUT') {
          throw microsoftError(504, 'MICROSOFT_TIMEOUT', `Microsoft did not respond in time. The email may have been sent. ${SENT_ITEMS_HINT}`);
        }
        if (err?.code === 'MICROSOFT_UNREACHABLE') {
          throw microsoftError(502, 'MICROSOFT_UNREACHABLE', `Microsoft services could not be reached and the email was not confirmed as sent. ${SENT_ITEMS_HINT}`);
        }
        throw err;
      }
    };

    let result = await post(await this.getAccessToken(actor.id, { now }));
    if (result.status === 401) {
      // Graph refused the token, so the message was not accepted: one forced refresh, one retry.
      result = await post(await this.getAccessToken(actor.id, { now, force: true }));
      if (result.status === 401) {
        throw microsoftError(424, 'MICROSOFT_RECONNECT_REQUIRED', 'Microsoft rejected the stored authorization. Please reconnect your Microsoft 365 account.');
      }
    }
    if (!result.ok) throw mapSendFailure(result.status, result.retryAfter);

    const sentAt = new Date(now).toISOString();
    await audit(actor, 'mail_sent', {
      recipientCount: request.to.length,
      subjectLength: request.subject.length,
      bodyLength: request.body.length,
      accountEmail: connection.accountEmail,
    });
    return { sent: true, recipientCount: request.to.length, sentAt };
  },
};
