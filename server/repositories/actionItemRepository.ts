import { ActionItem, ActionItemPriority, ActionItemStatus } from '../models/types';
import { persistentMap } from '../config/persistence';
import { isDbConnected, query } from '../config/database';
import {
  byDueThenCreated, matchesSearch, matchesValue, newId, toDateOnly, toIso, toOptional, toOptionalIso,
} from './followThroughRows';

/**
 * Sprint 14 — action item persistence (meeting/follow-through commitments,
 * separate from delivery tasks). Same shape as the other follow-through
 * repositories: PostgreSQL when connected, in-memory fallback otherwise.
 */

// Sprint 20: restored from / saved to the embedded data file in persistent mode.
const memoryActionItems = persistentMap<ActionItem>('actionItems');

/** Statuses that no longer need anyone's attention. */
export const CLOSED_ACTION_ITEM_STATUSES: ActionItemStatus[] = ['Completed', 'Cancelled'];

export interface ActionItemFilter {
  projectIds?: string[];
  projectId?: string;
  meetingId?: string;
  ownerId?: string;
  status?: string;
  priority?: string;
  /** Past due and not closed. */
  overdue?: boolean;
  search?: string;
}

function mapRow(r: any): ActionItem {
  return {
    id: r.id,
    projectId: r.project_id,
    meetingId: toOptional(r.meeting_id),
    title: r.title,
    description: toOptional(r.description),
    ownerId: r.owner_id,
    dueDate: toDateOnly(r.due_date),
    status: r.status as ActionItemStatus,
    priority: r.priority as ActionItemPriority,
    completedAt: toOptionalIso(r.completed_at),
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

function applyFilter(items: ActionItem[], filter?: ActionItemFilter): ActionItem[] {
  if (!filter) return items;
  const scope = filter.projectIds ? new Set(filter.projectIds) : null;
  const today = new Date().toISOString().slice(0, 10);
  return items.filter((a) => {
    if (scope && !scope.has(a.projectId)) return false;
    if (filter.projectId && a.projectId !== filter.projectId) return false;
    if (filter.meetingId && a.meetingId !== filter.meetingId) return false;
    if (filter.ownerId && a.ownerId !== filter.ownerId) return false;
    if (!matchesValue(filter.status, a.status)) return false;
    if (!matchesValue(filter.priority, a.priority)) return false;
    if (filter.overdue && !(a.dueDate && a.dueDate < today && !CLOSED_ACTION_ITEM_STATUSES.includes(a.status))) return false;
    return matchesSearch(filter.search, [a.title, a.description]);
  });
}

const byDue = byDueThenCreated<ActionItem>((a) => a.dueDate);

const COLUMNS = `id, project_id, meeting_id, title, description, owner_id, due_date, status, priority,
  completed_at, created_by, updated_by, created_at, updated_at`;

export const ActionItemRepository = {
  async findAll(filter?: ActionItemFilter): Promise<ActionItem[]> {
    if (filter?.projectIds && filter.projectIds.length === 0) return [];
    if (isDbConnected()) {
      const res = filter?.projectIds
        ? await query(`SELECT * FROM action_items WHERE project_id = ANY($1::text[])`, [filter.projectIds])
        : await query(`SELECT * FROM action_items`);
      return applyFilter(res.rows.map(mapRow), filter).sort(byDue);
    }
    return applyFilter(Array.from(memoryActionItems.values()), filter).sort(byDue);
  },

  async findById(id: string): Promise<ActionItem | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM action_items WHERE id = $1', [id]);
      // Sprint 24: PostgreSQL is the source of truth; memory is never consulted in PG mode.
      return res.rows.length > 0 ? mapRow(res.rows[0]) : null;
    }
    return memoryActionItems.get(id) || null;
  },

  async create(data: Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<ActionItem> {
    const now = new Date().toISOString();
    const item: ActionItem = { ...data, id: newId('aitem'), createdAt: now, updatedAt: now };
    if (isDbConnected()) {
      await query(
        `INSERT INTO action_items (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          item.id, item.projectId, item.meetingId || null, item.title, item.description || null, item.ownerId || null,
          item.dueDate || null, item.status, item.priority, item.completedAt || null, item.createdBy || null,
          item.updatedBy || null, item.createdAt, item.updatedAt,
        ]
      );
    }
    memoryActionItems.set(item.id, item);
    return item;
  },

  async update(id: string, updates: Partial<ActionItem>): Promise<ActionItem | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const updated: ActionItem = {
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
        `UPDATE action_items SET meeting_id = $1, title = $2, description = $3, owner_id = $4, due_date = $5,
           status = $6, priority = $7, completed_at = $8, updated_by = $9, updated_at = $10
         WHERE id = $11`,
        [
          updated.meetingId || null, updated.title, updated.description || null, updated.ownerId || null,
          updated.dueDate || null, updated.status, updated.priority, updated.completedAt || null,
          updated.updatedBy || null, updated.updatedAt, id,
        ]
      );
    }
    memoryActionItems.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const existedInMemory = memoryActionItems.delete(id);
    if (isDbConnected()) {
      const res = await query('DELETE FROM action_items WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    }
    return existedInMemory;
  },

  /**
   * A deleted meeting leaves its action items in place, unlinked — the same
   * effect as the meeting_id ON DELETE SET NULL foreign key, applied to the
   * memory store too.
   */
  async detachMeeting(meetingId: string): Promise<number> {
    let detached = 0;
    for (const [id, item] of memoryActionItems) {
      if (item.meetingId === meetingId) {
        memoryActionItems.set(id, { ...item, meetingId: undefined, updatedAt: new Date().toISOString() });
        detached += 1;
      }
    }
    if (isDbConnected()) {
      const res = await query('UPDATE action_items SET meeting_id = NULL, updated_at = NOW() WHERE meeting_id = $1', [meetingId]);
      detached = res.rowCount ?? detached;
    }
    return detached;
  },
};
