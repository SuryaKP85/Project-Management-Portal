import { Goal } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryGoals: Map<string, Goal> = new Map();

function seedDefaultGoals() {
  if (memoryGoals.size > 0) return;
  const defaults: Goal[] = [
    {
      id: 'goal_1',
      objective: 'Achieve 99.999% Flight Control Firmware Reliability',
      description: 'Zero hard crashes during full-duration static fire and simulated orbital insertion runs.',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      status: 'in-progress',
      targetValue: 100,
      currentValue: 85,
      progress: 85,
      unit: '%',
      dueDate: '2026-11-30',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'goal_2',
      objective: 'Reduce Telemetry Latency Under 20ms Across Ground Relays',
      description: 'Optimize deep-space communications packet multiplexing pipeline.',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      status: 'in-progress',
      targetValue: 20,
      currentValue: 28,
      progress: 60,
      unit: 'ms',
      dueDate: '2026-10-15',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      productId: 'prod_2',
      productName: 'Helios Deep Space Telemetry Suite',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  defaults.forEach((g) => memoryGoals.set(g.id, g));
}

seedDefaultGoals();

export const GoalRepository = {
  async findAll(): Promise<Goal[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM goals ORDER BY created_at DESC');
      return res.rows.map((r) => ({
        id: r.id,
        objective: r.objective,
        description: r.description,
        ownerId: r.owner_id,
        status: r.status,
        targetValue: Number(r.target_value),
        currentValue: Number(r.current_value),
        progress: Number(r.progress),
        unit: r.unit,
        dueDate: r.due_date,
        portfolioId: r.portfolio_id,
        productId: r.product_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }
    return Array.from(memoryGoals.values());
  },

  async findById(id: string): Promise<Goal | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM goals WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        objective: r.objective,
        description: r.description,
        ownerId: r.owner_id,
        status: r.status,
        targetValue: Number(r.target_value),
        currentValue: Number(r.current_value),
        progress: Number(r.progress),
        unit: r.unit,
        dueDate: r.due_date,
        portfolioId: r.portfolio_id,
        productId: r.product_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memoryGoals.get(id) || null;
  },

  async create(goalData: Partial<Goal>): Promise<Goal> {
    const id = goalData.id || `goal_${Date.now()}`;
    const now = new Date().toISOString();
    const progress = goalData.progress !== undefined
      ? goalData.progress
      : goalData.targetValue && goalData.targetValue > 0
        ? Math.min(100, Math.round(((goalData.currentValue || 0) / goalData.targetValue) * 100))
        : 0;

    const newGoal: Goal = {
      id,
      objective: goalData.objective || 'Untitled Objective',
      description: goalData.description || '',
      ownerId: goalData.ownerId || 'usr_admin_1',
      ownerName: goalData.ownerName || 'Surya Prashanth',
      status: goalData.status || 'not-started',
      targetValue: goalData.targetValue !== undefined ? Number(goalData.targetValue) : 100,
      currentValue: goalData.currentValue !== undefined ? Number(goalData.currentValue) : 0,
      progress,
      unit: goalData.unit || '%',
      dueDate: goalData.dueDate,
      portfolioId: goalData.portfolioId,
      portfolioName: goalData.portfolioName,
      productId: goalData.productId,
      productName: goalData.productName,
      createdAt: now,
      updatedAt: now,
    };

    if (isDbConnected()) {
      await query(
        `INSERT INTO goals (id, objective, description, owner_id, status, target_value, current_value, progress, unit, due_date, portfolio_id, product_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          newGoal.id,
          newGoal.objective,
          newGoal.description,
          newGoal.ownerId,
          newGoal.status,
          newGoal.targetValue,
          newGoal.currentValue,
          newGoal.progress,
          newGoal.unit,
          newGoal.dueDate,
          newGoal.portfolioId,
          newGoal.productId,
          newGoal.createdAt,
          newGoal.updatedAt,
        ]
      );
    }

    memoryGoals.set(id, newGoal);
    return newGoal;
  },

  async update(id: string, updates: Partial<Goal>): Promise<Goal | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    let progress = updates.progress;
    if (progress === undefined && (updates.currentValue !== undefined || updates.targetValue !== undefined)) {
      const cur = updates.currentValue !== undefined ? updates.currentValue : existing.currentValue;
      const tgt = updates.targetValue !== undefined ? updates.targetValue : existing.targetValue;
      progress = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : existing.progress;
    }

    const updated: Goal = {
      ...existing,
      ...updates,
      progress: progress !== undefined ? progress : existing.progress,
      updatedAt: new Date().toISOString(),
    };

    if (isDbConnected()) {
      await query(
        `UPDATE goals SET objective = $1, description = $2, status = $3, target_value = $4, current_value = $5, progress = $6, unit = $7, due_date = $8, portfolio_id = $9, product_id = $10, updated_at = $11
         WHERE id = $12`,
        [
          updated.objective,
          updated.description,
          updated.status,
          updated.targetValue,
          updated.currentValue,
          updated.progress,
          updated.unit,
          updated.dueDate,
          updated.portfolioId,
          updated.productId,
          updated.updatedAt,
          id,
        ]
      );
    }

    memoryGoals.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      await query('DELETE FROM goals WHERE id = $1', [id]);
    }
    return memoryGoals.delete(id);
  },
};
