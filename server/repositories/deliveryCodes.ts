import { query } from '../config/database';
import { persistentMap } from '../config/persistence';

/**
 * Sprint 18 — collision-safe codes for epics (EPC-###), features (FEAT-###)
 * and stories (STR-###). Replaces the random three-digit codes, which could
 * repeat; tasks keep their existing scheme.
 *
 * The same scheme as requirements and roadmap items:
 * - PostgreSQL: one sequence per kind, raised above every stored code before
 *   each code is issued (it is never lowered); UNIQUE(code) plus a bounded
 *   retry in the repository is the backstop for anything that still races.
 * - Memory: a monotonic in-process counter, moved past every code already in
 *   the store (seeds, earlier random codes, explicit codes), skipping any code
 *   in use.
 * Codes keep their published prefixes; numbers continue above the highest
 * stored code (101 when there is none).
 */

export type DeliveryCodeKind = 'epic' | 'feature' | 'story';

export const DELIVERY_CODE_SPECS: Readonly<Record<DeliveryCodeKind, { prefix: string; table: string; sequence: string }>> = {
  epic: { prefix: 'EPC', table: 'epics', sequence: 'epic_code_seq' },
  feature: { prefix: 'FEAT', table: 'features', sequence: 'feature_code_seq' },
  story: { prefix: 'STR', table: 'stories', sequence: 'story_code_seq' },
};

const PATTERNS: Record<DeliveryCodeKind, RegExp> = {
  epic: /^EPC-(\d+)$/,
  feature: /^FEAT-(\d+)$/,
  story: /^STR-(\d+)$/,
};

/** Highest valid code number of this kind + 1, or 101 when none matches. Pure. */
export function nextDeliveryCodeNumber(kind: DeliveryCodeKind, codes: Iterable<string | null | undefined>): number {
  let highest: number | null = null;
  for (const code of codes) {
    const match = typeof code === 'string' ? PATTERNS[kind].exec(code) : null;
    if (match) highest = Math.max(highest ?? 0, Number(match[1]));
  }
  return highest === null ? 101 : highest + 1;
}

/** Sprint 20: memory-mode counters, kept with the embedded data. */
const codeCounters = persistentMap<number>('deliveryCodeCounters');

/**
 * Memory mode. Reads and advances the counter in one synchronous step, so
 * concurrent creates in this process never receive the same code.
 */
export function issueMemoryDeliveryCode(kind: DeliveryCodeKind, existingCodes: Iterable<string | null | undefined>): string {
  const inUse = new Set<string>();
  for (const code of existingCodes) if (typeof code === 'string') inUse.add(code);
  // Sprint 20: the counter is kept with the embedded data, so codes are not re-issued after a restart.
  let n = Math.max(codeCounters.get(kind) ?? 0, nextDeliveryCodeNumber(kind, inUse));
  while (inUse.has(`${DELIVERY_CODE_SPECS[kind].prefix}-${n}`)) n += 1;
  codeCounters.set(kind, n + 1);
  return `${DELIVERY_CODE_SPECS[kind].prefix}-${n}`;
}

/** PostgreSQL mode: raise the sequence above every stored code, then draw the next value. */
export async function issueSequenceDeliveryCode(kind: DeliveryCodeKind): Promise<string> {
  const spec = DELIVERY_CODE_SPECS[kind];
  const existing = await query(`SELECT code FROM ${spec.table}`);
  const wantedNext = nextDeliveryCodeNumber(kind, existing.rows.map((r: any) => r.code));
  const state = await query(`SELECT last_value, is_called FROM ${spec.sequence}`);
  const lastValue = Number(state.rows[0].last_value);
  const currentNext = state.rows[0].is_called ? lastValue + 1 : lastValue;
  if (wantedNext > currentNext) {
    await query('SELECT setval($1, $2::bigint, true)', [spec.sequence, wantedNext - 1]);
  }
  const res = await query(`SELECT nextval('${spec.sequence}') AS n`);
  return `${spec.prefix}-${Number(res.rows[0].n)}`;
}

export const MAX_CODE_ATTEMPTS = 5;
const PG_UNIQUE_VIOLATION = '23505';

/** True for a unique violation on the code column (not, for example, on the id). */
export function isCodeCollision(err: any): boolean {
  return err?.code === PG_UNIQUE_VIOLATION && /code/i.test(String(err?.constraint || err?.detail || ''));
}
