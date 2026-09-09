import { Release, ReleaseHealth, ReleaseHealthFactor, ReleaseItem, ReleaseStatus } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { RiskRepository } from './riskRepository';
import { IssueRepository } from './issueRepository';
import { DependencyRepository } from './dependencyRepository';
import { MilestoneRepository } from './milestoneRepository';
import { EpicRepository } from './epicRepository';
import { FeatureRepository } from './featureRepository';
import { StoryRepository } from './storyRepository';
import { TaskRepository } from './taskRepository';

const memoryReleases: Map<string, Release> = new Map();
const memoryReleaseItems: Map<string, ReleaseItem> = new Map();

function seedDefaultReleases() {
  if (memoryReleases.size > 0) return;
  const defaults: Release[] = [
    {
      id: 'rel_1',
      code: 'REL-101',
      name: 'Ares Flight OS Sub-Orbital Qualification Baseline',
      version: 'v2.0.0-rc1',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      status: 'Testing',
      releaseDate: '2026-10-30',
      health: 'At Risk',
      description: 'Production-candidate release containing hardened attitude estimation, cryogenic cold-flow loops, and real-time RTOS CAN telemetry.',
      createdAt: '2026-07-15T08:00:00Z',
      updatedAt: '2026-09-06T11:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_admin_1',
    },
    {
      id: 'rel_2',
      code: 'REL-102',
      name: 'Titan Mission Control Telemetry Ingestion Hub',
      version: 'v1.4.2',
      productId: 'prod_2',
      productName: 'Titan Mission Control Cloud',
      projectId: 'PRJ-103',
      projectName: 'NextGen Avionics Suite',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      status: 'In Development',
      releaseDate: '2026-11-20',
      health: 'On Track',
      description: 'Scale-out telemetry streaming engine with multi-channel S-band packet demux and real-time flight trajectory telemetry.',
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-28T14:00:00Z',
      createdBy: 'usr_pm_2',
      updatedBy: 'usr_pm_2',
    },
    {
      id: 'rel_3',
      code: 'REL-103',
      name: 'Orbital Insertion Guidance Flight Software Core',
      version: 'v2.1.0',
      productId: 'prod_2',
      productName: 'Titan Mission Control Cloud',
      projectId: 'PRJ-104',
      projectName: 'Orbital Insertion Guidance OS',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      status: 'Planned',
      releaseDate: '2026-12-18',
      health: 'On Track',
      description: 'Stage-2 circularization guidance trajectory solver and automated orbit insertion burn sequencer.',
      createdAt: '2026-08-10T09:00:00Z',
      updatedAt: '2026-08-10T09:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_admin_1',
    },
  ];

  for (const r of defaults) {
    memoryReleases.set(r.id, r);
  }

  // Seed Release Items for REL-101
  const defaultItems: ReleaseItem[] = [
    {
      id: 'ritem_1',
      releaseId: 'rel_1',
      itemType: 'epic',
      itemId: 'epic_1',
      itemCode: 'EPC-101',
      itemTitle: 'Ares Flight Guidance & Attitude Determination Core',
      status: 'in-progress',
      progress: 55,
      addedAt: '2026-07-20T08:00:00Z',
    },
    {
      id: 'ritem_2',
      releaseId: 'rel_1',
      itemType: 'feature',
      itemId: 'feat_1',
      itemCode: 'FEAT-101',
      itemTitle: 'Quaternion Inertial State Estimation',
      status: 'in-progress',
      progress: 60,
      addedAt: '2026-07-20T08:00:00Z',
    },
    {
      id: 'ritem_3',
      releaseId: 'rel_1',
      itemType: 'story',
      itemId: 'story_1',
      itemCode: 'STR-101',
      itemTitle: 'Attitude Matrix Computation in RTOS',
      status: 'in-progress',
      progress: 60,
      addedAt: '2026-07-20T08:00:00Z',
    },
    {
      id: 'ritem_4',
      releaseId: 'rel_1',
      itemType: 'task',
      itemId: 'task_1',
      itemCode: 'TSK-101',
      itemTitle: 'Derive 6-DOF Quaternion Matrix Filter',
      status: 'in-progress',
      progress: 50,
      addedAt: '2026-07-20T08:00:00Z',
    },
    {
      id: 'ritem_5',
      releaseId: 'rel_1',
      itemType: 'milestone',
      itemId: 'mls_1',
      itemCode: 'MLS-101',
      itemTitle: 'Sub-Orbital Guidance Software Certification',
      status: 'In Progress',
      progress: 68,
      addedAt: '2026-07-20T08:00:00Z',
    },
  ];

  for (const item of defaultItems) {
    memoryReleaseItems.set(item.id, item);
  }
}

seedDefaultReleases();

export const ReleaseRepository = {
  async getReleaseItems(releaseId: string): Promise<ReleaseItem[]> {
    seedDefaultReleases();
    if (isDbConnected()) {
      try {
        const res = await query(
          `SELECT id, release_id as "releaseId", item_type as "itemType",
                  item_id as "itemId", item_code as "itemCode", item_title as "itemTitle",
                  status, progress, added_at as "addedAt"
           FROM release_items
           WHERE release_id = $1
           ORDER BY added_at ASC`,
          [releaseId]
        );
        return res.rows;
      } catch (err) {
        console.warn('DB error fetching release items, using memory:', err);
      }
    }
    return Array.from(memoryReleaseItems.values()).filter((i) => i.releaseId === releaseId);
  },

  async addReleaseItem(
    releaseId: string,
    itemType: 'epic' | 'feature' | 'story' | 'task' | 'milestone',
    itemId: string,
    itemCode?: string,
    itemTitle?: string,
    status?: string,
    progress?: number
  ): Promise<ReleaseItem> {
    seedDefaultReleases();
    const existing = Array.from(memoryReleaseItems.values()).find(
      (i) => i.releaseId === releaseId && i.itemType === itemType && i.itemId === itemId
    );
    if (existing) return existing;

    const id = `ritem_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const newItem: ReleaseItem = {
      id,
      releaseId,
      itemType,
      itemId,
      itemCode,
      itemTitle,
      status: status || 'planned',
      progress: progress || 0,
      addedAt: new Date().toISOString(),
    };
    memoryReleaseItems.set(id, newItem);

    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO release_items (id, release_id, item_type, item_id, item_code, item_title, status, progress, added_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, releaseId, itemType, itemId, itemCode || null, itemTitle || null, status || null, progress || 0, newItem.addedAt]
        );
      } catch (err) {
        console.warn('DB error inserting release item:', err);
      }
    }

    return newItem;
  },

  async removeReleaseItem(id: string): Promise<boolean> {
    seedDefaultReleases();
    const removed = memoryReleaseItems.delete(id);
    if (isDbConnected()) {
      try {
        await query(`DELETE FROM release_items WHERE id = $1`, [id]);
      } catch (err) {
        console.warn('DB error deleting release item:', err);
      }
    }
    return removed;
  },

  async calculateReleaseHealth(release: Release): Promise<{
    health: ReleaseHealth;
    healthFactors: ReleaseHealthFactor[];
    completionProgress: number;
    itemCounts: { epics: number; features: number; stories: number; tasks: number; milestones: number; total: number; completed: number };
  }> {
    const items = await this.getReleaseItems(release.id);
    const healthFactors: ReleaseHealthFactor[] = [];
    let criticalCount = 0;
    let warningCount = 0;

    const itemCounts = {
      epics: 0,
      features: 0,
      stories: 0,
      tasks: 0,
      milestones: 0,
      total: items.length,
      completed: 0,
    };

    let totalProgressSum = 0;
    for (const item of items) {
      if (item.itemType === 'epic') itemCounts.epics++;
      if (item.itemType === 'feature') itemCounts.features++;
      if (item.itemType === 'story') itemCounts.stories++;
      if (item.itemType === 'task') itemCounts.tasks++;
      if (item.itemType === 'milestone') itemCounts.milestones++;

      const isCompleted =
        item.status?.toLowerCase() === 'done' ||
        item.status?.toLowerCase() === 'completed' ||
        (item.progress !== undefined && item.progress >= 100);

      if (isCompleted) itemCounts.completed++;
      totalProgressSum += item.progress || 0;
    }

    const completionProgress = items.length > 0 ? Math.round(totalProgressSum / items.length) : 0;

    // 1. Unresolved Critical / High Risks linked to this release or its project
    const allRisks = await RiskRepository.findAll({
      projectId: release.projectId,
      status: 'all',
    });
    const unresolvedCriticalRisks = allRisks.filter(
      (r) => (r.severity === 'Critical' || r.severity === 'High') && r.status !== 'Closed' && r.status !== 'Accepted'
    );
    if (unresolvedCriticalRisks.length > 0) {
      const hasCritical = unresolvedCriticalRisks.some((r) => r.severity === 'Critical');
      if (hasCritical) {
        criticalCount++;
        healthFactors.push({
          metric: 'Unresolved Critical Risks',
          status: 'critical',
          details: `${unresolvedCriticalRisks.filter((r) => r.severity === 'Critical').length} critical risk(s) active in release scope`,
        });
      } else {
        warningCount++;
        healthFactors.push({
          metric: 'High Severity Risks',
          status: 'warning',
          details: `${unresolvedCriticalRisks.length} high risk(s) pending mitigation`,
        });
      }
    } else {
      healthFactors.push({
        metric: 'Risk Profile',
        status: 'good',
        details: 'No critical or unmitigated risks impeding release timeline',
      });
    }

    // 2. Unresolved Critical Issues in project scope
    const allIssues = await IssueRepository.findAll({
      projectId: release.projectId,
      status: 'all',
    });
    const openCriticalIssues = allIssues.filter(
      (i) => (i.severity === 'Critical' || i.severity === 'High') && i.status !== 'Resolved' && i.status !== 'Closed' && i.status !== 'Rejected'
    );
    if (openCriticalIssues.length > 0) {
      const hasCritical = openCriticalIssues.some((i) => i.severity === 'Critical');
      if (hasCritical) {
        criticalCount++;
        healthFactors.push({
          metric: 'Blocking Defects & Issues',
          status: 'critical',
          details: `${openCriticalIssues.filter((i) => i.severity === 'Critical').length} critical issue(s) unresolved`,
        });
      } else {
        warningCount++;
        healthFactors.push({
          metric: 'High Priority Issues',
          status: 'warning',
          details: `${openCriticalIssues.length} high priority issue(s) under investigation`,
        });
      }
    } else {
      healthFactors.push({
        metric: 'Issue Registry',
        status: 'good',
        details: 'Zero open critical defects blocking release readiness',
      });
    }

    // 3. Blocking / Overdue Dependencies
    const allDeps = await DependencyRepository.findAll();
    const blockingDeps = allDeps.filter(
      (d) =>
        (d.sourceEntityId === release.id || d.targetEntityId === release.id || d.sourceEntityId === release.projectId || d.targetEntityId === release.projectId) &&
        (d.isOverdue || d.status === 'At Risk' || d.dependencyType === 'Blocks') &&
        d.status !== 'Resolved' &&
        d.status !== 'Closed'
    );
    if (blockingDeps.length > 0) {
      const overdue = blockingDeps.filter((d) => d.isOverdue);
      if (overdue.length > 0) {
        criticalCount++;
        healthFactors.push({
          metric: 'Overdue Dependencies',
          status: 'critical',
          details: `${overdue.length} dependency delivery date(s) past due`,
        });
      } else {
        warningCount++;
        healthFactors.push({
          metric: 'Active Blocking Dependencies',
          status: 'warning',
          details: `${blockingDeps.length} blocking external dependency(ies) active`,
        });
      }
    } else {
      healthFactors.push({
        metric: 'Dependency Flow',
        status: 'good',
        details: 'All critical path dependencies resolved or on schedule',
      });
    }

    // 4. Milestone status in release
    const releaseMilestones = items.filter((i) => i.itemType === 'milestone');
    for (const rm of releaseMilestones) {
      const mls = await MilestoneRepository.findById(rm.itemId);
      if (mls && (mls.status === 'Missed' || mls.health === 'Critical')) {
        criticalCount++;
        healthFactors.push({
          metric: `Milestone [${mls.code}] Health`,
          status: 'critical',
          details: `Milestone ${mls.name} is missed or critical`,
        });
      } else if (mls && (mls.status === 'At Risk' || mls.health === 'At Risk')) {
        warningCount++;
        healthFactors.push({
          metric: `Milestone [${mls.code}] Health`,
          status: 'warning',
          details: `Milestone ${mls.name} flagged at risk`,
        });
      }
    }

    // 5. Schedule date variance
    const todayStr = new Date().toISOString().split('T')[0];
    if (release.status !== 'Released' && release.releaseDate < todayStr) {
      criticalCount++;
      healthFactors.push({
        metric: 'Target Schedule Window',
        status: 'critical',
        details: `Release target date (${release.releaseDate}) is past due without release signoff`,
      });
    }

    // Deterministic health calculation:
    // Critical Count >= 2 OR missed release date => Off Track (Red)
    // Critical Count == 1 OR Warning Count >= 1 => At Risk (Yellow)
    // Otherwise => On Track (Green)
    let health: ReleaseHealth = 'On Track';
    if (criticalCount >= 2 || (release.status !== 'Released' && release.releaseDate < todayStr)) {
      health = 'Off Track';
    } else if (criticalCount === 1 || warningCount >= 1) {
      health = 'At Risk';
    }

    return { health, healthFactors, completionProgress, itemCounts };
  },

  async findAll(filter?: {
    projectId?: string;
    productId?: string;
    ownerId?: string;
    status?: string;
    health?: string;
    search?: string;
  }): Promise<Release[]> {
    seedDefaultReleases();
    let releases: Release[] = [];

    if (isDbConnected()) {
      try {
        let queryStr = `
          SELECT id, code, name, version, product_id as "productId",
                 project_id as "projectId", owner_id as "ownerId",
                 status, release_date as "releaseDate", actual_release_date as "actualReleaseDate",
                 health, description, created_by as "createdBy",
                 updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
          FROM releases
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
        if (filter?.search) {
          queryStr += ` AND (name ILIKE $${pIndex} OR code ILIKE $${pIndex} OR version ILIKE $${pIndex} OR description ILIKE $${pIndex})`;
          params.push(`%${filter.search}%`);
          pIndex++;
        }
        queryStr += ` ORDER BY release_date ASC`;

        const res = await query(queryStr, params);
        releases = res.rows;
      } catch (err) {
        console.warn('DB error in ReleaseRepository.findAll, fallback to memory:', err);
        releases = Array.from(memoryReleases.values());
      }
    } else {
      releases = Array.from(memoryReleases.values());
    }

    if (!isDbConnected() && filter) {
      if (filter.projectId) releases = releases.filter((r) => r.projectId === filter.projectId);
      if (filter.productId) releases = releases.filter((r) => r.productId === filter.productId);
      if (filter.ownerId) releases = releases.filter((r) => r.ownerId === filter.ownerId);
      if (filter.status && filter.status !== 'all') releases = releases.filter((r) => r.status.toLowerCase() === filter.status!.toLowerCase());
      if (filter.health && filter.health !== 'all') releases = releases.filter((r) => r.health.toLowerCase() === filter.health!.toLowerCase());
      if (filter.search) {
        const q = filter.search.toLowerCase();
        releases = releases.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.code.toLowerCase().includes(q) ||
            r.version.toLowerCase().includes(q) ||
            (r.description && r.description.toLowerCase().includes(q))
        );
      }
    }

    // Populate dynamic health and items
    for (const r of releases) {
      r.items = await this.getReleaseItems(r.id);
      const computed = await this.calculateReleaseHealth(r);
      r.health = computed.health;
      r.healthFactors = computed.healthFactors;
      r.completionProgress = computed.completionProgress;
      r.itemCounts = computed.itemCounts;
    }

    return releases.sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());
  },

  async findById(id: string): Promise<Release | null> {
    seedDefaultReleases();
    let release: Release | null = null;
    if (isDbConnected()) {
      try {
        const res = await query(
          `SELECT id, code, name, version, product_id as "productId",
                  project_id as "projectId", owner_id as "ownerId",
                  status, release_date as "releaseDate", actual_release_date as "actualReleaseDate",
                  health, description, created_by as "createdBy",
                  updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
           FROM releases
           WHERE id = $1`,
          [id]
        );
        if (res.rows.length > 0) release = res.rows[0];
      } catch (err) {
        console.warn('DB error in ReleaseRepository.findById:', err);
      }
    }
    if (!release) {
      release = memoryReleases.get(id) || null;
    }
    if (release) {
      release.items = await this.getReleaseItems(release.id);
      const computed = await this.calculateReleaseHealth(release);
      release.health = computed.health;
      release.healthFactors = computed.healthFactors;
      release.completionProgress = computed.completionProgress;
      release.itemCounts = computed.itemCounts;
    }
    return release;
  },

  async create(data: Partial<Release>): Promise<Release> {
    seedDefaultReleases();
    const id = data.id || `rel_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const count = memoryReleases.size + 101;
    const code = data.code || `REL-${count}`;

    const newRelease: Release = {
      id,
      code,
      name: data.name || 'Untitled Release',
      version: data.version || 'v1.0.0',
      productId: data.productId,
      productName: data.productName,
      projectId: data.projectId,
      projectName: data.projectName,
      ownerId: data.ownerId || 'usr_admin_1',
      ownerName: data.ownerName || 'Admin User',
      status: (data.status as ReleaseStatus) || 'Planned',
      releaseDate: data.releaseDate || new Date().toISOString().split('T')[0],
      actualReleaseDate: data.actualReleaseDate,
      health: (data.health as ReleaseHealth) || 'On Track',
      description: data.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: data.createdBy || 'system',
      updatedBy: data.updatedBy || 'system',
    };

    memoryReleases.set(id, newRelease);

    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO releases (
            id, code, name, version, product_id, project_id,
            owner_id, status, release_date, actual_release_date,
            health, description, created_by, updated_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            newRelease.id,
            newRelease.code,
            newRelease.name,
            newRelease.version,
            newRelease.productId || null,
            newRelease.projectId || null,
            newRelease.ownerId || null,
            newRelease.status,
            newRelease.releaseDate,
            newRelease.actualReleaseDate || null,
            newRelease.health,
            newRelease.description || null,
            newRelease.createdBy || null,
            newRelease.updatedBy || null,
            newRelease.createdAt,
            newRelease.updatedAt,
          ]
        );
      } catch (err) {
        console.warn('DB error inserting release:', err);
      }
    }

    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        await this.addReleaseItem(
          newRelease.id,
          item.itemType,
          item.itemId,
          item.itemCode,
          item.itemTitle,
          item.status,
          item.progress
        );
      }
    }

    newRelease.items = await this.getReleaseItems(newRelease.id);
    const computed = await this.calculateReleaseHealth(newRelease);
    newRelease.health = computed.health;
    newRelease.healthFactors = computed.healthFactors;
    newRelease.completionProgress = computed.completionProgress;
    newRelease.itemCounts = computed.itemCounts;

    return newRelease;
  },

  async update(id: string, updates: Partial<Release>): Promise<Release | null> {
    seedDefaultReleases();
    const existing = await this.findById(id);
    if (!existing) return null;

    let actualReleaseDate = updates.actualReleaseDate !== undefined ? updates.actualReleaseDate : existing.actualReleaseDate;
    if (updates.status === 'Released' && !actualReleaseDate) {
      actualReleaseDate = new Date().toISOString().split('T')[0];
    }

    const updated: Release = {
      ...existing,
      ...updates,
      actualReleaseDate,
      updatedAt: new Date().toISOString(),
    };

    memoryReleases.set(id, updated);

    if (isDbConnected()) {
      try {
        await query(
          `UPDATE releases SET
            name = $1, version = $2, product_id = $3, project_id = $4,
            owner_id = $5, status = $6, release_date = $7, actual_release_date = $8,
            health = $9, description = $10, updated_by = $11, updated_at = $12
           WHERE id = $13`,
          [
            updated.name,
            updated.version,
            updated.productId || null,
            updated.projectId || null,
            updated.ownerId || null,
            updated.status,
            updated.releaseDate,
            updated.actualReleaseDate || null,
            updated.health,
            updated.description || null,
            updated.updatedBy || null,
            updated.updatedAt,
            id,
          ]
        );
      } catch (err) {
        console.warn('DB error updating release:', err);
      }
    }

    updated.items = await this.getReleaseItems(id);
    const computed = await this.calculateReleaseHealth(updated);
    updated.health = computed.health;
    updated.healthFactors = computed.healthFactors;
    updated.completionProgress = computed.completionProgress;
    updated.itemCounts = computed.itemCounts;

    return updated;
  },

  async delete(id: string): Promise<boolean> {
    seedDefaultReleases();
    const removed = memoryReleases.delete(id);
    if (isDbConnected()) {
      try {
        await query(`DELETE FROM releases WHERE id = $1`, [id]);
        await query(`DELETE FROM release_items WHERE release_id = $1`, [id]);
      } catch (err) {
        console.warn('DB error deleting release:', err);
      }
    }
    return removed;
  },
};
