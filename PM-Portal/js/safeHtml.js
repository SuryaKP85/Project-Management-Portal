/**
 * Sprint 16 — shared helpers for rendering untrusted values safely.
 *
 * Every value that reaches innerHTML in the project and delivery views goes
 * through one of these, chosen by context:
 * - text between tags, and quoted attribute values → escapeHtml;
 * - a URL in href → safeHttpsUrl (then escapeHtml);
 * - a CSS class token → cssToken; a percentage in a style → percent;
 * - data handed to a click handler → dataArgs (a JSON array in a data-*
 *   attribute, read back with readDataArgs) — never interpolated into
 *   inline JavaScript.
 * Form fields are filled through the DOM (element.value), not markup.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for HTML content and quoted attribute values. */
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/**
 * An absolute https URL without credentials, normalised; null otherwise.
 * Rejects javascript:, data:, vbscript:, http:, protocol-relative and
 * malformed URLs. Any https host is allowed (company-hosted sites included).
 */
export function safeHttpsUrl(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 2048 || !/^https:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A value reduced to a safe CSS class token (letters, digits, dashes); '' when nothing is left. */
export function cssToken(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
}

/** A number clamped to 0–100, for width percentages in style attributes. */
export function percent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/** Arguments for a delegated click handler, as an escaped JSON array for a data-* attribute. */
export const dataArgs = (...args) => escapeHtml(JSON.stringify(args.map((a) => (a === undefined ? null : a))));

/** Reads arguments written by dataArgs; strings and nulls only. */
export function readDataArgs(element, attribute = 'data-args') {
  try {
    const parsed = JSON.parse(element.getAttribute(attribute) || '[]');
    return Array.isArray(parsed) ? parsed.map((a) => (a === null || typeof a === 'string' ? a : String(a))) : [];
  } catch {
    return [];
  }
}
