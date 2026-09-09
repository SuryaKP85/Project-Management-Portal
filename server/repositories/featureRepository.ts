import { Feature } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { StoryRepository } from './storyRepository';
import { calculateFeatureProgress } from '../services/progressCalculator';

const memoryFeatures: Map<string, Feature> = new Map();

function seedDefaultFeatures() {
  if (memoryFeatures.size > 0) return;
  const defaults: Feature[] = [
    {
      id: 'feat_1',
      code: 'FEAT-101',
      name: 'Autonomous Real-time Trajectory Engine',
      description: 'Matrix calculation engine calculating pitch/yaw/roll moment arm delta and pulsing thruster arrays.',
      epicId: 'epic_1',
      epicName: 'Ares Flight Guidance & Attitude Determination Core',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'in-progress',
      priority: 'critical',
      targetRelease: '2026-Q4',
      startDate: '2026-08-01',
      targetDate: '2026-10-15',
      progress: 30,
      storyCount: 1,
      createdAt: '2026-08-01T08:00:00Z',
      updatedAt: '2026-09-06T14:00:00Z',
    },
    {
      id: 'feat_2',
      code: 'FEAT-102',
      name: 'Redundant Sensor Bus Multiplexer',
      description: 'Multi-channel SPI/CAN/SpaceWire arbitration logic with autonomous Byzantine fault detection.',
      epicId: 'epic_1',
      epicName: 'Ares Flight Guidance & Attitude Determination Core',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'testing',
      priority: 'high',
      targetRelease: '2026-Q4',
      startDate: '2026-08-15',
      targetDate: '2026-10-01',
      progress: 80,
      storyCount: 1,
      createdAt: '2026-08-15T09:00:00Z',
      updatedAt: '2026-09-05T16:00:00Z',
    },
    {
      id: 'feat_3',
      code: 'FEAT-103',
      name: 'Cryogenic Fluid Pressure Regulation Pipeline',
      description: 'Sensor feedback loop governing cryogenic boil-off vent valves under dynamic G-load conditions.',
      epicId: 'epic_2',
      epicName: 'Propulsion Cryogenic Manifold Management',
      projectId: 'PRJ-102',
      projectName: 'Titan Cryogenic Propulsion Telemetry',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'in-progress',
      priority: 'high',
      targetRelease: '2026-Q3',
      startDate: '2026-08-10',
      targetDate: '2026-11-01',
      progress: 50,
      storyCount: 1,
      createdAt: '2026-08-10T10:00:00Z',
      updatedAt: '2026-09-06T11:00:00Z',
    },
  ];
  defaults.forEach((f) => memoryFeatures.set(f.id, f));
}

seedDefaultFeatures();

export const FeatureRepository = {
  async findAll(filter?: {
    epicId?: string;
    projectId?: string;
    productId?: string;
    ownerId?: string;
    teamId?: string;
    status?: string;
    priority?: string;
    search?: string;
  }): Promise<Feature[]> {
    if (isDbConnected()) {
      let q = `
        SELECT f.*,
               p.name as project_name,
               pr.name as product_name,
               e.name as epic_name,
               u.first_name || ' ' || u.last_name as owner_name,
               tm.name as team_name,
               (SELECT COUNT(*) FROM stories s WHERE s.feature_id = f.id) as story_count,
               (SELECT COUNT(*) FROM tasks t WHERE t.feature_id = f.id) as task_count
        FROM features f
        LEFT JOIN projects p ON f.project_id = p.id
        LEFT JOIN products pr ON f.product_id = pr.id
        LEFT JOIN epics e ON f.epic_id = e.id
        LEFT JOIN users u ON f.owner_id = u.id
        LEFT JOIN teams tm ON f.team_id = tm.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (filter?.epicId) {
        params.push(filter.epicId);
        q += ` AND f.epic_id = $${params.length}`;
      }
      if (filter?.projectId) {
        params.push(filter.projectId);
        q += ` AND f.project_id = $${params.length}`;
      }
      if (filter?.productId) {
        params.push(filter.productId);
        q += ` AND f.product_id = $${params.length}`;
      }
      if (filter?.ownerId) {
        params.push(filter.ownerId);
        q += ` AND f.owner_id = $${params.length}`;
      }
      if (filter?.teamId) {
        params.push(filter.teamId);
        q += ` AND f.team_id = $${params.length}`;
      }
      if (filter?.status) {
        params.push(filter.status);
        q += ` AND f.status = $${params.length}`;
      }
      if (filter?.priority) {
        params.push(filter.priority);
        q += ` AND f.priority = $${params.length}`;
      }
      if (filter?.search) {
        params.push(`%${filter.search.toLowerCase()}%`);
        q += ` AND (LOWER(f.name) LIKE $${params.length} OR LOWER(f.code) LIKE $${params.length} OR LOWER(f.description) LIKE $${params.length})`;
      }
      q += ' ORDER BY f.created_at DESC';
      const res = await query(q, params);
      return res.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        epicId: r.epic_id,
        epicName: r.epic_name,
        projectId: r.project_id,
        projectName: r.project_name,
        productId: r.product_id,
        productName: r.product_name,
        ownerId: r.owner_id,
        ownerName: r.owner_name,
        teamId: r.team_id,
        teamName: r.team_name,
        status: r.status,
        priority: r.priority,
        targetRelease: r.target_release,
        startDate: r.start_date,
        targetDate: r.target_date,
        progress: parseInt(r.progress, 10) || 0,
        storyCount: parseInt(r.story_count, 10) || 0,
        taskCount: parseInt(r.task_count, 10) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    let list = Array.from(memoryFeatures.values());
    if (filter?.epicId) list = list.filter((f) => f.epicId === filter.epicId);
    if (filter?.projectId) list = list.filter((f) => f.projectId === filter.projectId);
    if (filter?.productId) list = list.filter((f) => f.productId === filter.productId);
    if (filter?.ownerId) list = list.filter((f) => f.ownerId === filter.ownerId);
    if (filter?.teamId) list = list.filter((f) => f.teamId === filter.teamId);
    if (filter?.status) list = list.filter((f) => f.status === filter.status);
    if (filter?.priority) list = list.filter((f) => f.priority === filter.priority);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.code.toLowerCase().includes(q) ||
          (f.description && f.description.toLowerCase().includes(q))
      );
    }
    return list;
  },

  async findById(id: string): Promise<Feature | null> {
    if (isDbConnected()) {
      const q = `
        SELECT f.*,
               p.name as project_name,
               pr.name as product_name,
               e.name as epic_name,
               u.first_name || ' ' || u.last_name as owner_name,
               tm.name as team_name,
               (SELECT COUNT(*) FROM stories s WHERE s.feature_id = f.id) as story_count,
               (SELECT COUNT(*) FROM tasks t WHERE t.feature_id = f.id) as task_count
        FROM features f
        LEFT JOIN projects p ON f.project_id = p.id
        LEFT JOIN products pr ON f.product_id = pr.id
        LEFT JOIN epics e ON f.epic_id = e.id
        LEFT JOIN users u ON f.owner_id = u.id
        LEFT JOIN teams tm ON f.team_id = tm.id
        WHERE f.id = $1
      `;
      const res = await query(q, [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        epicId: r.epic_id,
        epicName: r.epic_name,
        projectId: r.project_id,
        projectName: r.project_name,
        productId: r.product_id,
        productName: r.product_name,
        ownerId: r.owner_id,
        ownerName: r.owner_name,
        teamId: r.team_id,
        teamName: r.team_name,
        status: r.status,
        priority: r.priority,
        targetRelease: r.target_release,
        startDate: r.start_date,
        targetDate: r.target_date,
        progress: parseInt(r.progress, 10) || 0,
        storyCount: parseInt(r.story_count, 10) || 0,
        taskCount: parseInt(r.task_count, 10) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memoryFeatures.get(id) || null;
  },

  async create(feature: Feature): Promise<Feature> {
    if (isDbConnected()) {
      const q = `
        INSERT INTO features (
          id, code, name, description, epic_id, project_id, product_id,
          owner_id, team_id, status, priority, target_release, start_date,
          target_date, progress, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17
        ) RETURNING *
      `;
      await query(q, [
        feature.id,
        feature.code,
        feature.name,
        feature.description || null,
        feature.epicId || null,
        feature.projectId,
        feature.productId || null,
        feature.ownerId || null,
        feature.teamId || null,
        feature.status || 'backlog',
        feature.priority || 'medium',
        feature.targetRelease || null,
        feature.startDate || null,
        feature.targetDate || null,
        feature.progress || 0,
        feature.createdAt || new Date().toISOString(),
        feature.updatedAt || new Date().toISOString(),
      ]);
    }
    memoryFeatures.set(feature.id, feature);
    return feature;
  },

  async update(id: string, updates: Partial<Feature>): Promise<Feature | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged: Feature = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (merged.status === 'done') {
      merged.progress = 100;
    }

    if (isDbConnected()) {
      const q = `
        UPDATE features SET
          name = $1, description = $2, epic_id = $3, project_id = $4,
          product_id = $5, owner_id = $6, team_id = $7, status = $8,
          priority = $9, target_release = $10, start_date = $11, target_date = $12,
          progress = $13, updated_at = $14
        WHERE id = $15
      `;
      await query(q, [
        merged.name,
        merged.description || null,
        merged.epicId || null,
        merged.projectId,
        merged.productId || null,
        merged.ownerId || null,
        merged.teamId || null,
        merged.status,
        merged.priority,
        merged.targetRelease || null,
        merged.startDate || null,
        merged.targetDate || null,
        merged.progress || 0,
        merged.updatedAt,
        id,
      ]);
    }
    memoryFeatures.set(id, merged);
    return merged;
  },

  async recalculateProgress(featureId: string): Promise<number> {
    const feature = await this.findById(featureId);
    if (!feature) return 0;
    const stories = await StoryRepository.findAll({ featureId });
    const progress = calculateFeatureProgress(feature.status, stories);
    await this.update(featureId, { progress });
    return progress;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      const res = await query('DELETE FROM features WHERE id = $1', [id]);
      const deleted = (res.rowCount || 0) > 0;
      memoryFeatures.delete(id);
      return deleted;
    }
    return memoryFeatures.delete(id);
  },
};
