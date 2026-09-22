import { RoadmapItem } from '../models/types';
import { isDbConnected, query } from '../config/database';

/**
 * Sprint 9.2 — roadmap persistence.
 *
 * Follows the established repository shape: a PostgreSQL branch guarded by
 * isDbConnected() with an in-memory fallback store seeded for local use.
 *
 * Ordering reuses the backlog convention — an ascending integer with createdAt
 * as the tiebreak — rather than introducing a new sorting mechanism.
 */

const memoryRoadmapItems: Map<string, RoadmapItem> = new Map();

const SEQUENCE_STEP = 10;

function seedDefaultRoadmapItems() {
  if (memoryRoadmapItems.size > 0) return;
  const now = new Date().toISOString();
  const defaults: RoadmapItem[] = [
    {
      id: 'rm_1',
      code: 'RM-101',
      name: 'Autonomous Landing Certification',
      description: 'Achieve regulatory certification for autonomous descent and landing control.',
      status: 'committed',
      priority: 'critical',
      startDate: '2026-01-15',
      targetDate: '2026-10-31',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      sequence: 10,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      updatedBy: 'system',
    },
    {
      id: 'rm_2',
      code: 'RM-102',
      name: 'Deep Space Relay Expansion',
      description: 'Extend ground relay coverage to support sustained deep-space telemetry.',
      status: 'in-progress',
      priority: 'high',
      startDate: '2026-02-01',
      targetDate: '2026-11-15',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      projectId: 'PRJ-102',
      projectName: 'Titan Cryogenic Propulsion Telemetry',
      sequence: 20,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      updatedBy: 'system',
    },
    {
      // Deliberately unchartered: exercises the "no linked project" path, where
      // derived progress is unavailable rather than zero.
      id: 'rm_3',
      code: 'RM-103',
      name: 'Crew Habitat Life Support Roadmap',
      description: 'Exploratory initiative; not yet chartered as a project.',
      status: 'proposed',
      priority: 'medium',
      targetDate: '2027-03-31',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      sequence: 30,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      updatedBy: 'system',
    },
  ];
  defaults.forEach((item) => memoryRoadmapItems.set(item.id, item));
}

seedDefaultRoadmapItems();

function mapRow(r: any): RoadmapItem {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    status: r.status,
    priority: r.priority,
    startDate: r.start_date,
    targetDate: r.target_date,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    productId: r.product_id,
    productName: r.product_name,
    portfolioId: r.portfolio_id,
    portfolioName: r.portfolio_name,
    projectId: r.project_id,
    projectName: r.project_name,
    sequence: Number(r.sequence ?? 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
  };
}

export interface RoadmapFilter {
  productId?: string;
  portfolioId?: string;
  projectId?: string;
  ownerId?: string;
  status?: string;
  priority?: string;
  search?: string;
}

/** Ascending sequence, with createdAt as a stable tiebreak. */
function bySequence(a: RoadmapItem, b: RoadmapItem): number {
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  return a.createdAt.localeCompare(b.createdAt);
}

function applyFilter(items: RoadmapItem[], filter?: RoadmapFilter): RoadmapItem[] {
  if (!filter) return items;
  let result = items;

  if (filter.productId) result = result.filter((i) => i.productId === filter.productId);
  if (filter.portfolioId) result = result.filter((i) => i.portfolioId === filter.portfolioId);
  if (filter.projectId) result = result.filter((i) => i.projectId === filter.projectId);
  if (filter.ownerId) result = result.filter((i) => i.ownerId === filter.ownerId);
  if (filter.status && filter.status !== 'all') {
    result = result.filter((i) => i.status.toLowerCase() === filter.status!.toLowerCase());
  }
  if (filter.priority && filter.priority !== 'all') {
    result = result.filter((i) => i.priority.toLowerCase() === filter.priority!.toLowerCase());
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
    );
  }
  return result;
}

export const RoadmapRepository = {
  async findAll(filter?: RoadmapFilter): Promise<RoadmapItem[]> {
    seedDefaultRoadmapItems();

    if (isDbConnected()) {
      try {
        const res = await query('SELECT * FROM roadmap_items ORDER BY sequence ASC, created_at ASC');
        return applyFilter(res.rows.map(mapRow), filter);
      } catch (err: any) {
        console.warn('DB error in RoadmapRepository.findAll, falling back to memory:', err.message);
      }
    }

    return applyFilter(Array.from(memoryRoadmapItems.values()), filter).sort(bySequence);
  },

  async findById(id: string): Promise<RoadmapItem | null> {
    seedDefaultRoadmapItems();

    if (isDbConnected()) {
      try {
        const res = await query('SELECT * FROM roadmap_items WHERE id = $1', [id]);
        if (res.rows.length > 0) return mapRow(res.rows[0]);
      } catch (err: any) {
        console.warn('DB error in RoadmapRepository.findById, falling back to memory:', err.message);
      }
    }

    return memoryRoadmapItems.get(id) || null;
  },

  async count(filter?: RoadmapFilter): Promise<number> {
    return (await this.findAll(filter)).length;
  },

  /** Next sequence value, placing new items at the end of the list. */
  async nextSequence(): Promise<number> {
    const items = await this.findAll();
    if (items.length === 0) return SEQUENCE_STEP;
    return Math.max(...items.map((i) => i.sequence)) + SEQUENCE_STEP;
  },

  async create(data: Partial<RoadmapItem>): Promise<RoadmapItem> {
    seedDefaultRoadmapItems();

    const id = data.id || `rm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const code = data.code || `RM-${memoryRoadmapItems.size + 101}`;
    const now = new Date().toISOString();

    const item: RoadmapItem = {
      id,
      code,
      name: data.name || 'Untitled Initiative',
      description: data.description,
      status: data.status || 'proposed',
      priority: data.priority || 'medium',
      startDate: data.startDate,
      targetDate: data.targetDate,
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      productId: data.productId,
      productName: data.productName,
      portfolioId: data.portfolioId,
      portfolioName: data.portfolioName,
      projectId: data.projectId,
      projectName: data.projectName,
      sequence: typeof data.sequence === 'number' ? data.sequence : await this.nextSequence(),
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy || 'system',
      updatedBy: data.updatedBy || 'system',
    };

    memoryRoadmapItems.set(id, item);

    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO roadmap_items (
            id, code, name, description, status, priority, start_date, target_date,
            owner_id, owner_name, product_id, product_name, portfolio_id, portfolio_name,
            project_id, project_name, sequence, created_by, updated_by, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            item.id, item.code, item.name, item.description || null, item.status, item.priority,
            item.startDate || null, item.targetDate || null, item.ownerId || null, item.ownerName || null,
            item.productId || null, item.productName || null, item.portfolioId || null, item.portfolioName || null,
            item.projectId || null, item.projectName || null, item.sequence,
            item.createdBy || null, item.updatedBy || null, item.createdAt, item.updatedAt,
          ]
        );
      } catch (err: any) {
        console.warn('DB error in RoadmapRepository.create, memory store retains the record:', err.message);
      }
    }

    return item;
  },

  async update(id: string, updates: Partial<RoadmapItem>): Promise<RoadmapItem | null> {
    seedDefaultRoadmapItems();

    const existing = memoryRoadmapItems.get(id) || (await this.findById(id));
    if (!existing) return null;

    const updated: RoadmapItem = {
      ...existing,
      ...updates,
      id: existing.id,
      code: existing.code,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    memoryRoadmapItems.set(id, updated);

    if (isDbConnected()) {
      try {
        await query(
          `UPDATE roadmap_items SET
            name = $1, description = $2, status = $3, priority = $4, start_date = $5,
            target_date = $6, owner_id = $7, owner_name = $8, product_id = $9, product_name = $10,
            portfolio_id = $11, portfolio_name = $12, project_id = $13, project_name = $14,
            sequence = $15, updated_by = $16, updated_at = $17
           WHERE id = $18`,
          [
            updated.name, updated.description || null, updated.status, updated.priority,
            updated.startDate || null, updated.targetDate || null, updated.ownerId || null,
            updated.ownerName || null, updated.productId || null, updated.productName || null,
            updated.portfolioId || null, updated.portfolioName || null, updated.projectId || null,
            updated.projectName || null, updated.sequence, updated.updatedBy || null,
            updated.updatedAt, id,
          ]
        );
      } catch (err: any) {
        console.warn('DB error in RoadmapRepository.update, memory store retains the record:', err.message);
      }
    }

    return updated;
  },

  async delete(id: string): Promise<boolean> {
    seedDefaultRoadmapItems();

    const existed = memoryRoadmapItems.delete(id);

    if (isDbConnected()) {
      try {
        await query('DELETE FROM roadmap_items WHERE id = $1', [id]);
      } catch (err: any) {
        console.warn('DB error in RoadmapRepository.delete:', err.message);
      }
    }

    return existed;
  },

  /**
   * Bulk reorder, mirroring BacklogRepository.reorder. Unknown ids are skipped
   * rather than failing the batch, so a stale client list cannot block a
   * legitimate reorder of the remaining items.
   */
  async reorder(entries: Array<{ id: string; sequence: number }>): Promise<number> {
    seedDefaultRoadmapItems();
    let applied = 0;

    for (const entry of entries) {
      const existing = memoryRoadmapItems.get(entry.id);
      if (!existing) continue;

      const updated: RoadmapItem = {
        ...existing,
        sequence: entry.sequence,
        updatedAt: new Date().toISOString(),
      };
      memoryRoadmapItems.set(entry.id, updated);
      applied += 1;

      if (isDbConnected()) {
        try {
          await query('UPDATE roadmap_items SET sequence = $1, updated_at = $2 WHERE id = $3', [
            entry.sequence,
            updated.updatedAt,
            entry.id,
          ]);
        } catch (err: any) {
          console.warn('DB error in RoadmapRepository.reorder:', err.message);
        }
      }
    }

    return applied;
  },
};
