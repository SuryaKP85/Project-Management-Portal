import { FollowThroughRelatedType, FollowUp, FollowUpStatus } from '../models/types';
import { persistentMap } from '../config/persistence';
import { isDbConnected, query } from '../config/database';
import {
  byDueThenCreated, matchesSearch, matchesValue, newId, toDateOnly, toIso, toOptional, toOptionalIso,
} from './followThroughRows';

/**
 * Sprint 14 — follow-up persistence: the next follow-up action a PM owes on a
 * project, optionally tied to one related record.
 */

// Sprint 20: restored from / saved to the embedded data file in persistent mode.
const memoryFollowUps = persistentMap<FollowUp>('followUps');

export interface FollowUpFilter {
  projectIds?: string[];
  projectId?: string;
  ownerId?: string;
  status?: string;
  relatedType?: string;
  relatedId?: string;
  /** Past due and still Open. */
  overdue?: boolean;
  search?: string;
}

function mapRow(r: any): FollowUp {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: toOptional(r.description),
    ownerId: r.owner_id,
    dueDate: toDateOnly(r.due_date),
    status: r.status as FollowUpStatus,
    relatedType: toOptional(r.related_type) as FollowThroughRelatedType | undefined,
    relatedId: toOptional(r.related_id),
    completedAt: toOptionalIso(r.completed_at),
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

function applyFilter(items: FollowUp[], filter?: FollowUpFilter): FollowUp[] {
  if (!filter) return items;
  const scope = filter.projectIds ? new Set(filter.projectIds) : null;
  const today = new Date().toISOString().slice(0, 10);
  return items.filter((f) => {
    if (scope && !scope.has(f.projectId)) return false;
    if (filter.projectId && f.projectId !== filter.projectId) return false;
    if (filter.ownerId && f.ownerId !== filter.ownerId) return false;
    if (!matchesValue(filter.status, f.status)) return false;
    if (filter.relatedType && f.relatedType !== filter.relatedType) return false;
    if (filter.relatedId && f.relatedId !== filter.relatedId) return false;
    if (filter.overdue && !(f.dueDate && f.dueDate < today && f.status === 'Open')) return false;
    return matchesSearch(filter.search, [f.title, f.description]);
  });
}

const byDue = byDueThenCreated<FollowUp>((f) => f.dueDate);

const COLUMNS = `id, project_id, title, description, owner_id, due_date, status, related_type, related_id,
  completed_at, created_by, updated_by, created_at, updated_at`;

export const FollowUpRepository = {
  async findAll(filter?: FollowUpFilter): Promise<FollowUp[]> {
    if (filter?.projectIds && filter.projectIds.length === 0) return [];
    if (isDbConnected()) {
      const res = filter?.projectIds
        ? await query(`SELECT * FROM follow_ups WHERE project_id = ANY($1::text[])`, [filter.projectIds])
        : await query(`SELECT * FROM follow_ups`);
      return applyFilter(res.rows.map(mapRow), filter).sort(byDue);
    }
    return applyFilter(Array.from(memoryFollowUps.values()), filter).sort(byDue);
  },

  async findById(id: string): Promise<FollowUp | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM follow_ups WHERE id = $1', [id]);
      // Sprint 24: PostgreSQL is the source of truth; memory is never consulted in PG mode.
      return res.rows.length > 0 ? mapRow(res.rows[0]) : null;
    }
    return memoryFollowUps.get(id) || null;
  },

  async create(data: Omit<FollowUp, 'id' | 'createdAt' | 'updatedAt'>): Promise<FollowUp> {
    const now = new Date().toISOString();
    const item: FollowUp = { ...data, id: newId('fup'), createdAt: now, updatedAt: now };
    if (isDbConnected()) {
      await query(
        `INSERT INTO follow_ups (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          item.id, item.projectId, item.title, item.description || null, item.ownerId || null, item.dueDate || null,
          item.status, item.relatedType || null, item.relatedId || null, item.completedAt || null,
          item.createdBy || null, item.updatedBy || null, item.createdAt, item.updatedAt,
        ]
      );
    }
    memoryFollowUps.set(item.id, item);
    return item;
  },

  async update(id: string, updates: Partial<FollowUp>): Promise<FollowUp | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const updated: FollowUp = {
      ...existing,
      ...updates,
      id: existing.id,
      projectId: existing.projectId,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      updatedAt: new Date().toISOString(),
    };
    if (isDbConnected()) {
      await query(
        `UPDATE follow_ups SET title = $1, description = $2, owner_id = $3, due_date = $4, status = $5,
           related_type = $6, related_id = $7, completed_at = $8, updated_by = $9, updated_at = $10
         WHERE id = $11`,
        [
          updated.title, updated.description || null, updated.ownerId || null, updated.dueDate || null,
          updated.status, updated.relatedType || null, updated.relatedId || null, updated.completedAt || null,
          updated.updatedBy || null, updated.updatedAt, id,
        ]
      );
    }
    memoryFollowUps.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const existedInMemory = memoryFollowUps.delete(id);
    if (isDbConnected()) {
      const res = await query('DELETE FROM follow_ups WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    }
    return existedInMemory;
  },

  /** Clears references to a deleted record so none are left dangling. */
  async clearRelated(relatedType: FollowThroughRelatedType, relatedId: string): Promise<void> {
    for (const [id, item] of memoryFollowUps) {
      if (item.relatedType === relatedType && item.relatedId === relatedId) {
        memoryFollowUps.set(id, { ...item, relatedType: undefined, relatedId: undefined, updatedAt: new Date().toISOString() });
      }
    }
    if (isDbConnected()) {
      await query(
        'UPDATE follow_ups SET related_type = NULL, related_id = NULL, updated_at = NOW() WHERE related_type = $1 AND related_id = $2',
        [relatedType, relatedId]
      );
    }
  },
};
