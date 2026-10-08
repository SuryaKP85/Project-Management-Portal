import { query, withSavepoint } from '../config/database';
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

// Sprint 24: the same scheme for governance records, tasks and sprints, which
// used `memory.size + 101` or random three-digit numbers (both could repeat).
export type DeliveryCodeKind = 'epic' | 'feature' | 'story' | 'task' | 'sprint' | 'risk' | 'issue' | 'milestone' | 'release' | 'dependency' | 'project';

export const DELIVERY_CODE_SPECS: Readonly<Record<DeliveryCodeKind, { prefix: string; table: string; sequence: string }>> = {
  epic: { prefix: 'EPC', table: 'epics', sequence: 'epic_code_seq' },
  feature: { prefix: 'FEAT', table: 'features', sequence: 'feature_code_seq' },
  story: { prefix: 'STR', table: 'stories', sequence: 'story_code_seq' },
  task: { prefix: 'TSK', table: 'tasks', sequence: 'task_code_seq' },
  sprint: { prefix: 'SPR', table: 'sprints', sequence: 'sprint_code_seq' },
  risk: { prefix: 'RSK', table: 'risks', sequence: 'risk_code_seq' },
  issue: { prefix: 'ISS', table: 'issues', sequence: 'issue_code_seq' },
  milestone: { prefix: 'MLS', table: 'milestones', sequence: 'milestone_code_seq' },
  release: { prefix: 'REL', table: 'releases', sequence: 'release_code_seq' },
  dependency: { prefix: 'DEP', table: 'dependencies', sequence: 'dependency_code_seq' },
  // Sprint 24: generated project ids (a project's code may be client-proposed; its id never is).
  project: { prefix: 'PRJ', table: 'projects', sequence: 'project_code_seq' },
};

const PATTERNS = Object.fromEntries(
  Object.entries(DELIVERY_CODE_SPECS).map(([kind, spec]) => [kind, new RegExp(`^${spec.prefix}-(\\d+)$`)])
) as Record<DeliveryCodeKind, RegExp>;

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

/**
 * PostgreSQL mode: raise the sequence above every stored code (and any extra
 * values the caller knows are taken, such as project ids), then draw the next value.
 */
export async function issueSequenceDeliveryCode(kind: DeliveryCodeKind, extraCodes: Iterable<string> = []): Promise<string> {
  const spec = DELIVERY_CODE_SPECS[kind];
  const existing = await query(`SELECT code FROM ${spec.table}`);
  const wantedNext = nextDeliveryCodeNumber(kind, [...existing.rows.map((r: any) => r.code), ...extraCodes]);
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

/**
 * Sprint 24 — PostgreSQL insert of a record whose code may be generated. A
 * generated code comes from the kind's sequence; a collision on the code index
 * draws a new one (bounded). Every other error — and a collision on an explicit
 * code — propagates: the caller never reports success for a row that was not
 * written. Returns the code the row was stored with.
 */
export async function insertWithCode(kind: DeliveryCodeKind, explicitCode: string | undefined, insert: (code: string) => Promise<unknown>): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const code = explicitCode || (await issueSequenceDeliveryCode(kind));
    try {
      await withSavepoint(() => insert(code));
      return code;
    } catch (err) {
      if (!explicitCode && isCodeCollision(err) && attempt < MAX_CODE_ATTEMPTS) continue;
      throw err;
    }
  }
}
