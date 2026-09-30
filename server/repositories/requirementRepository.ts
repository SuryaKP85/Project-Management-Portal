import { Requirement, RequirementPriority, RequirementStatus, RequirementType } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { matchesSearch, matchesValue, newId, toDateOnly, toIso, toOptional } from './followThroughRows';
import { duplicateRecordError } from './recordConflict';

/**
 * Sprint 17 — requirement persistence.
 *
 * Established repository shape: a PostgreSQL branch guarded by isDbConnected()
 * with an in-memory fallback store; the memory mirror is written only after
 * PostgreSQL has accepted a row, and failed writes are reported, never
 * disguised as success. applyFilter() is the single source of filter
 * semantics in both modes.
 *
 * Codes are REQ-### and are never re-issued, following the roadmap scheme
 * (Sprint 9.6B): memory mode uses an in-process monotonic counter; PostgreSQL
 * uses requirement_code_seq, kept above every stored code, with a bounded
 * retry if a generated code still loses a race on UNIQUE(code).
 */

const memoryRequirements: Map<string, Requirement> = new Map();

export interface RequirementFilter {
  /** Access scope set by the service: only these projects are returned. */
  projectIds?: string[];
  projectId?: string;
  status?: string;
  priority?: string;
  type?: string;
  ownerId?: string;
  search?: string;
}

export const REQUIREMENT_CODE_PATTERN = /^REQ-(\d+)$/;

/** Highest valid REQ suffix + 1, or 101 when none matches. Pure. */
export function nextRequirementCodeNumber(codes: Iterable<string | null | undefined>): number {
  let highest: number | null = null;
  for (const code of codes) {
    const match = typeof code === 'string' ? REQUIREMENT_CODE_PATTERN.exec(code) : null;
    if (match) highest = Math.max(highest ?? 0, Number(match[1]));
  }
  return highest === null ? 101 : highest + 1;
}

/** Memory-mode counter; null until first use. */
let memoryCodeCounter: number | null = null;

/** Reads and advances the counter in one synchronous step — no await between. */
function issueMemoryCode(): string {
  if (memoryCodeCounter === null) {
    memoryCodeCounter = nextRequirementCodeNumber(Array.from(memoryRequirements.values()).map((r) => r.code));
  }
  const n = memoryCodeCounter;
  memoryCodeCounter = n + 1;
  return `REQ-${n}`;
}

function memoryHasCode(code: string): boolean {
  for (const r of memoryRequirements.values()) if (r.code === code) return true;
  return false;
}

const MAX_CODE_ATTEMPTS = 5;
const PG_UNIQUE_VIOLATION = '23505';

/** Raises requirement_code_seq above every stored code (never lowers it). */
async function syncCodeSequence(): Promise<void> {
  const existing = await query('SELECT code FROM requirements');
  const wantedNext = nextRequirementCodeNumber(existing.rows.map((r) => r.code));
  const state = await query('SELECT last_value, is_called FROM requirement_code_seq');
  const lastValue = Number(state.rows[0].last_value);
  const currentNext = state.rows[0].is_called ? lastValue + 1 : lastValue;
  if (wantedNext > currentNext) {
    await query('SELECT setval($1, $2::bigint, true)', ['requirement_code_seq', wantedNext - 1]);
  }
}

async function nextSequenceCode(): Promise<string> {
  const res = await query("SELECT nextval('requirement_code_seq') AS n");
  return `REQ-${Number(res.rows[0].n)}`;
}

function mapRow(r: any): Requirement {
  return {
    id: r.id,
    code: r.code,
    projectId: r.project_id,
    title: r.title,
    description: toOptional(r.description),
    type: r.type as RequirementType,
    status: r.status as RequirementStatus,
    priority: r.priority as RequirementPriority,
    rationale: toOptional(r.rationale),
    source: toOptional(r.source),
    ownerId: toOptional(r.owner_id),
    targetDate: toDateOnly(r.target_date),
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

function applyFilter(items: Requirement[], filter?: RequirementFilter): Requirement[] {
  if (!filter) return items;
  const scope = filter.projectIds ? new Set(filter.projectIds) : null;
  return items.filter((r) => {
    if (scope && !scope.has(r.projectId)) return false;
    if (filter.projectId && r.projectId !== filter.projectId) return false;
    if (!matchesValue(filter.status, r.status)) return false;
    if (!matchesValue(filter.priority, r.priority)) return false;
    if (!matchesValue(filter.type, r.type)) return false;
    if (filter.ownerId && r.ownerId !== filter.ownerId) return false;
    return matchesSearch(filter.search, [r.code, r.title, r.description, r.source]);
  });
}

/** Highest code number first (newest), with creation time as the tiebreak. */
function byCodeDesc(a: Requirement, b: Requirement): number {
  const na = Number(REQUIREMENT_CODE_PATTERN.exec(a.code)?.[1] ?? 0);
  const nb = Number(REQUIREMENT_CODE_PATTERN.exec(b.code)?.[1] ?? 0);
  return nb - na || b.createdAt.localeCompare(a.createdAt);
}

/** Server-controlled fields are set here, never taken from the caller. */
export type RequirementCreateData = Omit<Requirement, 'id' | 'code' | 'createdAt' | 'updatedAt'>;

export const RequirementRepository = {
  async findAll(filter?: RequirementFilter): Promise<Requirement[]> {
    if (filter?.projectIds && filter.projectIds.length === 0) return [];
    if (isDbConnected()) {
      try {
        const res = filter?.projectIds
          ? await query('SELECT * FROM requirements WHERE project_id = ANY($1::text[])', [filter.projectIds])
          : await query('SELECT * FROM requirements');
        return applyFilter(res.rows.map(mapRow), filter).sort(byCodeDesc);
      } catch (err: any) {
        console.warn('DB error in RequirementRepository.findAll, falling back to memory:', err.message);
      }
    }
    return applyFilter(Array.from(memoryRequirements.values()), filter).sort(byCodeDesc);
  },

  async findById(id: string): Promise<Requirement | null> {
    if (isDbConnected()) {
      try {
        const res = await query('SELECT * FROM requirements WHERE id = $1', [id]);
        if (res.rows.length > 0) return mapRow(res.rows[0]);
      } catch (err: any) {
        console.warn('DB error in RequirementRepository.findById, falling back to memory:', err.message);
      }
    }
    return memoryRequirements.get(id) || null;
  },

  /**
   * Creates a requirement with a server-generated id and code. `id` exists
   * only for internal callers (tests, imports); an id already in use is a 409,
   * never an overwrite.
   */
  async create(data: RequirementCreateData, id: string = newId('req')): Promise<Requirement> {
    if (await this.findById(id)) throw duplicateRecordError('requirement', id);
    const build = (code: string): Requirement => {
      const now = new Date().toISOString();
      return {
        id,
        code,
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        type: data.type,
        status: data.status,
        priority: data.priority,
        rationale: data.rationale,
        source: data.source,
        ownerId: data.ownerId,
        targetDate: data.targetDate,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
        createdAt: now,
        updatedAt: now,
      };
    };

    if (isDbConnected()) {
      await syncCodeSequence();
      for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
        const item = build(await nextSequenceCode());
        try {
          await query(
            `INSERT INTO requirements (id, code, project_id, title, description, type, status, priority, rationale, source,
               owner_id, target_date, created_by, updated_by, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [
              item.id, item.code, item.projectId, item.title, item.description || null, item.type, item.status, item.priority,
              item.rationale || null, item.source || null, item.ownerId || null, item.targetDate || null,
              item.createdBy || null, item.updatedBy || null, item.createdAt, item.updatedAt,
            ]
          );
          memoryRequirements.set(id, item);
          return item;
        } catch (err: any) {
          // Only a collision on the code index is fixed by drawing a new code; a duplicate id is a conflict.
          const onCode = err?.code === PG_UNIQUE_VIOLATION && /code/i.test(String(err?.constraint || ''));
          if (err?.code === PG_UNIQUE_VIOLATION && !onCode) throw duplicateRecordError('requirement', id);
          if (onCode && attempt < MAX_CODE_ATTEMPTS) {
            console.warn(`Requirement code ${item.code} lost a uniqueness race; retrying (${attempt}/${MAX_CODE_ATTEMPTS}).`);
            continue;
          }
          throw err;
        }
      }
      throw new Error(`Could not allocate a unique requirement code after ${MAX_CODE_ATTEMPTS} attempts.`);
    }

    let code = issueMemoryCode();
    while (memoryHasCode(code)) code = issueMemoryCode();
    const item = build(code);
    memoryRequirements.set(id, item);
    return item;
  },

  /** Updates editable fields; id, code, projectId, createdBy and createdAt never change. */
  async update(id: string, updates: Partial<Requirement>): Promise<Requirement | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const updated: Requirement = {
      ...existing,
      title: updates.title ?? existing.title,
      description: 'description' in updates ? updates.description : existing.description,
      type: updates.type ?? existing.type,
      status: updates.status ?? existing.status,
      priority: updates.priority ?? existing.priority,
      rationale: 'rationale' in updates ? updates.rationale : existing.rationale,
      source: 'source' in updates ? updates.source : existing.source,
      ownerId: 'ownerId' in updates ? updates.ownerId : existing.ownerId,
      targetDate: 'targetDate' in updates ? updates.targetDate : existing.targetDate,
      updatedBy: updates.updatedBy ?? existing.updatedBy,
      updatedAt: new Date().toISOString(),
    };
    if (isDbConnected()) {
      await query(
        `UPDATE requirements SET title = $1, description = $2, type = $3, status = $4, priority = $5, rationale = $6,
           source = $7, owner_id = $8, target_date = $9, updated_by = $10, updated_at = $11
         WHERE id = $12`,
        [
          updated.title, updated.description || null, updated.type, updated.status, updated.priority,
          updated.rationale || null, updated.source || null, updated.ownerId || null, updated.targetDate || null,
          updated.updatedBy || null, updated.updatedAt, id,
        ]
      );
    }
    memoryRequirements.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const existedInMemory = memoryRequirements.delete(id);
    if (isDbConnected()) {
      const res = await query('DELETE FROM requirements WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    }
    return existedInMemory;
  },
};
