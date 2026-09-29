import { FollowThroughRelatedType, WaitingForItem, WaitingForStatus } from '../models/types';
import { isDbConnected, query } from '../config/database';
import {
  byDueThenCreated, matchesSearch, matchesValue, newId, toDateOnly, toIso, toOptional, toOptionalIso,
} from './followThroughRows';

/**
 * Sprint 14 — Waiting For persistence: something a project is blocked on
 * because a person, team or external party is expected to act.
 */

const memoryWaitingFor: Map<string, WaitingForItem> = new Map();

/** Statuses that mean the project is still waiting. */
export const OPEN_WAITING_FOR_STATUSES: WaitingForStatus[] = ['Waiting', 'Follow-up Needed'];

export interface WaitingForFilter {
  projectIds?: string[];
  projectId?: string;
  ownerId?: string;
  waitingOnUserId?: string;
  status?: string;
  /** Only Waiting / Follow-up Needed. */
  open?: boolean;
  relatedType?: string;
  relatedId?: string;
  search?: string;
}

function mapRow(r: any): WaitingForItem {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: toOptional(r.description),
    ownerId: r.owner_id,
    waitingOnUserId: toOptional(r.waiting_on_user_id),
    waitingOnTeamId: toOptional(r.waiting_on_team_id),
    waitingOnName: toOptional(r.waiting_on_name),
    expectedDate: toDateOnly(r.expected_date),
    status: r.status as WaitingForStatus,
    relatedType: toOptional(r.related_type) as FollowThroughRelatedType | undefined,
    relatedId: toOptional(r.related_id),
    resolvedAt: toOptionalIso(r.resolved_at),
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

function applyFilter(items: WaitingForItem[], filter?: WaitingForFilter): WaitingForItem[] {
  if (!filter) return items;
  const scope = filter.projectIds ? new Set(filter.projectIds) : null;
  return items.filter((w) => {
    if (scope && !scope.has(w.projectId)) return false;
    if (filter.projectId && w.projectId !== filter.projectId) return false;
    if (filter.ownerId && w.ownerId !== filter.ownerId) return false;
    if (filter.waitingOnUserId && w.waitingOnUserId !== filter.waitingOnUserId) return false;
    if (!matchesValue(filter.status, w.status)) return false;
    if (filter.open && !OPEN_WAITING_FOR_STATUSES.includes(w.status)) return false;
    if (filter.relatedType && w.relatedType !== filter.relatedType) return false;
    if (filter.relatedId && w.relatedId !== filter.relatedId) return false;
    return matchesSearch(filter.search, [w.title, w.description, w.waitingOnName]);
  });
}

const byExpected = byDueThenCreated<WaitingForItem>((w) => w.expectedDate);

const COLUMNS = `id, project_id, title, description, owner_id, waiting_on_user_id, waiting_on_team_id,
  waiting_on_name, expected_date, status, related_type, related_id, resolved_at, created_by, updated_by,
  created_at, updated_at`;

export const WaitingForRepository = {
  async findAll(filter?: WaitingForFilter): Promise<WaitingForItem[]> {
    if (filter?.projectIds && filter.projectIds.length === 0) return [];
    if (isDbConnected()) {
      try {
        const res = filter?.projectIds
          ? await query(`SELECT * FROM waiting_for_items WHERE project_id = ANY($1::text[])`, [filter.projectIds])
          : await query(`SELECT * FROM waiting_for_items`);
        return applyFilter(res.rows.map(mapRow), filter).sort(byExpected);
      } catch (err: any) {
        console.warn('DB error in WaitingForRepository.findAll, falling back to memory:', err.message);
      }
    }
    return applyFilter(Array.from(memoryWaitingFor.values()), filter).sort(byExpected);
  },

  async findById(id: string): Promise<WaitingForItem | null> {
    if (isDbConnected()) {
      try {
        const res = await query('SELECT * FROM waiting_for_items WHERE id = $1', [id]);
        if (res.rows.length > 0) return mapRow(res.rows[0]);
      } catch (err: any) {
        console.warn('DB error in WaitingForRepository.findById, falling back to memory:', err.message);
      }
    }
    return memoryWaitingFor.get(id) || null;
  },

  async create(data: Omit<WaitingForItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WaitingForItem> {
    const now = new Date().toISOString();
    const item: WaitingForItem = { ...data, id: newId('wfr'), createdAt: now, updatedAt: now };
    if (isDbConnected()) {
      await query(
        `INSERT INTO waiting_for_items (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          item.id, item.projectId, item.title, item.description || null, item.ownerId || null,
          item.waitingOnUserId || null, item.waitingOnTeamId || null, item.waitingOnName || null,
          item.expectedDate || null, item.status, item.relatedType || null, item.relatedId || null,
          item.resolvedAt || null, item.createdBy || null, item.updatedBy || null, item.createdAt, item.updatedAt,
        ]
      );
    }
    memoryWaitingFor.set(item.id, item);
    return item;
  },

  async update(id: string, updates: Partial<WaitingForItem>): Promise<WaitingForItem | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const updated: WaitingForItem = {
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
        `UPDATE waiting_for_items SET title = $1, description = $2, owner_id = $3, waiting_on_user_id = $4,
           waiting_on_team_id = $5, waiting_on_name = $6, expected_date = $7, status = $8, related_type = $9,
           related_id = $10, resolved_at = $11, updated_by = $12, updated_at = $13
         WHERE id = $14`,
        [
          updated.title, updated.description || null, updated.ownerId || null, updated.waitingOnUserId || null,
          updated.waitingOnTeamId || null, updated.waitingOnName || null, updated.expectedDate || null,
          updated.status, updated.relatedType || null, updated.relatedId || null, updated.resolvedAt || null,
          updated.updatedBy || null, updated.updatedAt, id,
        ]
      );
    }
    memoryWaitingFor.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const existedInMemory = memoryWaitingFor.delete(id);
    if (isDbConnected()) {
      const res = await query('DELETE FROM waiting_for_items WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    }
    return existedInMemory;
  },

  /** Clears references to a deleted record so none are left dangling. */
  async clearRelated(relatedType: FollowThroughRelatedType, relatedId: string): Promise<void> {
    for (const [id, item] of memoryWaitingFor) {
      if (item.relatedType === relatedType && item.relatedId === relatedId) {
        memoryWaitingFor.set(id, { ...item, relatedType: undefined, relatedId: undefined, updatedAt: new Date().toISOString() });
      }
    }
    if (isDbConnected()) {
      await query(
        'UPDATE waiting_for_items SET related_type = NULL, related_id = NULL, updated_at = NOW() WHERE related_type = $1 AND related_id = $2',
        [relatedType, relatedId]
      );
    }
  },
};
