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

/**
 * Sprint 9.6B — durable code generation.
 *
 * Codes are RM-### and must never be re-issued, survive a restart and stay
 * unique under concurrent creates. Memory mode uses an in-process monotonic
 * counter; PostgreSQL mode uses the roadmap_code_seq sequence, which is atomic
 * across connections and processes. Neither depends on the size of the map,
 * which is what made the previous scheme collide after every restart.
 */

/** Public code shape. Anything else is stored as supplied but ignored here. */
export const ROADMAP_CODE_PATTERN = /^RM-(\d+)$/;

/**
 * Highest valid suffix + 1, or 101 when no code matches. Pure, so it is unit
 * testable and shared by the memory counter and the sequence synchronisation.
 */
export function nextCodeNumber(codes: Iterable<string | null | undefined>): number {
  let highest: number | null = null;
  for (const code of codes) {
    const match = typeof code === 'string' ? ROADMAP_CODE_PATTERN.exec(code) : null;
    if (match) highest = Math.max(highest ?? 0, Number(match[1]));
  }
  // 101 is the series start used by the seeds; with any valid code present the
  // answer is strictly "highest + 1", however low that is. The PostgreSQL
  // sequence is never lowered, so a small result cannot pull it backwards.
  return highest === null ? 101 : highest + 1;
}

/** Memory-mode counter; null until first use so seeds are counted lazily. */
let memoryCodeCounter: number | null = null;

function currentMemoryCounter(): number {
  if (memoryCodeCounter === null) {
    memoryCodeCounter = nextCodeNumber(Array.from(memoryRoadmapItems.values()).map((i) => i.code));
  }
  return memoryCodeCounter;
}

/** Reads and advances the counter in one synchronous step — no await between. */
function issueMemoryCode(): string {
  const n = currentMemoryCounter();
  memoryCodeCounter = n + 1;
  return `RM-${n}`;
}

/** An explicit valid code moves the generator past it; malformed ones do not. */
function noteExplicitCode(code: string): void {
  const match = ROADMAP_CODE_PATTERN.exec(code);
  if (match) memoryCodeCounter = Math.max(currentMemoryCounter(), Number(match[1]) + 1);
}

function memoryHasCode(code: string): boolean {
  for (const item of memoryRoadmapItems.values()) if (item.code === code) return true;
  return false;
}

/** Bounded retries for a generated code that loses a race on UNIQUE(code). */
const MAX_CODE_ATTEMPTS = 5;
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Before each generated code, make sure the sequence will hand out a value
 * above every valid code already stored — databases populated before 9.6B,
 * rows given explicit codes, or rows inserted outside this repository would
 * otherwise collide. Reads PostgreSQL only, never memory. Two small queries per
 * create is an acceptable price for a low-volume strategic entity; any race
 * that slips through is still caught by the unique-violation retry.
 */
async function syncCodeSequence(): Promise<void> {
  const existing = await query('SELECT code FROM roadmap_items');
  const wantedNext = nextCodeNumber(existing.rows.map((r) => r.code));

  const state = await query('SELECT last_value, is_called FROM roadmap_code_seq');
  const lastValue = Number(state.rows[0].last_value);
  const currentNext = state.rows[0].is_called ? lastValue + 1 : lastValue;

  // Only ever raise the sequence; setval(v, true) makes the next value v + 1.
  if (wantedNext > currentNext) {
    await query('SELECT setval($1, $2::bigint, true)', ['roadmap_code_seq', wantedNext - 1]);
  }
}

async function nextSequenceCode(): Promise<string> {
  const res = await query("SELECT nextval('roadmap_code_seq') AS n");
  return `RM-${Number(res.rows[0].n)}`;
}

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

/**
 * pg returns DATE columns as local-midnight Date objects and TIMESTAMPTZ as
 * Date objects; the RoadmapItem contract is strings (YYYY-MM-DD and ISO).
 * Strings already in that shape pass through untouched. DATE values use local
 * calendar components because that is how pg constructs them — formatting via
 * toISOString would shift the day in any timezone east of UTC.
 */
function toDateOnly(value: unknown): string | undefined {
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

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value as string;
}

function mapRow(r: any): RoadmapItem {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    status: r.status,
    priority: r.priority,
    startDate: toDateOnly(r.start_date),
    targetDate: toDateOnly(r.target_date),
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    productId: r.product_id,
    productName: r.product_name,
    portfolioId: r.portfolio_id,
    portfolioName: r.portfolio_name,
    projectId: r.project_id,
    projectName: r.project_name,
    sequence: Number(r.sequence ?? 0),
    createdAt: toIsoString(r.created_at),
    updatedAt: toIsoString(r.updated_at),
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

  /** Next sequence value, placing new items at the end of the list. */
  async nextSequence(): Promise<number> {
    const items = await this.findAll();
    if (items.length === 0) return SEQUENCE_STEP;
    return Math.max(...items.map((i) => i.sequence)) + SEQUENCE_STEP;
  },

  async create(data: Partial<RoadmapItem>): Promise<RoadmapItem> {
    seedDefaultRoadmapItems();

    const id = data.id || `rm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const explicitCode = typeof data.code === 'string' && data.code.trim() !== '' ? data.code : undefined;

    // An explicit code that already exists is rejected up front in both modes;
    // PostgreSQL's UNIQUE(code) is the backstop for anything memory cannot see.
    if (explicitCode && memoryHasCode(explicitCode)) {
      throw new Error(`Roadmap code "${explicitCode}" already exists.`);
    }

    const sequence = typeof data.sequence === 'number' ? data.sequence : await this.nextSequence();

    const build = (code: string): RoadmapItem => {
      const now = new Date().toISOString();
      return {
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
        sequence,
        createdAt: now,
        updatedAt: now,
        createdBy: data.createdBy || 'system',
        updatedBy: data.updatedBy || 'system',
      };
    };

    if (isDbConnected()) {
      // Persist first; the memory mirror is written only after PostgreSQL has
      // accepted the row, so a retry or a failure never leaves a phantom entry.
      if (!explicitCode) await syncCodeSequence();

      for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
        const item = build(explicitCode ?? (await nextSequenceCode()));
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
          memoryRoadmapItems.set(id, item);
          if (explicitCode) noteExplicitCode(explicitCode);
          return item;
        } catch (err: any) {
          const isUniqueViolation = err?.code === PG_UNIQUE_VIOLATION;
          // pg names the violated constraint; anything other than the code
          // index (for example a duplicate id) is not something a new code fixes.
          const onCode = !err?.constraint || /code/i.test(String(err.constraint));
          if (isUniqueViolation && onCode && explicitCode) {
            throw new Error(`Roadmap code "${explicitCode}" already exists.`);
          }
          if (isUniqueViolation && onCode && attempt < MAX_CODE_ATTEMPTS) {
            console.warn(`Roadmap code ${item.code} lost a uniqueness race; retrying (${attempt}/${MAX_CODE_ATTEMPTS}).`);
            continue;
          }
          // A failed PostgreSQL write is reported, never disguised as success.
          throw err;
        }
      }
      throw new Error(`Could not allocate a unique roadmap code after ${MAX_CODE_ATTEMPTS} attempts.`);
    }

    // Memory mode: the code is taken and the counter advanced synchronously,
    // so interleaved creates cannot observe the same value.
    const code = explicitCode ?? issueMemoryCode();
    if (explicitCode) noteExplicitCode(explicitCode);
    const item = build(code);
    memoryRoadmapItems.set(id, item);
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

    const existedInMemory = memoryRoadmapItems.delete(id);

    if (isDbConnected()) {
      try {
        // PostgreSQL is authoritative here: a persisted row need not be in the
        // memory map (for example after a restart), so the answer comes from
        // rowCount rather than from the cache.
        const res = await query('DELETE FROM roadmap_items WHERE id = $1', [id]);
        return (res.rowCount ?? 0) > 0;
      } catch (err: any) {
        console.warn('DB error in RoadmapRepository.delete, using memory result:', err.message);
      }
    }

    return existedInMemory;
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
      const updatedAt = new Date().toISOString();

      if (isDbConnected()) {
        try {
          // Persisted rows are updated directly; they need not be in memory.
          const res = await query('UPDATE roadmap_items SET sequence = $1, updated_at = $2 WHERE id = $3', [
            entry.sequence,
            updatedAt,
            entry.id,
          ]);
          if ((res.rowCount ?? 0) > 0) {
            applied += 1;
            // Keep the cache in step when it happens to hold the row.
            const cached = memoryRoadmapItems.get(entry.id);
            if (cached) memoryRoadmapItems.set(entry.id, { ...cached, sequence: entry.sequence, updatedAt });
          }
          continue;
        } catch (err: any) {
          console.warn('DB error in RoadmapRepository.reorder, using memory:', err.message);
        }
      }

      const existing = memoryRoadmapItems.get(entry.id);
      if (!existing) continue;

      memoryRoadmapItems.set(entry.id, { ...existing, sequence: entry.sequence, updatedAt });
      applied += 1;
    }

    return applied;
  },
};
