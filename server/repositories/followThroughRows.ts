/**
 * Sprint 14 — row helpers shared by the follow-through repositories (meetings,
 * action items, waiting-for items, follow-ups).
 *
 * pg returns DATE columns as local-midnight Date objects and TIMESTAMPTZ as
 * Date objects; the record contracts are strings (YYYY-MM-DD and ISO). This is
 * the same conversion the roadmap repository applies to its rows.
 */

export function toDateOnly(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value);
  return text.length > 10 ? text.slice(0, 10) : text;
}

export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function toOptionalIso(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return toIso(value);
}

export function toOptional(value: unknown): string | undefined {
  return value === null || value === undefined || value === '' ? undefined : String(value);
}

/** Case-insensitive substring match over the given fields. */
export function matchesSearch(search: string | undefined, fields: Array<string | undefined>): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return fields.some((f) => (f || '').toLowerCase().includes(q));
}

/** Case-insensitive equality; an absent filter or 'all' matches everything. */
export function matchesValue(filter: string | undefined, value: string | undefined): boolean {
  if (!filter || filter === 'all') return true;
  return (value || '').toLowerCase() === filter.toLowerCase();
}

/** Ascending by a YYYY-MM-DD field with undated records last, then by creation. */
export function byDueThenCreated<T extends { createdAt: string }>(due: (item: T) => string | undefined) {
  return (a: T, b: T): number => {
    const da = due(a);
    const db = due(b);
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (!da && db) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  };
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
