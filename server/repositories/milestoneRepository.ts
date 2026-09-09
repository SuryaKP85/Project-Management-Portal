import { Milestone, MilestoneHealth, MilestoneStatus, MilestoneType } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { GovernanceLinkRepository } from './governanceLinkRepository';
import { FeatureRepository } from './featureRepository';
import { StoryRepository } from './storyRepository';

const memoryMilestones: Map<string, Milestone> = new Map();

function seedDefaultMilestones() {
  if (memoryMilestones.size > 0) return;
  const defaults: Milestone[] = [
    {
      id: 'mls_1',
      code: 'MLS-101',
      name: 'Sub-Orbital Guidance Software Certification (DO-178C Level A)',
      description: 'Formal FAA & Aerospace Safety Board software certification baseline for autonomous attitude determination and ascent steering.',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      status: 'In Progress',
      targetDate: '2026-10-15',
      progress: 68,
      health: 'On Track',
      type: 'Governance',
      createdAt: '2026-07-20T08:00:00Z',
      updatedAt: '2026-09-06T14:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_admin_1',
    },
    {
      id: 'mls_2',
      code: 'MLS-102',
      name: 'Cryogenic Cold-Flow Manifold Valve Acceptance Gate',
      description: 'Complete 72-hour sustained pressurized liquid oxygen cryogenic flow loop verification with automated leak abort trigger.',
      projectId: 'PRJ-102',
      projectName: 'Titan Cryogenic Propulsion Telemetry',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      status: 'At Risk',
      targetDate: '2026-09-28',
      progress: 45,
      health: 'At Risk',
      type: 'Technical',
      createdAt: '2026-07-25T09:00:00Z',
      updatedAt: '2026-09-05T12:00:00Z',
      createdBy: 'usr_pm_2',
      updatedBy: 'usr_pm_2',
    },
    {
      id: 'mls_3',
      code: 'MLS-103',
      name: 'Customer Operations Center Cockpit Telemetry Go-Live',
      description: 'Handover of interactive 3D satellite trajectory monitoring dashboard to Commercial Spaceflight Operations dispatch team.',
      projectId: 'PRJ-103',
      projectName: 'NextGen Avionics Suite',
      productId: 'prod_2',
      productName: 'Titan Mission Control Cloud',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      status: 'Planned',
      targetDate: '2026-11-10',
      progress: 25,
      health: 'On Track',
      type: 'Customer',
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
      createdBy: 'usr_pm_2',
      updatedBy: 'usr_pm_2',
    },
    {
      id: 'mls_4',
      code: 'MLS-104',
      name: 'Orbital Insertion Guidance Hardware-in-the-Loop Signoff',
      description: 'Execution of complete simulated Stage-2 separation and circularization burn trajectory on RTOS flight test rig.',
      projectId: 'PRJ-104',
      projectName: 'Orbital Insertion Guidance OS',
      productId: 'prod_2',
      productName: 'Titan Mission Control Cloud',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      status: 'Planned',
      targetDate: '2026-12-05',
      progress: 10,
      health: 'On Track',
      type: 'Delivery',
      createdAt: '2026-08-05T14:00:00Z',
      updatedAt: '2026-08-05T14:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_admin_1',
    },
  ];
  for (const m of defaults) {
    memoryMilestones.set(m.id, m);
  }
}

seedDefaultMilestones();

export const MilestoneRepository = {
  async computeDerivedProgressAndHealth(milestone: Milestone): Promise<{ progress: number; health: MilestoneHealth; status: MilestoneStatus }> {
    const links = await GovernanceLinkRepository.getLinksFor('milestone', milestone.id);
    let progress = milestone.progress;
    let totalProgress = 0;
    let countedItems = 0;

    for (const link of links) {
      if (link.targetType === 'feature') {
        const feat = await FeatureRepository.findById(link.targetId);
        if (feat && typeof feat.progress === 'number') {
          totalProgress += feat.progress;
          countedItems++;
        }
      } else if (link.targetType === 'story') {
        const story = await StoryRepository.findById(link.targetId);
        if (story) {
          totalProgress += story.status === 'done' ? 100 : story.status === 'in-progress' ? 50 : 0;
          countedItems++;
        }
      }
    }

    if (countedItems > 0) {
      progress = Math.round(totalProgress / countedItems);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let status = milestone.status;
    let health: MilestoneHealth = 'On Track';

    if (progress >= 100) {
      status = 'Completed';
      health = 'On Track';
    } else if (milestone.targetDate < todayStr && progress < 100) {
      status = milestone.status === 'Cancelled' ? 'Cancelled' : 'Missed';
      health = 'Critical';
    } else if (milestone.status === 'At Risk') {
      health = 'At Risk';
    } else {
      // Check proximity (within 14 days and progress < 50%)
      const targetTime = new Date(milestone.targetDate).getTime();
      const todayTime = new Date(todayStr).getTime();
      const daysUntil = Math.ceil((targetTime - todayTime) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 14 && progress < 50) {
        health = 'At Risk';
      }
    }

    return { progress, health, status };
  },

  async findAll(filter?: {
    projectId?: string;
    productId?: string;
    ownerId?: string;
    status?: string;
    health?: string;
    type?: string;
    search?: string;
  }): Promise<Milestone[]> {
    seedDefaultMilestones();
    let milestones: Milestone[] = [];

    if (isDbConnected()) {
      try {
        let queryStr = `
          SELECT id, code, name, description, project_id as "projectId",
                 product_id as "productId", owner_id as "ownerId",
                 status, target_date as "targetDate", actual_date as "actualDate",
                 progress, health, type, created_by as "createdBy",
                 updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
          FROM milestones
          WHERE 1=1
        `;
        const params: any[] = [];
        let pIndex = 1;

        if (filter?.projectId) {
          queryStr += ` AND project_id = $${pIndex++}`;
          params.push(filter.projectId);
        }
        if (filter?.productId) {
          queryStr += ` AND product_id = $${pIndex++}`;
          params.push(filter.productId);
        }
        if (filter?.ownerId) {
          queryStr += ` AND owner_id = $${pIndex++}`;
          params.push(filter.ownerId);
        }
        if (filter?.status && filter.status !== 'all') {
          queryStr += ` AND status = $${pIndex++}`;
          params.push(filter.status);
        }
        if (filter?.health && filter.health !== 'all') {
          queryStr += ` AND health = $${pIndex++}`;
          params.push(filter.health);
        }
        if (filter?.type && filter.type !== 'all') {
          queryStr += ` AND type = $${pIndex++}`;
          params.push(filter.type);
        }
        if (filter?.search) {
          queryStr += ` AND (name ILIKE $${pIndex} OR code ILIKE $${pIndex} OR description ILIKE $${pIndex})`;
          params.push(`%${filter.search}%`);
          pIndex++;
        }
        queryStr += ` ORDER BY target_date ASC`;

        const res = await query(queryStr, params);
        milestones = res.rows;
      } catch (err) {
        console.warn('DB error in MilestoneRepository.findAll, fallback to memory:', err);
        milestones = Array.from(memoryMilestones.values());
      }
    } else {
      milestones = Array.from(memoryMilestones.values());
    }

    if (!isDbConnected() && filter) {
      if (filter.projectId) milestones = milestones.filter((m) => m.projectId === filter.projectId);
      if (filter.productId) milestones = milestones.filter((m) => m.productId === filter.productId);
      if (filter.ownerId) milestones = milestones.filter((m) => m.ownerId === filter.ownerId);
      if (filter.status && filter.status !== 'all') milestones = milestones.filter((m) => m.status.toLowerCase() === filter.status!.toLowerCase());
      if (filter.health && filter.health !== 'all') milestones = milestones.filter((m) => m.health.toLowerCase() === filter.health!.toLowerCase());
      if (filter.type && filter.type !== 'all') milestones = milestones.filter((m) => m.type.toLowerCase() === filter.type!.toLowerCase());
      if (filter.search) {
        const q = filter.search.toLowerCase();
        milestones = milestones.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.code.toLowerCase().includes(q) ||
            (m.description && m.description.toLowerCase().includes(q))
        );
      }
    }

    for (const m of milestones) {
      m.linkedItems = await GovernanceLinkRepository.getLinksFor('milestone', m.id);
    }

    return milestones.sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime());
  },

  async findById(id: string): Promise<Milestone | null> {
    seedDefaultMilestones();
    let milestone: Milestone | null = null;
    if (isDbConnected()) {
      try {
        const res = await query(
          `SELECT id, code, name, description, project_id as "projectId",
                  product_id as "productId", owner_id as "ownerId",
                  status, target_date as "targetDate", actual_date as "actualDate",
                  progress, health, type, created_by as "createdBy",
                  updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
           FROM milestones
           WHERE id = $1`,
          [id]
        );
        if (res.rows.length > 0) milestone = res.rows[0];
      } catch (err) {
        console.warn('DB error in MilestoneRepository.findById:', err);
      }
    }
    if (!milestone) {
      milestone = memoryMilestones.get(id) || null;
    }
    if (milestone) {
      milestone.linkedItems = await GovernanceLinkRepository.getLinksFor('milestone', milestone.id);
    }
    return milestone;
  },

  async create(data: Partial<Milestone>): Promise<Milestone> {
    seedDefaultMilestones();
    const id = data.id || `mls_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const count = memoryMilestones.size + 101;
    const code = data.code || `MLS-${count}`;

    const newMilestone: Milestone = {
      id,
      code,
      name: data.name || 'Untitled Milestone',
      description: data.description || '',
      projectId: data.projectId || 'PRJ-101',
      projectName: data.projectName || '',
      productId: data.productId,
      productName: data.productName,
      ownerId: data.ownerId || 'usr_admin_1',
      ownerName: data.ownerName || 'Admin User',
      status: (data.status as MilestoneStatus) || 'Planned',
      targetDate: data.targetDate || new Date().toISOString().split('T')[0],
      actualDate: data.actualDate,
      progress: Math.max(0, Math.min(100, Number(data.progress) || 0)),
      health: (data.health as MilestoneHealth) || 'On Track',
      type: (data.type as MilestoneType) || 'Delivery',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: data.createdBy || 'system',
      updatedBy: data.updatedBy || 'system',
    };

    memoryMilestones.set(id, newMilestone);

    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO milestones (
            id, code, name, description, project_id, product_id,
            owner_id, status, target_date, actual_date, progress,
            health, type, created_by, updated_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            newMilestone.id,
            newMilestone.code,
            newMilestone.name,
            newMilestone.description || null,
            newMilestone.projectId,
            newMilestone.productId || null,
            newMilestone.ownerId || null,
            newMilestone.status,
            newMilestone.targetDate,
            newMilestone.actualDate || null,
            newMilestone.progress,
            newMilestone.health,
            newMilestone.type,
            newMilestone.createdBy || null,
            newMilestone.updatedBy || null,
            newMilestone.createdAt,
            newMilestone.updatedAt,
          ]
        );
      } catch (err) {
        console.warn('DB error inserting milestone:', err);
      }
    }

    if (data.linkedItems && data.linkedItems.length > 0) {
      for (const item of data.linkedItems) {
        await GovernanceLinkRepository.addLink(
          'milestone',
          newMilestone.id,
          item.targetType,
          item.targetId,
          item.targetCode,
          item.targetName
        );
      }
      newMilestone.linkedItems = await GovernanceLinkRepository.getLinksFor('milestone', newMilestone.id);
    }

    return newMilestone;
  },

  async update(id: string, updates: Partial<Milestone>): Promise<Milestone | null> {
    seedDefaultMilestones();
    const existing = await this.findById(id);
    if (!existing) return null;

    let actualDate = updates.actualDate !== undefined ? updates.actualDate : existing.actualDate;
    if (updates.status === 'Completed' && !actualDate) {
      actualDate = new Date().toISOString().split('T')[0];
    }

    const updated: Milestone = {
      ...existing,
      ...updates,
      actualDate,
      progress: updates.progress !== undefined ? Math.max(0, Math.min(100, Number(updates.progress))) : existing.progress,
      updatedAt: new Date().toISOString(),
    };

    memoryMilestones.set(id, updated);

    if (isDbConnected()) {
      try {
        await query(
          `UPDATE milestones SET
            name = $1, description = $2, project_id = $3, product_id = $4,
            owner_id = $5, status = $6, target_date = $7, actual_date = $8,
            progress = $9, health = $10, type = $11, updated_by = $12, updated_at = $13
           WHERE id = $14`,
          [
            updated.name,
            updated.description || null,
            updated.projectId,
            updated.productId || null,
            updated.ownerId || null,
            updated.status,
            updated.targetDate,
            updated.actualDate || null,
            updated.progress,
            updated.health,
            updated.type,
            updated.updatedBy || null,
            updated.updatedAt,
            id,
          ]
        );
      } catch (err) {
        console.warn('DB error updating milestone:', err);
      }
    }

    if (updates.linkedItems) {
      await GovernanceLinkRepository.replaceLinks('milestone', id, updates.linkedItems);
      updated.linkedItems = await GovernanceLinkRepository.getLinksFor('milestone', id);
    }

    return updated;
  },

  async delete(id: string): Promise<boolean> {
    seedDefaultMilestones();
    const removed = memoryMilestones.delete(id);
    if (isDbConnected()) {
      try {
        await query(`DELETE FROM milestones WHERE id = $1`, [id]);
        await query(`DELETE FROM governance_links WHERE governance_type = 'milestone' AND governance_id = $1`, [id]);
      } catch (err) {
        console.warn('DB error deleting milestone:', err);
      }
    }
    return removed;
  },
};
