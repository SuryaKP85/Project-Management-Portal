import { RequirementDecomposition, RequirementLink, RequirementLinkTargetType } from '../models/types';
import { isDbConnected, query, trackMemoryWrite } from '../config/database';
import { newId, toIso } from './followThroughRows';
import { duplicateRecordError } from './recordConflict';

/**
 * Sprint 18 — persistence for approved decompositions and requirement links.
 *
 * The newer repository pattern: PostgreSQL first, errors reported (never
 * swallowed), the memory mirror written only after PostgreSQL accepted the
 * row, and every memory write recorded for transaction rollback
 * (trackMemoryWrite). Uniqueness is enforced in both modes:
 * - one decomposition per (requirement, revision);
 * - one link per (requirement, target type, target id).
 * In PostgreSQL those are UNIQUE constraints; in memory the check and the
 * insert happen in one synchronous step, so concurrent requests cannot both
 * pass it.
 */

const memoryDecompositions: Map<string, RequirementDecomposition> = new Map();
const memoryLinks: Map<string, RequirementLink> = new Map();

export const REQUIREMENT_LINK_TARGET_TYPES: readonly RequirementLinkTargetType[] = ['epic', 'feature', 'story'];

const PG_UNIQUE_VIOLATION = '23505';

const conflict = (message: string) => Object.assign(new Error(message), { status: 409, code: 'CONFLICT' });

export const decompositionExists = () => conflict('This requirement revision has already been decomposed.');

function mapDecomposition(r: any): RequirementDecomposition {
  return {
    id: r.id,
    requirementId: r.requirement_id,
    projectId: r.project_id,
    requirementRevision: Number(r.requirement_revision),
    createdBy: r.created_by,
    createdAt: toIso(r.created_at),
  };
}

function mapLink(r: any): RequirementLink {
  return {
    id: r.id,
    requirementId: r.requirement_id,
    projectId: r.project_id,
    targetType: r.target_type as RequirementLinkTargetType,
    targetId: r.target_id,
    decompositionId: r.decomposition_id,
    createdBy: r.created_by,
    createdAt: toIso(r.created_at),
  };
}

const byCreated = <T extends { createdAt: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt);

export const RequirementDecompositionRepository = {
  async findByRequirement(requirementId: string): Promise<RequirementDecomposition[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM requirement_decompositions WHERE requirement_id = $1', [requirementId]);
      return res.rows.map(mapDecomposition).sort(byCreated);
    }
    return Array.from(memoryDecompositions.values()).filter((d) => d.requirementId === requirementId).sort(byCreated);
  },

  async findByRevision(requirementId: string, revision: number): Promise<RequirementDecomposition | null> {
    return (await this.findByRequirement(requirementId)).find((d) => d.requirementRevision === revision) || null;
  },

  /** Records a decomposition; a second one for the same requirement revision is a 409. */
  async create(data: Omit<RequirementDecomposition, 'id' | 'createdAt'>, id: string = newId('rdc')): Promise<RequirementDecomposition> {
    const record: RequirementDecomposition = { ...data, id, createdAt: new Date().toISOString() };
    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO requirement_decompositions (id, requirement_id, project_id, requirement_revision, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [record.id, record.requirementId, record.projectId, record.requirementRevision, record.createdBy || null, record.createdAt]
        );
      } catch (err: any) {
        if (err?.code === PG_UNIQUE_VIOLATION && /revision/i.test(String(err?.constraint || ''))) throw decompositionExists();
        if (err?.code === PG_UNIQUE_VIOLATION) throw duplicateRecordError('requirement decomposition', record.id);
        throw err;
      }
    } else {
      // Synchronous check-and-insert: no await between them.
      for (const d of memoryDecompositions.values()) {
        if (d.requirementId === record.requirementId && d.requirementRevision === record.requirementRevision) throw decompositionExists();
      }
      if (memoryDecompositions.has(record.id)) throw duplicateRecordError('requirement decomposition', record.id);
    }
    trackMemoryWrite(memoryDecompositions, record.id);
    memoryDecompositions.set(record.id, record);
    return record;
  },
};

export const RequirementLinkRepository = {
  async findByRequirement(requirementId: string): Promise<RequirementLink[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM requirement_links WHERE requirement_id = $1', [requirementId]);
      return res.rows.map(mapLink).sort(byCreated);
    }
    return Array.from(memoryLinks.values()).filter((l) => l.requirementId === requirementId).sort(byCreated);
  },

  async findByDecomposition(decompositionId: string): Promise<RequirementLink[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM requirement_links WHERE decomposition_id = $1', [decompositionId]);
      return res.rows.map(mapLink).sort(byCreated);
    }
    return Array.from(memoryLinks.values()).filter((l) => l.decompositionId === decompositionId).sort(byCreated);
  },

  /**
   * Stores one link. Callers (RequirementDecompositionService) have already
   * checked that the target exists in the requirement's project; a link that
   * already exists is a 409.
   */
  async create(data: Omit<RequirementLink, 'id' | 'createdAt'>, id: string = newId('rlk')): Promise<RequirementLink> {
    if (!REQUIREMENT_LINK_TARGET_TYPES.includes(data.targetType)) {
      throw Object.assign(new Error(`Unsupported link target type '${data.targetType}'.`), { status: 400, code: 'VALIDATION_ERROR' });
    }
    const link: RequirementLink = { ...data, id, createdAt: new Date().toISOString() };
    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO requirement_links (id, requirement_id, project_id, target_type, target_id, decomposition_id, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [link.id, link.requirementId, link.projectId, link.targetType, link.targetId, link.decompositionId, link.createdBy || null, link.createdAt]
        );
      } catch (err: any) {
        if (err?.code === PG_UNIQUE_VIOLATION && /target/i.test(String(err?.constraint || ''))) throw conflict('This delivery record is already linked to the requirement.');
        if (err?.code === PG_UNIQUE_VIOLATION) throw duplicateRecordError('requirement link', link.id);
        throw err;
      }
    } else {
      for (const l of memoryLinks.values()) {
        if (l.requirementId === link.requirementId && l.targetType === link.targetType && l.targetId === link.targetId) {
          throw conflict('This delivery record is already linked to the requirement.');
        }
      }
      if (memoryLinks.has(link.id)) throw duplicateRecordError('requirement link', link.id);
    }
    trackMemoryWrite(memoryLinks, link.id);
    memoryLinks.set(link.id, link);
    return link;
  },
};
