import { Epic } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { FeatureRepository } from './featureRepository';
import { calculateEpicProgress } from '../services/progressCalculator';

const memoryEpics: Map<string, Epic> = new Map();

function seedDefaultEpics() {
  if (memoryEpics.size > 0) return;
  const defaults: Epic[] = [
    {
      id: 'epic_1',
      code: 'EPC-101',
      name: 'Ares Flight Guidance & Attitude Determination Core',
      description: 'End-to-end guidance, navigation, and attitude control (GN&C) algorithms operating on RTOS embedded architecture.',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'in-progress',
      priority: 'critical',
      health: 'on-track',
      progress: 55,
      startDate: '2026-07-01',
      targetDate: '2026-11-15',
      isArchived: false,
      featureCount: 2,
      storyCount: 2,
      taskCount: 3,
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-09-06T14:00:00Z',
    },
    {
      id: 'epic_2',
      code: 'EPC-102',
      name: 'Propulsion Cryogenic Manifold Management',
      description: 'Thermal insulation barrier monitoring and cryogenic liquid oxygen/methane manifold pressure regulation.',
      projectId: 'PRJ-102',
      projectName: 'Titan Cryogenic Propulsion Telemetry',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'in-progress',
      priority: 'high',
      health: 'at-risk',
      progress: 50,
      startDate: '2026-07-15',
      targetDate: '2026-11-01',
      isArchived: false,
      featureCount: 1,
      storyCount: 1,
      taskCount: 1,
      createdAt: '2026-07-15T09:00:00Z',
      updatedAt: '2026-09-06T11:00:00Z',
    },
    {
      id: 'epic_3',
      code: 'EPC-103',
      name: 'Helios Deep Space Optical Downlink Transceiver',
      description: 'Laser communication pointing and tracking protocol suite for high-bandwidth telemetry transmission.',
      projectId: 'PRJ-104',
      projectName: 'Artemis Deep Space Optical Comms',
      productId: 'prod_2',
      productName: 'Helios Deep Space Telemetry Suite',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'in-progress',
      priority: 'high',
      health: 'on-track',
      progress: 85,
      startDate: '2026-06-01',
      targetDate: '2026-09-30',
      isArchived: false,
      featureCount: 0,
      storyCount: 0,
      taskCount: 0,
      createdAt: '2026-06-01T08:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    },
  ];
  defaults.forEach((e) => memoryEpics.set(e.id, e));
}

seedDefaultEpics();

export const EpicRepository = {
  async findAll(filter?: {
    projectId?: string;
    productId?: string;
    portfolioId?: string;
    ownerId?: string;
    teamId?: string;
    status?: string;
    priority?: string;
    health?: string;
    isArchived?: boolean;
    search?: string;
  }): Promise<Epic[]> {
    if (isDbConnected()) {
      let q = `
        SELECT e.*,
               p.name as project_name,
               pr.name as product_name,
               pt.name as portfolio_name,
               u.first_name || ' ' || u.last_name as owner_name,
               tm.name as team_name,
               (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id) as feature_count,
               (SELECT COUNT(*) FROM stories s WHERE s.epic_id = e.id) as story_count,
               (SELECT COUNT(*) FROM tasks t WHERE t.epic_id = e.id) as task_count
        FROM epics e
        LEFT JOIN projects p ON e.project_id = p.id
        LEFT JOIN products pr ON e.product_id = pr.id
        LEFT JOIN portfolios pt ON e.portfolio_id = pt.id
        LEFT JOIN users u ON e.owner_id = u.id
        LEFT JOIN teams tm ON e.team_id = tm.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (filter?.projectId) {
        params.push(filter.projectId);
        q += ` AND e.project_id = $${params.length}`;
      }
      if (filter?.productId) {
        params.push(filter.productId);
        q += ` AND e.product_id = $${params.length}`;
      }
      if (filter?.portfolioId) {
        params.push(filter.portfolioId);
        q += ` AND e.portfolio_id = $${params.length}`;
      }
      if (filter?.ownerId) {
        params.push(filter.ownerId);
        q += ` AND e.owner_id = $${params.length}`;
      }
      if (filter?.teamId) {
        params.push(filter.teamId);
        q += ` AND e.team_id = $${params.length}`;
      }
      if (filter?.status) {
        params.push(filter.status);
        q += ` AND e.status = $${params.length}`;
      }
      if (filter?.priority) {
        params.push(filter.priority);
        q += ` AND e.priority = $${params.length}`;
      }
      if (filter?.health) {
        params.push(filter.health);
        q += ` AND e.health = $${params.length}`;
      }
      if (filter?.isArchived !== undefined) {
        params.push(filter.isArchived);
        q += ` AND e.is_archived = $${params.length}`;
      } else {
        q += ` AND e.is_archived = false`;
      }
      if (filter?.search) {
        params.push(`%${filter.search.toLowerCase()}%`);
        q += ` AND (LOWER(e.name) LIKE $${params.length} OR LOWER(e.code) LIKE $${params.length} OR LOWER(e.description) LIKE $${params.length})`;
      }
      q += ' ORDER BY e.created_at DESC';
      const res = await query(q, params);
      return res.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        projectId: r.project_id,
        projectName: r.project_name,
        productId: r.product_id,
        productName: r.product_name,
        portfolioId: r.portfolio_id,
        portfolioName: r.portfolio_name,
        ownerId: r.owner_id,
        ownerName: r.owner_name,
        teamId: r.team_id,
        teamName: r.team_name,
        status: r.status,
        priority: r.priority,
        health: r.health,
        progress: parseInt(r.progress, 10) || 0,
        startDate: r.start_date,
        targetDate: r.target_date,
        isArchived: r.is_archived,
        featureCount: parseInt(r.feature_count, 10) || 0,
        storyCount: parseInt(r.story_count, 10) || 0,
        taskCount: parseInt(r.task_count, 10) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    let list = Array.from(memoryEpics.values());
    if (filter?.projectId) list = list.filter((e) => e.projectId === filter.projectId);
    if (filter?.productId) list = list.filter((e) => e.productId === filter.productId);
    if (filter?.portfolioId) list = list.filter((e) => e.portfolioId === filter.portfolioId);
    if (filter?.ownerId) list = list.filter((e) => e.ownerId === filter.ownerId);
    if (filter?.teamId) list = list.filter((e) => e.teamId === filter.teamId);
    if (filter?.status) list = list.filter((e) => e.status === filter.status);
    if (filter?.priority) list = list.filter((e) => e.priority === filter.priority);
    if (filter?.health) list = list.filter((e) => e.health === filter.health);
    if (filter?.isArchived !== undefined) {
      list = list.filter((e) => !!e.isArchived === filter.isArchived);
    } else {
      list = list.filter((e) => !e.isArchived);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.code.toLowerCase().includes(q) ||
          (e.description && e.description.toLowerCase().includes(q))
      );
    }
    return list;
  },

  async findById(id: string): Promise<Epic | null> {
    if (isDbConnected()) {
      const q = `
        SELECT e.*,
               p.name as project_name,
               pr.name as product_name,
               pt.name as portfolio_name,
               u.first_name || ' ' || u.last_name as owner_name,
               tm.name as team_name,
               (SELECT COUNT(*) FROM features f WHERE f.epic_id = e.id) as feature_count,
               (SELECT COUNT(*) FROM stories s WHERE s.epic_id = e.id) as story_count,
               (SELECT COUNT(*) FROM tasks t WHERE t.epic_id = e.id) as task_count
        FROM epics e
        LEFT JOIN projects p ON e.project_id = p.id
        LEFT JOIN products pr ON e.product_id = pr.id
        LEFT JOIN portfolios pt ON e.portfolio_id = pt.id
        LEFT JOIN users u ON e.owner_id = u.id
        LEFT JOIN teams tm ON e.team_id = tm.id
        WHERE e.id = $1
      `;
      const res = await query(q, [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        projectId: r.project_id,
        projectName: r.project_name,
        productId: r.product_id,
        productName: r.product_name,
        portfolioId: r.portfolio_id,
        portfolioName: r.portfolio_name,
        ownerId: r.owner_id,
        ownerName: r.owner_name,
        teamId: r.team_id,
        teamName: r.team_name,
        status: r.status,
        priority: r.priority,
        health: r.health,
        progress: parseInt(r.progress, 10) || 0,
        startDate: r.start_date,
        targetDate: r.target_date,
        isArchived: r.is_archived,
        featureCount: parseInt(r.feature_count, 10) || 0,
        storyCount: parseInt(r.story_count, 10) || 0,
        taskCount: parseInt(r.task_count, 10) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memoryEpics.get(id) || null;
  },

  async create(epic: Epic): Promise<Epic> {
    if (isDbConnected()) {
      const q = `
        INSERT INTO epics (
          id, code, name, description, project_id, product_id, portfolio_id,
          owner_id, team_id, status, priority, health, progress, start_date,
          target_date, is_archived, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18
        ) RETURNING *
      `;
      await query(q, [
        epic.id,
        epic.code,
        epic.name,
        epic.description || null,
        epic.projectId,
        epic.productId || null,
        epic.portfolioId || null,
        epic.ownerId || null,
        epic.teamId || null,
        epic.status || 'backlog',
        epic.priority || 'medium',
        epic.health || 'on-track',
        epic.progress || 0,
        epic.startDate || null,
        epic.targetDate || null,
        epic.isArchived || false,
        epic.createdAt || new Date().toISOString(),
        epic.updatedAt || new Date().toISOString(),
      ]);
    }
    memoryEpics.set(epic.id, epic);
    return epic;
  },

  async update(id: string, updates: Partial<Epic>): Promise<Epic | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged: Epic = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (merged.status === 'done') {
      merged.progress = 100;
    }

    if (isDbConnected()) {
      const q = `
        UPDATE epics SET
          name = $1, description = $2, project_id = $3, product_id = $4,
          portfolio_id = $5, owner_id = $6, team_id = $7, status = $8,
          priority = $9, health = $10, progress = $11, start_date = $12,
          target_date = $13, is_archived = $14, updated_at = $15
        WHERE id = $16
      `;
      await query(q, [
        merged.name,
        merged.description || null,
        merged.projectId,
        merged.productId || null,
        merged.portfolioId || null,
        merged.ownerId || null,
        merged.teamId || null,
        merged.status,
        merged.priority,
        merged.health,
        merged.progress || 0,
        merged.startDate || null,
        merged.targetDate || null,
        merged.isArchived || false,
        merged.updatedAt,
        id,
      ]);
    }
    memoryEpics.set(id, merged);
    return merged;
  },

  async recalculateProgress(epicId: string): Promise<number> {
    const epic = await this.findById(epicId);
    if (!epic) return 0;
    const features = await FeatureRepository.findAll({ epicId });
    const progress = calculateEpicProgress(epic.status, features);
    await this.update(epicId, { progress });
    return progress;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      const res = await query('DELETE FROM epics WHERE id = $1', [id]);
      const deleted = (res.rowCount || 0) > 0;
      memoryEpics.delete(id);
      return deleted;
    }
    return memoryEpics.delete(id);
  },
};
