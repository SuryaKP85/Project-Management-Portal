/**
 * Sprint 15A — Jira references (External Delivery Links) in the browser.
 *
 * A Jira reference is a Jira issue key and/or a Jira URL on a portal record.
 * It is shown as a link that opens the issue in Jira in a new tab. The portal
 * never calls Jira and stores no Jira data.
 *
 * The rules mirror server/services/jiraReference.ts (the test suite checks
 * that both accept and reject the same inputs):
 * - keys look like PROJ-123 (a letter, then letters, digits or underscores,
 *   a dash and a positive number) and are shown upper-case;
 * - only absolute https URLs without credentials are linked, and only on an
 *   Atlassian cloud host (*.atlassian.net, *.jira.com) or the configured
 *   JIRA_BASE_URL host. Anything else is shown as inert text.
 * Links are built with escaped attributes and always open with
 * target="_blank" rel="noopener noreferrer".
 */

import { apiClient } from './services/apiClient.js';
import { escapeHtml } from './safeHtml.js';

export const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,49}-[1-9][0-9]{0,11}$/;
export const JIRA_CLOUD_HOST_SUFFIXES = ['atlassian.net', 'jira.com'];
const MAX_URL_LENGTH = 2048;

let jiraBase = null;
let configRequest = null;

// Sprint 16: one shared escaping helper for the whole browser app (re-exported for existing callers).
export { escapeHtml };

/** The key upper-cased, or null when it is not a syntactically valid Jira key. */
export function normalizeJiraKey(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase();
  return JIRA_KEY_PATTERN.test(key) ? key : null;
}

/** Parses a Jira base URL (https, no credentials, query or fragment); null otherwise. */
export function parseJiraBase(raw) {
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

/** Sets the configured Jira base URL (normally from GET /config/external-links). */
export function setJiraBaseUrl(raw) {
  jiraBase = parseJiraBase(raw);
  return jiraBase;
}

export function getJiraBaseUrl() {
  return jiraBase ? `${jiraBase.origin}${jiraBase.pathname.replace(/\/+$/, '')}` : null;
}

const isCloudHost = (host) => JIRA_CLOUD_HOST_SUFFIXES.some((suffix) => host.endsWith(`.${suffix}`));

/** A normalised, safe-to-link Jira URL, or null. */
export function safeJiraUrl(value, base = jiraBase) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_URL_LENGTH || !/^https:\/\//i.test(text)) return null;
  let url;
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
export function jiraIssueUrl(key, base = jiraBase) {
  const normalized = normalizeJiraKey(key);
  if (!normalized || !base) return null;
  return `${base.origin}${base.pathname.replace(/\/+$/, '')}/browse/${normalized}`;
}

/** The key named by a /browse/<KEY> link, if any. */
export function keyFromJiraUrl(url) {
  try {
    const match = /\/browse\/([^/?#]+)\/?$/i.exec(new URL(url).pathname);
    return match ? normalizeJiraKey(decodeURIComponent(match[1])) : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a reference to what can be shown: the link target (a stored safe
 * URL first, then one built from the key and the configured base) and the key.
 */
export function resolveJiraReference(ref = {}) {
  const key = normalizeJiraKey(ref.jiraKey);
  const href = safeJiraUrl(ref.jiraUrl) || jiraIssueUrl(key);
  return { key: key || (href ? keyFromJiraUrl(href) : null), href };
}

/**
 * HTML for a Jira reference: a link that opens Jira in a new tab, or, when the
 * reference cannot be linked safely, inert escaped text. Empty string when
 * there is no reference at all.
 * @param {{jiraKey?: string, jiraUrl?: string}} ref
 * @param {{label?: string, className?: string, prefix?: boolean}} options
 */
export function jiraLinkHtml(ref = {}, { label, className = 'badge bg-primary-subtle text-primary text-decoration-none', prefix = true } = {}) {
  const hasKey = typeof ref.jiraKey === 'string' && ref.jiraKey.trim() !== '';
  const hasUrl = typeof ref.jiraUrl === 'string' && ref.jiraUrl.trim() !== '';
  if (!hasKey && !hasUrl) return '';
  const { key, href } = resolveJiraReference(ref);
  const text = label || (key ? `${prefix ? 'Jira: ' : ''}${key}` : 'Jira');
  if (href) {
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="${escapeHtml(className)}" title="${escapeHtml(`Open ${key || 'in Jira'} in Jira (new tab)`)}"><i class="fa-brands fa-jira me-1" aria-hidden="true"></i>${escapeHtml(text)} <span aria-hidden="true">↗</span><span class="visually-hidden"> (opens Jira in a new tab)</span></a>`;
  }
  const why = key && !hasUrl
    ? 'No Jira site is configured (JIRA_BASE_URL), so this key cannot be linked.'
    : 'Not an https link to a recognised Jira site, so it is not opened.';
  const shown = key ? text : (hasKey ? String(ref.jiraKey) : 'Jira link blocked');
  return `<span class="badge bg-light text-secondary border" title="${escapeHtml(why)}"><i class="fa-brands fa-jira me-1" aria-hidden="true"></i>${escapeHtml(shown)}</span>`;
}

/**
 * A V1.1 project Jira link entry as a reference: a Jira key (PROJ-123) or a
 * URL. Imported spreadsheets put keys in this list, so both are supported.
 */
export function projectLinkReference(entry) {
  const text = String(entry ?? '').trim();
  return normalizeJiraKey(text) ? { jiraKey: text } : { jiraUrl: text };
}

/** True when a project editor entry can be saved: a Jira key or an https link to a recognised Jira site. */
export function isValidProjectJiraLink(entry) {
  const text = String(entry ?? '').trim();
  return !!normalizeJiraKey(text) || !!safeJiraUrl(text);
}

/** Loads the Jira base URL once per page; failures leave cloud-host links working. */
export function loadJiraLinkConfig() {
  if (!configRequest) {
    configRequest = apiClient.get('/config/external-links')
      .then((data) => setJiraBaseUrl(data && data.jira ? data.jira.baseUrl : null))
      .catch(() => null);
  }
  return configRequest;
}

export const JiraLinks = {
  normalizeJiraKey, parseJiraBase, setJiraBaseUrl, getJiraBaseUrl, safeJiraUrl, jiraIssueUrl,
  keyFromJiraUrl, resolveJiraReference, jiraLinkHtml, loadJiraLinkConfig, projectLinkReference, isValidProjectJiraLink,
};
