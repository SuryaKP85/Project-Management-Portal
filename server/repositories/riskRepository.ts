import { Risk, RiskCategory, RiskSeverity, RiskStatus } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { GovernanceLinkRepository } from './governanceLinkRepository';

export function calculateRiskScoreAndSeverity(probability: number, impact: number): { riskScore: number; severity: RiskSeverity } {
  const prob = Math.max(1, Math.min(5, Math.round(Number(probability) || 1)));
  const imp = Math.max(1, Math.min(5, Math.round(Number(impact) || 1)));
  const riskScore = prob * imp;
  let severity: RiskSeverity = 'Low';
  if (riskScore >= 17) severity = 'Critical';
  else if (riskScore >= 10) severity = 'High';
  else if (riskScore >= 5) severity = 'Medium';
  return { riskScore, severity };
}

const memoryRisks: Map<string, Risk> = new Map();

function seedDefaultRisks() {
  if (memoryRisks.size > 0) return;
  const defaults: Risk[] = [
    {
      id: 'rsk_1',
      code: 'RSK-101',
      title: 'Radiation-Hardened FPGA Thermal Throttling Under Continuous Load',
      description: 'Under peak sub-orbital ascent maneuvers, internal FPGA thermal dissipation limits may exceed 85°C, causing clock desynchronization with RTOS timer ticks.',
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
      category: 'Technical',
      probability: 4,
      impact: 5,
      riskScore: 20,
      severity: 'Critical',
      status: 'Mitigating',
      mitigation: 'Implement dynamic frequency scaling microcode patch and supplementary beryllium heatsink bracket.',
      contingencyPlan: 'Switch to redundant secondary radiation-hardened core if junction thermal exceeds 82°C threshold.',
      trigger: 'Telemetry sensor 4B reports thermocouple telemetry > 78°C during pre-stage vacuum tests.',
      targetResolutionDate: '2026-10-15',
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-09-06T12:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_admin_1',
    },
    {
      id: 'rsk_2',
      code: 'RSK-102',
      title: 'Cryogenic Solenoid Valve Actuation Lag in Low Ambient Pressure',
      description: 'Vendor Lot #44B cryogenic solenoids exhibit a 18ms mechanical response hysteresis when chilled below 90K in vacuum chamber chamber tests.',
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
      category: 'Vendor',
      probability: 4,
      impact: 4,
      riskScore: 16,
      severity: 'High',
      status: 'Assessing',
      mitigation: 'Procure accelerated secondary sample batch from Aerospace Dynamics Inc. and modify pre-charge pulse width in firmware.',
      contingencyPlan: 'Incorporate software-based lead-time predictive feedforward pulse compensator.',
      trigger: 'Pressure transducer variance delta > 3.5 bar during cryogenic manifold cold-flow cycles.',
      targetResolutionDate: '2026-09-30',
      createdAt: '2026-08-05T09:00:00Z',
      updatedAt: '2026-09-04T16:00:00Z',
      createdBy: 'usr_pm_2',
      updatedBy: 'usr_pm_2',
    },
    {
      id: 'rsk_3',
      code: 'RSK-103',
      title: 'Flight Qualification Lead-Time Supply Delay for MIL-STD-1553 Bus Couplers',
      description: 'Global lead-time backlog on military-grade avionics bus couplers increased from 8 weeks to 18 weeks due to titanium shielding material shortages.',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      teamId: 'team_2',
      teamName: 'Frontend Systems & UI',
      category: 'Schedule',
      probability: 3,
      impact: 4,
      riskScore: 12,
      severity: 'High',
      status: 'Escalated',
      mitigation: 'Issue priority government defense procurement certificate DX-rating expedite request.',
      contingencyPlan: 'Qualify commercial-off-the-shelf dual-channel optocoupler equivalent with conformal silicone dip coat.',
      trigger: 'Supplier formal PO confirmation slip beyond target delivery window of Oct 10, 2026.',
      targetResolutionDate: '2026-10-10',
      createdAt: '2026-08-12T11:00:00Z',
      updatedAt: '2026-09-05T08:00:00Z',
      createdBy: 'usr_pm_2',
      updatedBy: 'usr_pm_2',
    },
    {
      id: 'rsk_4',
      code: 'RSK-104',
      title: 'Real-Time Telemetry Buffer Overflow During Dense Sensor Bursts',
      description: 'At 1000Hz sampling rates on 32 concurrent channels, memory ring-buffer may encounter starvation if telemetry uplink downlink frame drops occur.',
      projectId: 'PRJ-103',
      projectName: 'NextGen Avionics Suite',
      productId: 'prod_2',
      productName: 'Titan Mission Control Cloud',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      ownerId: 'usr_dev_1',
      ownerName: 'Sarah Chen',
      teamId: 'team_2',
      teamName: 'Frontend Systems & UI',
      category: 'Technical',
      probability: 2,
      impact: 4,
      riskScore: 8,
      severity: 'Medium',
      status: 'Monitoring',
      mitigation: 'Introduce lossless run-length Huffman compression algorithm on sensor streams prior to buffer push.',
      contingencyPlan: 'Implement prioritized packet dropping dropping non-safety diagnostics in low-throughput regimes.',
      trigger: 'Buffer utilization metric breaches 85% high-watermark on continuous 60s benchmark test.',
      targetResolutionDate: '2026-11-01',
      createdAt: '2026-08-15T15:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
      createdBy: 'usr_dev_1',
      updatedBy: 'usr_dev_1',
    },
    {
      id: 'rsk_5',
      code: 'RSK-105',
      title: 'Secondary Power Distribution Unit Transient Surge Voltage Ripple',
      description: 'During main engine cutoff staging, inductive flyback transient might exceed ±2.5V safe envelope on digital logic buses.',
      projectId: 'PRJ-104',
      projectName: 'Orbital Insertion Guidance OS',
      productId: 'prod_2',
      productName: 'Titan Mission Control Cloud',
      portfolioId: 'port_2',
      portfolioName: 'Commercial Launch Services',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      teamId: 'team_3',
      teamName: 'Quality & Mission Assurance',
      category: 'Quality',
      probability: 2,
      impact: 2,
      riskScore: 4,
      severity: 'Low',
      status: 'Identified',
      mitigation: 'Add bidirectional TVS clamping diodes to relay coils on all stage harness branches.',
      contingencyPlan: 'Install isolated DC-DC regulator with 1500V galvanic isolation barrier.',
      trigger: 'Oscilloscope trace reveals ripple > 1.8V peak-to-peak during solenoid bench discharge.',
      targetResolutionDate: '2026-11-20',
      createdAt: '2026-08-20T14:00:00Z',
      updatedAt: '2026-08-20T14:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_admin_1',
    },
  ];
  for (const r of defaults) {
    memoryRisks.set(r.id, r);
  }
}

seedDefaultRisks();

export const RiskRepository = {
  async findAll(filter?: {
    projectId?: string;
    productId?: string;
    portfolioId?: string;
    ownerId?: string;
    category?: string;
    severity?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<Risk[]> {
    seedDefaultRisks();
    let risks: Risk[] = [];

    const page = filter?.page && filter.page > 0 ? Number(filter.page) : undefined;
    const limit = filter?.limit && filter.limit > 0 ? Number(filter.limit) : undefined;
    const offset = page && limit ? (page - 1) * limit : 0;

    if (isDbConnected()) {
      try {
        let queryStr = `
          SELECT id, code, title, description, project_id as "projectId",
                 product_id as "productId", portfolio_id as "portfolioId",
                 owner_id as "ownerId", team_id as "teamId", category,
                 probability, impact, risk_score as "riskScore", severity,
                 status, mitigation, contingency_plan as "contingencyPlan",
                 trigger, target_resolution_date as "targetResolutionDate",
                 created_by as "createdBy", updated_by as "updatedBy",
                 created_at as "createdAt", updated_at as "updatedAt"
          FROM risks
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
        if (filter?.portfolioId) {
          queryStr += ` AND portfolio_id = $${pIndex++}`;
          params.push(filter.portfolioId);
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
        if (filter?.status && filter.status !== 'all') {
          queryStr += ` AND status = $${pIndex++}`;
          params.push(filter.status);
        }
        if (filter?.search) {
          queryStr += ` AND (title ILIKE $${pIndex} OR code ILIKE $${pIndex} OR description ILIKE $${pIndex})`;
          params.push(`%${filter.search}%`);
          pIndex++;
        }
        queryStr += ` ORDER BY risk_score DESC, created_at DESC`;

        if (limit !== undefined) {
          queryStr += ` LIMIT $${pIndex++} OFFSET $${pIndex++}`;
          params.push(limit, offset);
        }

        const res = await query(queryStr, params);
        risks = res.rows;
      } catch (err) {
        console.warn('DB error in RiskRepository.findAll, fallback to memory:', err);
        risks = Array.from(memoryRisks.values());
      }
    } else {
      risks = Array.from(memoryRisks.values());
    }

    if (!isDbConnected() && filter) {
      if (filter.projectId) risks = risks.filter((r) => r.projectId === filter.projectId);
      if (filter.productId) risks = risks.filter((r) => r.productId === filter.productId);
      if (filter.portfolioId) risks = risks.filter((r) => r.portfolioId === filter.portfolioId);
      if (filter.ownerId) risks = risks.filter((r) => r.ownerId === filter.ownerId);
      if (filter.category && filter.category !== 'all') risks = risks.filter((r) => r.category.toLowerCase() === filter.category!.toLowerCase());
      if (filter.severity && filter.severity !== 'all') risks = risks.filter((r) => r.severity.toLowerCase() === filter.severity!.toLowerCase());
      if (filter.status && filter.status !== 'all') risks = risks.filter((r) => r.status.toLowerCase() === filter.status!.toLowerCase());
      if (filter.search) {
        const q = filter.search.toLowerCase();
        risks = risks.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.code.toLowerCase().includes(q) ||
            (r.description && r.description.toLowerCase().includes(q))
        );
      }
      risks.sort((a, b) => b.riskScore - a.riskScore);
      if (limit !== undefined) {
        risks = risks.slice(offset, offset + limit);
      }
    }

    // Attach linked items
    for (const r of risks) {
      r.linkedItems = await GovernanceLinkRepository.getLinksFor('risk', r.id);
    }

    return risks;
  },

  async count(filter?: {
    projectId?: string;
    productId?: string;
    portfolioId?: string;
    ownerId?: string;
    category?: string;
    severity?: string;
    status?: string;
    search?: string;
  }): Promise<number> {
    seedDefaultRisks();
    if (isDbConnected()) {
      try {
        let queryStr = `SELECT COUNT(*)::int as count FROM risks WHERE 1=1`;
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
        if (filter?.portfolioId) {
          queryStr += ` AND portfolio_id = $${pIndex++}`;
          params.push(filter.portfolioId);
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
        if (filter?.status && filter.status !== 'all') {
          queryStr += ` AND status = $${pIndex++}`;
          params.push(filter.status);
        }
        if (filter?.search) {
          queryStr += ` AND (title ILIKE $${pIndex} OR code ILIKE $${pIndex} OR description ILIKE $${pIndex})`;
          params.push(`%${filter.search}%`);
          pIndex++;
        }

        const res = await query(queryStr, params);
        return res.rows[0]?.count || 0;
      } catch (err) {
        console.warn('DB error in RiskRepository.count:', err);
      }
    }

    let risks = Array.from(memoryRisks.values());
    if (filter) {
      if (filter.projectId) risks = risks.filter((r) => r.projectId === filter.projectId);
      if (filter.productId) risks = risks.filter((r) => r.productId === filter.productId);
      if (filter.portfolioId) risks = risks.filter((r) => r.portfolioId === filter.portfolioId);
      if (filter.ownerId) risks = risks.filter((r) => r.ownerId === filter.ownerId);
      if (filter.category && filter.category !== 'all') risks = risks.filter((r) => r.category.toLowerCase() === filter.category!.toLowerCase());
      if (filter.severity && filter.severity !== 'all') risks = risks.filter((r) => r.severity.toLowerCase() === filter.severity!.toLowerCase());
      if (filter.status && filter.status !== 'all') risks = risks.filter((r) => r.status.toLowerCase() === filter.status!.toLowerCase());
      if (filter.search) {
        const q = filter.search.toLowerCase();
        risks = risks.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.code.toLowerCase().includes(q) ||
            (r.description && r.description.toLowerCase().includes(q))
        );
      }
    }
    return risks.length;
  },

  async findById(id: string): Promise<Risk | null> {
    seedDefaultRisks();
    let risk: Risk | null = null;
    if (isDbConnected()) {
      try {
        const res = await query(
          `SELECT id, code, title, description, project_id as "projectId",
                  product_id as "productId", portfolio_id as "portfolioId",
                  owner_id as "ownerId", team_id as "teamId", category,
                  probability, impact, risk_score as "riskScore", severity,
                  status, mitigation, contingency_plan as "contingencyPlan",
                  trigger, target_resolution_date as "targetResolutionDate",
                  created_by as "createdBy", updated_by as "updatedBy",
                  created_at as "createdAt", updated_at as "updatedAt"
           FROM risks
           WHERE id = $1`,
          [id]
        );
        if (res.rows.length > 0) risk = res.rows[0];
      } catch (err) {
        console.warn('DB error in RiskRepository.findById:', err);
      }
    }
    if (!risk) {
      risk = memoryRisks.get(id) || null;
    }
    if (risk) {
      risk.linkedItems = await GovernanceLinkRepository.getLinksFor('risk', risk.id);
    }
    return risk;
  },

  async create(data: Partial<Risk>): Promise<Risk> {
    seedDefaultRisks();
    const id = data.id || `rsk_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const count = memoryRisks.size + 101;
    const code = data.code || `RSK-${count}`;
    const { riskScore, severity } = calculateRiskScoreAndSeverity(data.probability || 3, data.impact || 3);

    const newRisk: Risk = {
      id,
      code,
      title: data.title || 'Untitled Risk',
      description: data.description || '',
      projectId: data.projectId || 'PRJ-101',
      projectName: data.projectName || '',
      productId: data.productId,
      productName: data.productName,
      portfolioId: data.portfolioId,
      portfolioName: data.portfolioName,
      ownerId: data.ownerId || 'usr_admin_1',
      ownerName: data.ownerName || 'Admin User',
      teamId: data.teamId,
      teamName: data.teamName,
      category: (data.category as RiskCategory) || 'Technical',
      probability: Math.max(1, Math.min(5, Number(data.probability) || 3)),
      impact: Math.max(1, Math.min(5, Number(data.impact) || 3)),
      riskScore,
      severity,
      status: (data.status as RiskStatus) || 'Identified',
      mitigation: data.mitigation || '',
      contingencyPlan: data.contingencyPlan || '',
      trigger: data.trigger || '',
      targetResolutionDate: data.targetResolutionDate || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: data.createdBy || 'system',
      updatedBy: data.updatedBy || 'system',
    };

    memoryRisks.set(id, newRisk);

    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO risks (
            id, code, title, description, project_id, product_id, portfolio_id,
            owner_id, team_id, category, probability, impact, risk_score,
            severity, status, mitigation, contingency_plan, trigger,
            target_resolution_date, created_by, updated_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
          [
            newRisk.id,
            newRisk.code,
            newRisk.title,
            newRisk.description || null,
            newRisk.projectId,
            newRisk.productId || null,
            newRisk.portfolioId || null,
            newRisk.ownerId || null,
            newRisk.teamId || null,
            newRisk.category,
            newRisk.probability,
            newRisk.impact,
            newRisk.riskScore,
            newRisk.severity,
            newRisk.status,
            newRisk.mitigation || null,
            newRisk.contingencyPlan || null,
            newRisk.trigger || null,
            newRisk.targetResolutionDate || null,
            newRisk.createdBy || null,
            newRisk.updatedBy || null,
            newRisk.createdAt,
            newRisk.updatedAt,
          ]
        );
      } catch (err) {
        console.warn('DB error inserting risk:', err);
      }
    }

    if (data.linkedItems && data.linkedItems.length > 0) {
      for (const item of data.linkedItems) {
        await GovernanceLinkRepository.addLink(
          'risk',
          newRisk.id,
          item.targetType,
          item.targetId,
          item.targetCode,
          item.targetName
        );
      }
      newRisk.linkedItems = await GovernanceLinkRepository.getLinksFor('risk', newRisk.id);
    }

    return newRisk;
  },

  async update(id: string, updates: Partial<Risk>): Promise<Risk | null> {
    seedDefaultRisks();
    const existing = await this.findById(id);
    if (!existing) return null;

    const prob = updates.probability !== undefined ? Number(updates.probability) : existing.probability;
    const imp = updates.impact !== undefined ? Number(updates.impact) : existing.impact;
    const { riskScore, severity } = calculateRiskScoreAndSeverity(prob, imp);

    const updated: Risk = {
      ...existing,
      ...updates,
      probability: Math.max(1, Math.min(5, prob)),
      impact: Math.max(1, Math.min(5, imp)),
      riskScore,
      severity,
      updatedAt: new Date().toISOString(),
    };

    memoryRisks.set(id, updated);

    if (isDbConnected()) {
      try {
        await query(
          `UPDATE risks SET
            title = $1, description = $2, project_id = $3, product_id = $4,
            portfolio_id = $5, owner_id = $6, team_id = $7, category = $8,
            probability = $9, impact = $10, risk_score = $11, severity = $12,
            status = $13, mitigation = $14, contingency_plan = $15, trigger = $16,
            target_resolution_date = $17, updated_by = $18, updated_at = $19
           WHERE id = $20`,
          [
            updated.title,
            updated.description || null,
            updated.projectId,
            updated.productId || null,
            updated.portfolioId || null,
            updated.ownerId || null,
            updated.teamId || null,
            updated.category,
            updated.probability,
            updated.impact,
            updated.riskScore,
            updated.severity,
            updated.status,
            updated.mitigation || null,
            updated.contingencyPlan || null,
            updated.trigger || null,
            updated.targetResolutionDate || null,
            updated.updatedBy || null,
            updated.updatedAt,
            id,
          ]
        );
      } catch (err) {
        console.warn('DB error updating risk:', err);
      }
    }

    if (updates.linkedItems) {
      await GovernanceLinkRepository.replaceLinks('risk', id, updates.linkedItems);
      updated.linkedItems = await GovernanceLinkRepository.getLinksFor('risk', id);
    }

    return updated;
  },

  async delete(id: string): Promise<boolean> {
    seedDefaultRisks();
    const removed = memoryRisks.delete(id);
    if (isDbConnected()) {
      try {
        await query(`DELETE FROM risks WHERE id = $1`, [id]);
        await query(`DELETE FROM governance_links WHERE governance_type = 'risk' AND governance_id = $1`, [id]);
      } catch (err) {
        console.warn('DB error deleting risk:', err);
      }
    }
    return removed;
  },
};
