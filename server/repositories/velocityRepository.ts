import { VelocityRecord } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryVelocity: Map<string, VelocityRecord> = new Map();

function seedDefaultVelocity() {
  if (memoryVelocity.size > 0) return;
  const defaults: VelocityRecord[] = [
    {
      sprintId: 'sprint_hist_21',
      sprintName: 'Sprint 21 — Real-time Bus Protocol',
      projectId: 'PRJ-101',
      startDate: '2026-07-16',
      endDate: '2026-07-31',
      completedDate: '2026-07-31T18:00:00Z',
      committedPoints: 32,
      completedPoints: 28,
      committedHours: 140,
      completedHours: 130,
    },
    {
      sprintId: 'sprint_hist_22',
      sprintName: 'Sprint 22 — Flight Logic State Machine',
      projectId: 'PRJ-101',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
      completedDate: '2026-08-15T18:00:00Z',
      committedPoints: 36,
      completedPoints: 34,
      committedHours: 155,
      completedHours: 148,
    },
    {
      sprintId: 'sprint_3',
      sprintName: 'Sprint 23 — RTOS Kernel & Avionics Drivers',
      projectId: 'PRJ-101',
      startDate: '2026-08-16',
      endDate: '2026-08-31',
      completedDate: '2026-08-31T18:00:00Z',
      committedPoints: 35,
      completedPoints: 35,
      committedHours: 152,
      completedHours: 152,
    },
  ];
  defaults.forEach((v) => memoryVelocity.set(v.sprintId, v));
}

seedDefaultVelocity();

export const VelocityRepository = {
  async findAll(projectId?: string): Promise<VelocityRecord[]> {
    if (isDbConnected()) {
      let q = 'SELECT * FROM velocity_records';
      const params: any[] = [];
      if (projectId) {
        q += ' WHERE project_id = $1';
        params.push(projectId);
      }
      q += ' ORDER BY completed_date ASC';
      const res = await query(q, params);
      return res.rows.map((r) => ({
        sprintId: r.sprint_id,
        sprintName: r.sprint_name,
        projectId: r.project_id,
        startDate: r.start_date,
        endDate: r.end_date,
        completedDate: r.completed_date,
        committedPoints: Number(r.committed_points),
        completedPoints: Number(r.completed_points),
        committedHours: Number(r.committed_hours),
        completedHours: Number(r.completed_hours),
      }));
    }

    let list = Array.from(memoryVelocity.values());
    if (projectId) {
      list = list.filter((v) => v.projectId === projectId);
    }
    return list.sort((a, b) => new Date(a.completedDate).getTime() - new Date(b.completedDate).getTime());
  },

  async findByProject(projectId?: string): Promise<VelocityRecord[]> {
    return this.findAll(projectId);
  },

  async record(record: VelocityRecord): Promise<VelocityRecord> {
    if (isDbConnected()) {
      const id = `vel_${Date.now()}`;
      await query(
        `INSERT INTO velocity_records (id, sprint_id, sprint_name, project_id, start_date, end_date, completed_date, committed_points, completed_points, committed_hours, completed_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          record.sprintId,
          record.sprintName,
          record.projectId,
          record.startDate,
          record.endDate,
          record.completedDate,
          record.committedPoints,
          record.completedPoints,
          record.committedHours,
          record.completedHours,
        ]
      );
    }
    memoryVelocity.set(record.sprintId, record);
    return record;
  },

  async getAverageVelocity(projectId: string): Promise<{
    averagePoints: number;
    averageHours: number;
    sprintCount: number;
    latestVelocityPoints: number;
  }> {
    const list = await this.findAll(projectId);
    if (list.length === 0) {
      return { averagePoints: 0, averageHours: 0, sprintCount: 0, latestVelocityPoints: 0 };
    }
    const totalPoints = list.reduce((acc, v) => acc + v.completedPoints, 0);
    const totalHours = list.reduce((acc, v) => acc + v.completedHours, 0);
    const latest = list[list.length - 1];

    return {
      averagePoints: Math.round((totalPoints / list.length) * 10) / 10,
      averageHours: Math.round((totalHours / list.length) * 10) / 10,
      sprintCount: list.length,
      latestVelocityPoints: latest.completedPoints,
    };
  },
};
