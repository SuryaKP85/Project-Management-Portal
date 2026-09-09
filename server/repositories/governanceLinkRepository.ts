import { GovernanceLink, GovernanceLinkTargetType } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryLinks: Map<string, GovernanceLink> = new Map();

function seedDefaultLinks() {
  if (memoryLinks.size > 0) return;
  const defaults: GovernanceLink[] = [
    // Risk 1 links (Ares Guidance IMU calibration slip)
    {
      id: 'glink_1',
      governanceType: 'risk',
      governanceId: 'rsk_1',
      targetType: 'feature',
      targetId: 'feat_1',
      targetCode: 'FEAT-101',
      targetName: 'Quaternion Inertial State Estimation',
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'glink_2',
      governanceType: 'risk',
      governanceId: 'rsk_1',
      targetType: 'sprint',
      targetId: 'sprint_1',
      targetCode: 'SPR-101',
      targetName: 'Sprint 12 - GN&C Baseline & RTOS Integration',
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'glink_3',
      governanceType: 'risk',
      governanceId: 'rsk_1',
      targetType: 'milestone',
      targetId: 'mls_1',
      targetCode: 'MLS-101',
      targetName: 'Sub-Orbital Guidance Certification',
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'glink_4',
      governanceType: 'risk',
      governanceId: 'rsk_1',
      targetType: 'release',
      targetId: 'rel_1',
      targetCode: 'REL-101',
      targetName: 'Ares Flight OS v2.0-Alpha',
      createdAt: '2026-08-01T10:00:00Z',
    },
    // Issue 1 links (CAN Bus latency spike)
    {
      id: 'glink_5',
      governanceType: 'issue',
      governanceId: 'iss_1',
      targetType: 'task',
      targetId: 'task_1',
      targetCode: 'TSK-101',
      targetName: 'Derive 6-DOF Quaternion Matrix Filter',
      createdAt: '2026-08-10T14:00:00Z',
    },
    {
      id: 'glink_6',
      governanceType: 'issue',
      governanceId: 'iss_1',
      targetType: 'story',
      targetId: 'story_1',
      targetCode: 'STR-101',
      targetName: 'Attitude Matrix Computation in RTOS',
      createdAt: '2026-08-10T14:00:00Z',
    },
    {
      id: 'glink_7',
      governanceType: 'issue',
      governanceId: 'iss_1',
      targetType: 'sprint',
      targetId: 'sprint_1',
      targetCode: 'SPR-101',
      targetName: 'Sprint 12 - GN&C Baseline & RTOS Integration',
      createdAt: '2026-08-10T14:00:00Z',
    },
    // Milestone 1 links (Features/Epics)
    {
      id: 'glink_8',
      governanceType: 'milestone',
      governanceId: 'mls_1',
      targetType: 'feature',
      targetId: 'feat_1',
      targetCode: 'FEAT-101',
      targetName: 'Quaternion Inertial State Estimation',
      createdAt: '2026-07-20T08:00:00Z',
    },
    {
      id: 'glink_9',
      governanceType: 'milestone',
      governanceId: 'mls_1',
      targetType: 'epic',
      targetId: 'epic_1',
      targetCode: 'EPC-101',
      targetName: 'Ares Flight Guidance Core',
      createdAt: '2026-07-20T08:00:00Z',
    },
  ];
  for (const l of defaults) {
    memoryLinks.set(l.id, l);
  }
}

seedDefaultLinks();

export const GovernanceLinkRepository = {
  async getLinksFor(governanceType: string, governanceId: string): Promise<GovernanceLink[]> {
    seedDefaultLinks();
    if (isDbConnected()) {
      try {
        const res = await query(
          `SELECT id, governance_type as "governanceType", governance_id as "governanceId",
                  target_type as "targetType", target_id as "targetId", target_code as "targetCode",
                  target_name as "targetName", created_at as "createdAt"
           FROM governance_links
           WHERE governance_type = $1 AND governance_id = $2
           ORDER BY created_at ASC`,
          [governanceType, governanceId]
        );
        return res.rows;
      } catch (err) {
        console.warn('DB error fetching governance links, using memory:', err);
      }
    }
    return Array.from(memoryLinks.values()).filter(
      (l) => l.governanceType === governanceType && l.governanceId === governanceId
    );
  },

  async getBacklinks(targetType: GovernanceLinkTargetType, targetId: string): Promise<GovernanceLink[]> {
    seedDefaultLinks();
    if (isDbConnected()) {
      try {
        const res = await query(
          `SELECT id, governance_type as "governanceType", governance_id as "governanceId",
                  target_type as "targetType", target_id as "targetId", target_code as "targetCode",
                  target_name as "targetName", created_at as "createdAt"
           FROM governance_links
           WHERE target_type = $1 AND target_id = $2
           ORDER BY created_at ASC`,
          [targetType, targetId]
        );
        return res.rows;
      } catch (err) {
        console.warn('DB error fetching governance backlinks, using memory:', err);
      }
    }
    return Array.from(memoryLinks.values()).filter(
      (l) => l.targetType === targetType && l.targetId === targetId
    );
  },

  async addLink(
    governanceType: 'risk' | 'issue' | 'dependency' | 'milestone' | 'release',
    governanceId: string,
    targetType: GovernanceLinkTargetType,
    targetId: string,
    targetCode?: string,
    targetName?: string
  ): Promise<GovernanceLink> {
    seedDefaultLinks();
    // Check if already exists
    const existing = Array.from(memoryLinks.values()).find(
      (l) =>
        l.governanceType === governanceType &&
        l.governanceId === governanceId &&
        l.targetType === targetType &&
        l.targetId === targetId
    );
    if (existing) return existing;

    const id = `glink_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const newLink: GovernanceLink = {
      id,
      governanceType,
      governanceId,
      targetType,
      targetId,
      targetCode,
      targetName,
      createdAt: new Date().toISOString(),
    };
    memoryLinks.set(id, newLink);

    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO governance_links (id, governance_type, governance_id, target_type, target_id, target_code, target_name, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, governanceType, governanceId, targetType, targetId, targetCode || null, targetName || null, newLink.createdAt]
        );
      } catch (err) {
        console.warn('DB error inserting governance link:', err);
      }
    }
    return newLink;
  },

  async removeLink(id: string): Promise<boolean> {
    seedDefaultLinks();
    const removed = memoryLinks.delete(id);
    if (isDbConnected()) {
      try {
        await query(`DELETE FROM governance_links WHERE id = $1`, [id]);
      } catch (err) {
        console.warn('DB error removing governance link:', err);
      }
    }
    return removed;
  },

  async replaceLinks(
    governanceType: 'risk' | 'issue' | 'dependency' | 'milestone' | 'release',
    governanceId: string,
    targets: Array<{ targetType: GovernanceLinkTargetType; targetId: string; targetCode?: string; targetName?: string }>
  ): Promise<GovernanceLink[]> {
    seedDefaultLinks();
    // Remove existing
    for (const [id, link] of memoryLinks.entries()) {
      if (link.governanceType === governanceType && link.governanceId === governanceId) {
        memoryLinks.delete(id);
      }
    }
    if (isDbConnected()) {
      try {
        await query(
          `DELETE FROM governance_links WHERE governance_type = $1 AND governance_id = $2`,
          [governanceType, governanceId]
        );
      } catch (err) {
        console.warn('DB error clearing governance links:', err);
      }
    }

    const created: GovernanceLink[] = [];
    for (const t of targets) {
      const link = await this.addLink(governanceType, governanceId, t.targetType, t.targetId, t.targetCode, t.targetName);
      created.push(link);
    }
    return created;
  },
};
