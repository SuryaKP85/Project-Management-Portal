import { Sprint, SprintStatus } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memorySprints: Map<string, Sprint> = new Map();

function seedDefaultSprints() {
  if (memorySprints.size > 0) return;
  const defaults: Sprint[] = [
    {
      id: 'sprint_3',
      code: 'SPR-023',
      name: 'Sprint 23 — RTOS Kernel & Avionics Drivers',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      goal: 'Baseline RTOS task scheduler and sensor interface drivers with zero dropouts.',
      startDate: '2026-08-16',
      endDate: '2026-08-31',
      status: 'completed',
      capacityHours: 160,
      capacityPoints: 35,
      committedPoints: 35,
      completedPoints: 35,
      committedHours: 152,
      completedHours: 152,
      remainingPoints: 0,
      remainingHours: 0,
      createdAt: '2026-08-10T08:00:00Z',
      updatedAt: '2026-08-31T18:00:00Z',
    },
    {
      id: 'sprint_1',
      code: 'SPR-024',
      name: 'Sprint 24 — Orbital Guidance Core',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      goal: 'Validate automated trajectory drift correction thruster loops and high-speed telemetry bus.',
      startDate: '2026-09-01',
      endDate: '2026-09-18',
      status: 'active',
      capacityHours: 160,
      capacityPoints: 40,
      committedPoints: 33,
      completedPoints: 12,
      committedHours: 148,
      completedHours: 48,
      remainingPoints: 21,
      remainingHours: 100,
      createdAt: '2026-08-25T08:00:00Z',
      updatedAt: '2026-09-06T12:00:00Z',
    },
    {
      id: 'sprint_2',
      code: 'SPR-025',
      name: 'Sprint 25 — Thruster Calibration & Redundancy',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      goal: 'PWM thruster profile tuning and hot-standby secondary flight computer failover.',
      startDate: '2026-09-19',
      endDate: '2026-10-02',
      status: 'planning',
      capacityHours: 160,
      capacityPoints: 45,
      committedPoints: 18,
      completedPoints: 0,
      committedHours: 72,
      completedHours: 0,
      remainingPoints: 18,
      remainingHours: 72,
      createdAt: '2026-09-01T08:00:00Z',
      updatedAt: '2026-09-05T14:00:00Z',
    },
    {
      id: 'sprint_4',
      code: 'SPR-018',
      name: 'Sprint 18 — Cryo Manifold Telemetry',
      projectId: 'PRJ-102',
      projectName: 'Titan Cryogenic Propulsion Telemetry',
      goal: 'Pressure relief valve telemetry feedback loops and threshold alerts.',
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      status: 'active',
      capacityHours: 120,
      capacityPoints: 30,
      committedPoints: 24,
      completedPoints: 10,
      committedHours: 96,
      completedHours: 35,
      remainingPoints: 14,
      remainingHours: 61,
      createdAt: '2026-08-28T09:00:00Z',
      updatedAt: '2026-09-06T11:00:00Z',
    },
  ];
  defaults.forEach((s) => memorySprints.set(s.id, s));
}

seedDefaultSprints();

export const SprintRepository = {
  async findAll(filter?: { projectId?: string; status?: string }): Promise<Sprint[]> {
    if (isDbConnected()) {
      let q = 'SELECT * FROM sprints WHERE 1=1';
      const params: any[] = [];
      let idx = 1;
      if (filter?.projectId) {
        q += ` AND project_id = $${idx++}`;
        params.push(filter.projectId);
      }
      if (filter?.status) {
        q += ` AND status = $${idx++}`;
        params.push(filter.status);
      }
      q += ' ORDER BY start_date DESC';
      const res = await query(q, params);
      return res.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        projectId: r.project_id,
        goal: r.goal,
        startDate: r.start_date,
        endDate: r.end_date,
        status: r.status,
        capacityHours: Number(r.capacity_hours),
        capacityPoints: Number(r.capacity_points),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    let list = Array.from(memorySprints.values());
    if (filter?.projectId) {
      list = list.filter((s) => s.projectId === filter.projectId);
    }
    if (filter?.status) {
      list = list.filter((s) => s.status === filter.status);
    }
    return list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  },

  async findById(id: string): Promise<Sprint | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM sprints WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        projectId: r.project_id,
        goal: r.goal,
        startDate: r.start_date,
        endDate: r.end_date,
        status: r.status,
        capacityHours: Number(r.capacity_hours),
        capacityPoints: Number(r.capacity_points),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memorySprints.get(id) || null;
  },

  async findActiveByProject(projectId: string): Promise<Sprint | null> {
    const sprints = await this.findAll({ projectId, status: 'active' });
    return sprints[0] || null;
  },

  async create(data: Omit<Sprint, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Sprint> {
    // Validate dates
    if (new Date(data.endDate) < new Date(data.startDate)) {
      throw new Error('Sprint end date cannot be earlier than start date');
    }

    // Only one active sprint per project
    if (data.status === 'active') {
      const existingActive = await this.findActiveByProject(data.projectId);
      if (existingActive) {
        throw new Error(`Project already has an active sprint (${existingActive.name}). Only one active sprint is allowed at a time.`);
      }
    }

    const id = data.id || `sprint_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const code = data.code || `SPR-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();

    const sprint: Sprint = {
      ...data,
      id,
      code,
      capacityHours: Number(data.capacityHours || 160),
      capacityPoints: Number(data.capacityPoints || 40),
      createdAt: now,
      updatedAt: now,
    };

    if (isDbConnected()) {
      await query(
        `INSERT INTO sprints (id, code, name, project_id, goal, start_date, end_date, status, capacity_hours, capacity_points, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          sprint.id,
          sprint.code,
          sprint.name,
          sprint.projectId,
          sprint.goal || null,
          sprint.startDate,
          sprint.endDate,
          sprint.status,
          sprint.capacityHours,
          sprint.capacityPoints,
          sprint.createdAt,
          sprint.updatedAt,
        ]
      );
    }

    memorySprints.set(id, sprint);
    return sprint;
  },

  async update(id: string, updates: Partial<Sprint>): Promise<Sprint | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    // Validate dates if updated
    const newStart = updates.startDate || existing.startDate;
    const newEnd = updates.endDate || existing.endDate;
    if (new Date(newEnd) < new Date(newStart)) {
      throw new Error('Sprint end date cannot be earlier than start date');
    }

    // Validate single active sprint if transitioning to active
    if (updates.status === 'active' && existing.status !== 'active') {
      const activeSprint = await this.findActiveByProject(existing.projectId);
      if (activeSprint && activeSprint.id !== id) {
        throw new Error(`Project already has an active sprint (${activeSprint.name}). Only one active sprint is allowed.`);
      }
    }

    const updated: Sprint = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (isDbConnected()) {
      await query(
        `UPDATE sprints SET name = $1, goal = $2, start_date = $3, end_date = $4, status = $5,
         capacity_hours = $6, capacity_points = $7, updated_at = $8 WHERE id = $9`,
        [
          updated.name,
          updated.goal || null,
          updated.startDate,
          updated.endDate,
          updated.status,
          updated.capacityHours,
          updated.capacityPoints,
          updated.updatedAt,
          id,
        ]
      );
    }

    memorySprints.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      const res = await query('DELETE FROM sprints WHERE id = $1', [id]);
      memorySprints.delete(id);
      return (res.rowCount ?? 0) > 0;
    }
    return memorySprints.delete(id);
  },
};
