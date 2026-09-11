import { Issue, IssueSeverity, IssuePriority, IssueStatus, RootCauseCategory } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { GovernanceLinkRepository } from './governanceLinkRepository';

const memoryIssues: Map<string, Issue> = new Map();

function seedDefaultIssues() {
  if (memoryIssues.size > 0) return;
  const defaults: Issue[] = [
    {
      id: 'iss_1',
      code: 'ISS-101',
      title: 'CAN-Aerospace Bus Latency Spike During Burst Telemetry Transmission',
      description: 'Periodic CAN bus frame arbitration collision delays sensor packets by 45ms, breaching the 20ms real-time constraint for attitude control loops.',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      reportedBy: 'usr_admin_1',
      reportedByName: 'Surya Prashanth',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      assigneeId: 'usr_dev_1',
      assigneeName: 'Sarah Chen',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      category: 'Technical',
      severity: 'Critical',
      priority: 'Urgent',
      status: 'Investigating',
      rootCauseCategory: 'Technical',
      rootCauseNotes: 'Hardware interrupt service routine (ISR) priority mask inversion under multi-core RTOS thread contention.',
      resolution: 'Refactor bus interrupt handler into non-blocking deferred procedure call (DPC) queue with dedicated RTOS thread.',
      reportedDate: '2026-08-10',
      targetResolutionDate: '2026-09-18',
      createdAt: '2026-08-10T14:00:00Z',
      updatedAt: '2026-09-06T10:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_dev_1',
    },
    {
      id: 'iss_2',
      code: 'ISS-102',
      title: 'Cryogenic Manifold Pressure Sensor Zero-Drift at Cryo Temperature',
      description: 'Sensor channel PT-302 drifts +1.8% below 100K during chilled liquid nitrogen pre-conditioning runs.',
      projectId: 'PRJ-102',
      projectName: 'Titan Cryogenic Propulsion Telemetry',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      reportedBy: 'usr_pm_2',
      reportedByName: 'Alex Morgan',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      assigneeId: 'usr_dev_1',
      assigneeName: 'Sarah Chen',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      category: 'Technical',
      severity: 'High',
      priority: 'High',
      status: 'In Progress',
      rootCauseCategory: 'Environment',
      rootCauseNotes: 'Thermal coefficient of piezoresistive element requires non-linear polynomial calibration table.',
      resolution: 'Deploy 5th-order polynomial thermal compensation lookup table in telemetry processing firmware.',
      reportedDate: '2026-08-18',
      targetResolutionDate: '2026-09-25',
      createdAt: '2026-08-18T09:00:00Z',
      updatedAt: '2026-09-05T16:00:00Z',
      createdBy: 'usr_pm_2',
      updatedBy: 'usr_dev_1',
    },
    {
      id: 'iss_3',
      code: 'ISS-103',
      title: 'Ground Station Downlink CRC Checksum Mismatch Under Ionospheric Scintillation',
      description: 'S-band simulated channel exhibits sporadic bit-flips leading to dropped frame rate > 0.5% in high attenuation scenarios.',
      projectId: 'PRJ-103',
      projectName: 'NextGen Avionics Suite',
      productId: 'prod_2',
      productName: 'Titan Mission Control Cloud',
      reportedBy: 'usr_pm_2',
      reportedByName: 'Alex Morgan',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      assigneeId: 'usr_admin_1',
      assigneeName: 'Surya Prashanth',
      teamId: 'team_2',
      teamName: 'Frontend Systems & UI',
      category: 'Quality',
      severity: 'Medium',
      priority: 'Medium',
      status: 'Open',
      rootCauseCategory: 'Technical',
      rootCauseNotes: 'Reed-Solomon FEC interleaving depth insufficient for prolonged burst noise.',
      resolution: 'Increase convolutional interleaver depth from 16 to 32 frames.',
      reportedDate: '2026-08-22',
      targetResolutionDate: '2026-10-05',
      createdAt: '2026-08-22T11:00:00Z',
      updatedAt: '2026-08-22T11:00:00Z',
      createdBy: 'usr_pm_2',
      updatedBy: 'usr_pm_2',
    },
    {
      id: 'iss_4',
      code: 'ISS-104',
      title: 'Memory Leak in Stage Separation Pyro Simulation Test Loop',
      description: 'Test harness worker processes accumulate 15MB RAM per 1000 simulated separation triggers without releasing socket handles.',
      projectId: 'PRJ-104',
      projectName: 'Orbital Insertion Guidance OS',
      productId: 'prod_2',
      productName: 'Titan Mission Control Cloud',
      reportedBy: 'usr_admin_1',
      reportedByName: 'Surya Prashanth',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      assigneeId: 'usr_dev_1',
      assigneeName: 'Sarah Chen',
      teamId: 'team_3',
      teamName: 'Quality & Mission Assurance',
      category: 'Process',
      severity: 'Low',
      priority: 'Low',
      status: 'Resolved',
      rootCauseCategory: 'Process',
      rootCauseNotes: 'Mock event emitter listeners were not unbound on test teardown.',
      resolution: 'Added explicit listener detachment in mocha/jest afterEach block.',
      reportedDate: '2026-08-01',
      targetResolutionDate: '2026-08-15',
      resolvedDate: '2026-08-12T16:00:00Z',
      resolvedAt: '2026-08-12T16:00:00Z',
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-12T16:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_dev_1',
    },
  ];
  for (const i of defaults) {
    memoryIssues.set(i.id, i);
  }
}

seedDefaultIssues();

export const IssueRepository = {
  async findAll(filter?: {
    projectId?: string;
    productId?: string;
    assigneeId?: string;
    ownerId?: string;
    category?: string;
    severity?: string;
    priority?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<Issue[]> {
    seedDefaultIssues();
    let issues: Issue[] = [];

    const page = filter?.page && filter.page > 0 ? Number(filter.page) : undefined;
    const limit = filter?.limit && filter.limit > 0 ? Number(filter.limit) : undefined;
    const offset = page && limit ? (page - 1) * limit : 0;

    if (isDbConnected()) {
      try {
        let queryStr = `
          SELECT id, code, title, description, project_id as "projectId",
                 product_id as "productId", reported_by as "reportedBy", owner_id as "ownerId",
                 assignee_id as "assigneeId", team_id as "teamId", category,
                 severity, priority, status, root_cause_category as "rootCauseCategory",
                 root_cause_notes as "rootCauseNotes", resolution,
                 reported_date as "reportedDate", target_resolution_date as "targetResolutionDate",
                 resolved_date as "resolvedDate", resolved_date as "resolvedAt", created_by as "createdBy",
                 updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
          FROM issues
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
        if (filter?.assigneeId) {
          queryStr += ` AND assignee_id = $${pIndex++}`;
          params.push(filter.assigneeId);
        }
        if (filter?.ownerId) {
          queryStr += ` AND owner_id = $${pIndex++}`;
          params.push(filter.ownerId);
        }
        if (filter?.category && filter.category !== 'all') {
          queryStr += ` AND category = $${pIndex++}`;
          params.push(filter.category);
        }
        if (filter?.severity && filter.severity !== 'all') {
          queryStr += ` AND severity = $${pIndex++}`;
          params.push(filter.severity);
        }
        if (filter?.priority && filter.priority !== 'all') {
          queryStr += ` AND priority = $${pIndex++}`;
          params.push(filter.priority);
        }
        if (filter?.status && filter.status !== 'all') {
          queryStr += ` AND status = $${pIndex++}`;
          params.push(filter.status);
        }
        if (filter?.search) {
          queryStr += ` AND (title ILIKE $${pIndex} OR code ILIKE $${pIndex} OR description ILIKE $${pIndex} OR root_cause_notes ILIKE $${pIndex})`;
          params.push(`%${filter.search}%`);
          pIndex++;
        }
        queryStr += ` ORDER BY CASE severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 ELSE 5 END, created_at DESC`;

        if (limit !== undefined) {
          queryStr += ` LIMIT $${pIndex++} OFFSET $${pIndex++}`;
          params.push(limit, offset);
        }

        const res = await query(queryStr, params);
        issues = res.rows;
      } catch (err) {
        console.warn('DB error in IssueRepository.findAll, fallback to memory:', err);
        issues = Array.from(memoryIssues.values());
      }
    } else {
      issues = Array.from(memoryIssues.values());
    }

    if (!isDbConnected() && filter) {
      if (filter.projectId) issues = issues.filter((i) => i.projectId === filter.projectId);
      if (filter.productId) issues = issues.filter((i) => i.productId === filter.productId);
      if (filter.assigneeId) issues = issues.filter((i) => i.assigneeId === filter.assigneeId);
      if (filter.ownerId) issues = issues.filter((i) => i.ownerId === filter.ownerId);
      if (filter.category && filter.category !== 'all') issues = issues.filter((i) => i.category.toLowerCase() === filter.category!.toLowerCase());
      if (filter.severity && filter.severity !== 'all') issues = issues.filter((i) => i.severity.toLowerCase() === filter.severity!.toLowerCase());
      if (filter.priority && filter.priority !== 'all') issues = issues.filter((i) => i.priority.toLowerCase() === filter.priority!.toLowerCase());
      if (filter.status && filter.status !== 'all') issues = issues.filter((i) => i.status.toLowerCase() === filter.status!.toLowerCase());
      if (filter.search) {
        const q = filter.search.toLowerCase();
        issues = issues.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.code.toLowerCase().includes(q) ||
            (i.description && i.description.toLowerCase().includes(q)) ||
            (i.rootCauseNotes && i.rootCauseNotes.toLowerCase().includes(q))
        );
      }
      const sevOrder: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
      issues.sort((a, b) => (sevOrder[a.severity.toLowerCase()] || 5) - (sevOrder[b.severity.toLowerCase()] || 5));
      if (limit !== undefined) {
        issues = issues.slice(offset, offset + limit);
      }
    }

    // Attach linked items and ensure resolvedAt is populated
    for (const i of issues) {
      if (!i.resolvedAt && i.resolvedDate) i.resolvedAt = i.resolvedDate;
      if (!i.resolvedDate && i.resolvedAt) i.resolvedDate = i.resolvedAt;
      i.linkedItems = await GovernanceLinkRepository.getLinksFor('issue', i.id);
    }

    return issues;
  },

  async count(filter?: {
    projectId?: string;
    productId?: string;
    assigneeId?: string;
    ownerId?: string;
    category?: string;
    severity?: string;
    priority?: string;
    status?: string;
    search?: string;
  }): Promise<number> {
    seedDefaultIssues();
    if (isDbConnected()) {
      try {
        let queryStr = `SELECT COUNT(*)::int as count FROM issues WHERE 1=1`;
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
        if (filter?.assigneeId) {
          queryStr += ` AND assignee_id = $${pIndex++}`;
          params.push(filter.assigneeId);
        }
        if (filter?.ownerId) {
          queryStr += ` AND owner_id = $${pIndex++}`;
          params.push(filter.ownerId);
        }
        if (filter?.category && filter.category !== 'all') {
          queryStr += ` AND category = $${pIndex++}`;
          params.push(filter.category);
        }
        if (filter?.severity && filter.severity !== 'all') {
          queryStr += ` AND severity = $${pIndex++}`;
          params.push(filter.severity);
        }
        if (filter?.priority && filter.priority !== 'all') {
          queryStr += ` AND priority = $${pIndex++}`;
          params.push(filter.priority);
        }
        if (filter?.status && filter.status !== 'all') {
          queryStr += ` AND status = $${pIndex++}`;
          params.push(filter.status);
        }
        if (filter?.search) {
          queryStr += ` AND (title ILIKE $${pIndex} OR code ILIKE $${pIndex} OR description ILIKE $${pIndex} OR root_cause_notes ILIKE $${pIndex})`;
          params.push(`%${filter.search}%`);
          pIndex++;
        }

        const res = await query(queryStr, params);
        return res.rows[0]?.count || 0;
      } catch (err) {
        console.warn('DB error in IssueRepository.count:', err);
      }
    }

    let issues = Array.from(memoryIssues.values());
    if (filter) {
      if (filter.projectId) issues = issues.filter((i) => i.projectId === filter.projectId);
      if (filter.productId) issues = issues.filter((i) => i.productId === filter.productId);
      if (filter.assigneeId) issues = issues.filter((i) => i.assigneeId === filter.assigneeId);
      if (filter.ownerId) issues = issues.filter((i) => i.ownerId === filter.ownerId);
      if (filter.category && filter.category !== 'all') issues = issues.filter((i) => i.category.toLowerCase() === filter.category!.toLowerCase());
      if (filter.severity && filter.severity !== 'all') issues = issues.filter((i) => i.severity.toLowerCase() === filter.severity!.toLowerCase());
      if (filter.priority && filter.priority !== 'all') issues = issues.filter((i) => i.priority.toLowerCase() === filter.priority!.toLowerCase());
      if (filter.status && filter.status !== 'all') issues = issues.filter((i) => i.status.toLowerCase() === filter.status!.toLowerCase());
      if (filter.search) {
        const q = filter.search.toLowerCase();
        issues = issues.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.code.toLowerCase().includes(q) ||
            (i.description && i.description.toLowerCase().includes(q)) ||
            (i.rootCauseNotes && i.rootCauseNotes.toLowerCase().includes(q))
        );
      }
    }
    return issues.length;
  },

  async findPaginated(filter?: {
    projectId?: string;
    productId?: string;
    assigneeId?: string;
    ownerId?: string;
    category?: string;
    severity?: string;
    priority?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ issues: Issue[]; total: number; page: number; limit: number }> {
    const page = filter?.page && filter.page > 0 ? Number(filter.page) : 1;
    const limit = filter?.limit && filter.limit > 0 ? Number(filter.limit) : 10;

    const [total, issues] = await Promise.all([
      this.count(filter),
      this.findAll({ ...filter, page, limit }),
    ]);

    return { issues, total, page, limit };
  },

  async findById(id: string): Promise<Issue | null> {
    seedDefaultIssues();
    let issue: Issue | null = null;
    if (isDbConnected()) {
      try {
        const res = await query(
          `SELECT id, code, title, description, project_id as "projectId",
                  product_id as "productId", reported_by as "reportedBy", owner_id as "ownerId",
                  assignee_id as "assigneeId", team_id as "teamId", category,
                  severity, priority, status, root_cause_category as "rootCauseCategory",
                  root_cause_notes as "rootCauseNotes", resolution,
                  reported_date as "reportedDate", target_resolution_date as "targetResolutionDate",
                  resolved_date as "resolvedDate", resolved_date as "resolvedAt", created_by as "createdBy",
                  updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
           FROM issues
           WHERE id = $1`,
          [id]
        );
        if (res.rows.length > 0) issue = res.rows[0];
      } catch (err) {
        console.warn('DB error in IssueRepository.findById:', err);
      }
    }
    if (!issue) {
      issue = memoryIssues.get(id) || null;
    }
    if (issue) {
      if (!issue.resolvedAt && issue.resolvedDate) issue.resolvedAt = issue.resolvedDate;
      if (!issue.resolvedDate && issue.resolvedAt) issue.resolvedDate = issue.resolvedAt;
      issue.linkedItems = await GovernanceLinkRepository.getLinksFor('issue', issue.id);
    }
    return issue;
  },

  async create(data: Partial<Issue>): Promise<Issue> {
    seedDefaultIssues();
    const id = data.id || `iss_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const count = memoryIssues.size + 101;
    const code = data.code || `ISS-${count}`;
    const resolvedTimestamp = data.resolvedAt || data.resolvedDate || (data.status === 'Resolved' || data.status === 'Closed' ? new Date().toISOString() : undefined);

    const newIssue: Issue = {
      id,
      code,
      title: data.title || 'Untitled Issue',
      description: data.description || '',
      projectId: data.projectId || 'PRJ-101',
      projectName: data.projectName || '',
      productId: data.productId,
      productName: data.productName,
      reportedBy: data.reportedBy || data.createdBy || 'usr_admin_1',
      reportedByName: data.reportedByName,
      ownerId: data.ownerId || 'usr_admin_1',
      ownerName: data.ownerName || 'Admin User',
      assigneeId: data.assigneeId,
      assigneeName: data.assigneeName,
      teamId: data.teamId,
      teamName: data.teamName,
      category: data.category || 'Technical',
      severity: (data.severity as IssueSeverity) || 'Medium',
      priority: (data.priority as IssuePriority) || 'Medium',
      status: (data.status as IssueStatus) || 'Open',
      rootCauseCategory: data.rootCauseCategory as RootCauseCategory,
      rootCauseNotes: data.rootCauseNotes || '',
      resolution: data.resolution || '',
      reportedDate: data.reportedDate || new Date().toISOString().split('T')[0],
      targetResolutionDate: data.targetResolutionDate || '',
      resolvedDate: resolvedTimestamp,
      resolvedAt: resolvedTimestamp,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: data.createdBy || 'system',
      updatedBy: data.updatedBy || 'system',
    };

    memoryIssues.set(id, newIssue);

    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO issues (
            id, code, title, description, project_id, product_id,
            reported_by, owner_id, assignee_id, team_id, category, severity, priority,
            status, root_cause_category, root_cause_notes, resolution,
            reported_date, target_resolution_date, resolved_date,
            created_by, updated_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
          [
            newIssue.id,
            newIssue.code,
            newIssue.title,
            newIssue.description || null,
            newIssue.projectId,
            newIssue.productId || null,
            newIssue.reportedBy || null,
            newIssue.ownerId || null,
            newIssue.assigneeId || null,
            newIssue.teamId || null,
            newIssue.category,
            newIssue.severity,
            newIssue.priority,
            newIssue.status,
            newIssue.rootCauseCategory || null,
            newIssue.rootCauseNotes || null,
            newIssue.resolution || null,
            newIssue.reportedDate,
            newIssue.targetResolutionDate || null,
            newIssue.resolvedDate || null,
            newIssue.createdBy || null,
            newIssue.updatedBy || null,
            newIssue.createdAt,
            newIssue.updatedAt,
          ]
        );
      } catch (err) {
        console.warn('DB error inserting issue:', err);
      }
    }

    if (data.linkedItems && data.linkedItems.length > 0) {
      for (const item of data.linkedItems) {
        await GovernanceLinkRepository.addLink(
          'issue',
          newIssue.id,
          item.targetType,
          item.targetId,
          item.targetCode,
          item.targetName
        );
      }
      newIssue.linkedItems = await GovernanceLinkRepository.getLinksFor('issue', newIssue.id);
    }

    return newIssue;
  },

  async update(id: string, updates: Partial<Issue>): Promise<Issue | null> {
    seedDefaultIssues();
    const existing = await this.findById(id);
    if (!existing) return null;

    let resolvedDate = updates.resolvedAt || updates.resolvedDate || existing.resolvedDate;
    if (updates.status === 'Resolved' || updates.status === 'Closed') {
      if (!resolvedDate) resolvedDate = new Date().toISOString();
    } else if (updates.status) {
      resolvedDate = undefined;
    }

    const updated: Issue = {
      ...existing,
      ...updates,
      resolvedDate,
      resolvedAt: resolvedDate,
      updatedAt: new Date().toISOString(),
    };

    memoryIssues.set(id, updated);

    if (isDbConnected()) {
      try {
        await query(
          `UPDATE issues SET
            title = $1, description = $2, project_id = $3, product_id = $4,
            reported_by = $5, owner_id = $6, assignee_id = $7, team_id = $8, category = $9,
            severity = $10, priority = $11, status = $12, root_cause_category = $13,
            root_cause_notes = $14, resolution = $15, reported_date = $16,
            target_resolution_date = $17, resolved_date = $18, updated_by = $19, updated_at = $20
           WHERE id = $21`,
          [
            updated.title,
            updated.description || null,
            updated.projectId,
            updated.productId || null,
            updated.reportedBy || null,
            updated.ownerId || null,
            updated.assigneeId || null,
            updated.teamId || null,
            updated.category,
            updated.severity,
            updated.priority,
            updated.status,
            updated.rootCauseCategory || null,
            updated.rootCauseNotes || null,
            updated.resolution || null,
            updated.reportedDate,
            updated.targetResolutionDate || null,
            updated.resolvedDate || null,
            updated.updatedBy || null,
            updated.updatedAt,
            id,
          ]
        );
      } catch (err) {
        console.warn('DB error updating issue:', err);
      }
    }

    if (updates.linkedItems) {
      await GovernanceLinkRepository.replaceLinks('issue', id, updates.linkedItems);
      updated.linkedItems = await GovernanceLinkRepository.getLinksFor('issue', id);
    }

    return updated;
  },

  async delete(id: string): Promise<boolean> {
    seedDefaultIssues();
    const removed = memoryIssues.delete(id);
    if (isDbConnected()) {
      try {
        await query(`DELETE FROM issues WHERE id = $1`, [id]);
        await query(`DELETE FROM governance_links WHERE governance_type = 'issue' AND governance_id = $1`, [id]);
      } catch (err) {
        console.warn('DB error deleting issue:', err);
      }
    }
    return removed;
  },
};
