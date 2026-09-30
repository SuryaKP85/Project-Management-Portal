import { config } from '../config/env';

/**
 * Sprint 15A — Jira references (External Delivery Links).
 *
 * The portal does not integrate with Jira: it stores, at most, a Jira issue
 * key and/or a Jira URL on a record and renders them as a link that opens
 * Jira in a new tab. Nothing here calls Jira or stores Jira data.
 *
 * The browser has the same rules in PM-Portal/js/jiraLinks.js; the test suite
 * checks that both accept and reject the same inputs.
 */

/**
 * Jira issue key: a project key (a letter, then letters, digits or
 * underscores) and a positive issue number, e.g. PROJ-123 or ABC123-999.
 * Matching is case-insensitive; keys are stored upper-case.
 */
export const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,49}-[1-9][0-9]{0,11}$/;

/** Atlassian cloud hosts recognised without any configuration. */
export const JIRA_CLOUD_HOST_SUFFIXES = ['atlassian.net', 'jira.com'] as const;

const MAX_URL_LENGTH = 2048;

/** The key upper-cased, or null when it is not a syntactically valid Jira key. */
export function normalizeJiraKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase();
  return JIRA_KEY_PATTERN.test(key) ? key : null;
}

/** The configured Jira base URL (https, no credentials, no query), or null. */
export function configuredJiraBase(raw: string = config.jira.baseUrl): URL | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function isCloudHost(host: string): boolean {
  return JIRA_CLOUD_HOST_SUFFIXES.some((suffix) => host.endsWith(`.${suffix}`));
}

/**
 * A Jira URL that is safe to render as a link, normalised, or null.
 * Rules: absolute https only (so javascript:, data:, vbscript:, http: and
 * protocol-relative input all fail), no embedded credentials, and a host that
 * is an Atlassian cloud site or the configured Jira host (port included). Any
 * other host is refused even if its path looks like Jira.
 */
export function safeJiraUrl(value: unknown, base: URL | null = configuredJiraBase()): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_URL_LENGTH || !/^https:\/\//i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const trusted = (!url.port && isCloudHost(host)) || (!!base && url.host.toLowerCase() === base.host.toLowerCase());
  return trusted ? url.toString() : null;
}

/** <base>/browse/<KEY> when a base URL is configured and the key is valid; otherwise null. */
export function jiraIssueUrl(key: unknown, base: URL | null = configuredJiraBase()): string | null {
  const normalized = normalizeJiraKey(key);
  if (!normalized || !base) return null;
  const path = base.pathname.replace(/\/+$/, '');
  return `${base.origin}${path}/browse/${normalized}`;
}

/** The key in a /browse/<KEY> URL, if any. */
function keyInBrowseUrl(url: string): string | null {
  const match = /\/browse\/([^/?#]+)\/?$/i.exec(new URL(url).pathname);
  return match ? normalizeJiraKey(decodeURIComponent(match[1])) : null;
}

/** Most Jira links kept on one project. */
export const MAX_PROJECT_JIRA_LINKS = 20;

/**
 * One stored project Jira link (the V1.1 multi-link list): a Jira key,
 * upper-cased, or an absolute https URL without credentials, normalised.
 * Anything else — javascript:, data:, http:, junk — is not stored. Whether a
 * URL's host is a recognised Jira site is decided when it is displayed, since
 * that depends on JIRA_BASE_URL, which can change after the link was saved.
 */
export function normalizeProjectJiraLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const key = normalizeJiraKey(text);
  if (key) return key;
  if (text.length > MAX_URL_LENGTH || !/^https:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Normalises a project's jiraLinks: undefined when not supplied, [] to clear
 * (null or ''), otherwise the valid, de-duplicated links (a comma/newline
 * separated string is accepted, as the V1.1 importer produces). Invalid
 * entries are dropped rather than failing the save, because V1.1 syncs
 * projects in the background where an error could not be shown.
 */
export function cleanProjectJiraLinks(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return [];
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,]+/) : [];
  const out: string[] = [];
  for (const entry of list) {
    const link = normalizeProjectJiraLink(entry);
    if (link && !out.includes(link)) out.push(link);
    if (out.length >= MAX_PROJECT_JIRA_LINKS) break;
  }
  return out;
}

export type JiraReference = { jiraKey?: string; jiraUrl?: string };

/** Typed error the global errorHandler maps to a 400. */
function invalid(message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 400, code: 'VALIDATION_ERROR' });
}

/**
 * Validates the Jira reference fields in a create/update body. Returns only
 * the fields that were supplied, validated and normalised; '' or null clears
 * a field. Throws a 400 for an invalid key, an unsafe or non-Jira URL, or a
 * /browse/ URL that names a different key. `current` is the stored record on
 * update, so a key change is checked against the URL that stays.
 */
export function cleanJiraReference(body: Record<string, unknown>, current: JiraReference = {}): JiraReference {
  const out: JiraReference = {};
  const clearing = (v: unknown) => v === null || v === '';
  if (body.jiraKey !== undefined) {
    if (clearing(body.jiraKey)) out.jiraKey = undefined;
    else {
      const key = normalizeJiraKey(body.jiraKey);
      if (!key) throw invalid("Field 'jiraKey' must be a Jira issue key such as PROJ-123.");
      out.jiraKey = key;
    }
  }
  if (body.jiraUrl !== undefined) {
    if (clearing(body.jiraUrl)) out.jiraUrl = undefined;
    else {
      const url = safeJiraUrl(body.jiraUrl);
      if (!url) {
        throw invalid("Field 'jiraUrl' must be an https link to your Jira site (an Atlassian cloud site or the configured JIRA_BASE_URL host).");
      }
      out.jiraUrl = url;
    }
  }
  const key = 'jiraKey' in out ? out.jiraKey : current.jiraKey;
  const url = 'jiraUrl' in out ? out.jiraUrl : current.jiraUrl;
  const urlKey = url ? keyInBrowseUrl(url) : null;
  if (key && urlKey && urlKey !== key) {
    throw invalid(`The Jira URL points to ${urlKey}, not ${key}.`);
  }
  return out;
}

/**
 * Applies cleanJiraReference to a create/update payload in place: the raw
 * client values are replaced by validated ones (or removed when not supplied),
 * so an unvalidated jiraKey/jiraUrl can never reach a repository. Any other
 * jira* field (jiraStatus, jiraSummary, …) is dropped: the portal keeps a
 * reference to Jira, never Jira data.
 */
export function applyJiraReference<T extends Record<string, any>>(payload: T, current: JiraReference = {}): T {
  const clean = cleanJiraReference(payload, current);
  for (const field of Object.keys(payload)) {
    if (/^jira/i.test(field)) delete payload[field];
  }
  return Object.assign(payload, clean);
}
