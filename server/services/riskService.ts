import { Risk, RiskCategory, RiskSeverity, RiskStatus } from '../models/types';
import { RiskRepository, calculateRiskScoreAndSeverity } from '../repositories/riskRepository';
export { calculateRiskScoreAndSeverity };
import { GovernanceLinkRepository } from '../repositories/governanceLinkRepository';
import { ActivityService } from './activityService';
import { NotificationService } from './notificationService';
import { ProjectRepository } from '../repositories/projectRepository';
import { StoryRepository } from '../repositories/storyRepository';

export const VALID_RISK_CATEGORIES: RiskCategory[] = [
  'Schedule',
  'Cost',
  'Scope',
  'Technical',
  'Resource',
  'Customer',
  'Vendor',
  'Security',
  'Quality',
  'Operational',
  'Dependency',
  'Strategic',
  'Other',
];

export const VALID_RISK_STATUSES: RiskStatus[] = [
  'Identified',
  'Assessing',
  'Mitigating',
  'Monitoring',
  'Escalated',
  'Accepted',
  'Closed',
];

export interface HeatmapCell {
  probability: number;
  impact: number;
  riskScore: number;
  severity: RiskSeverity;
  count: number;
  risks: Risk[];
}

export interface RiskHeatmapData {
  matrix: HeatmapCell[][]; // 5x5 matrix where row = probability (5 down to 1), col = impact (1 to 5)
  summary: {
    totalRisks: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    averageRiskScore: number;
    mitigatedCount: number;
    openCount: number;
  };
}

export const RiskService = {
  async getAllRisks(filter?: {
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
    return RiskRepository.findAll(filter);
  },

  async getPaginatedRisks(filter?: {
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
  }): Promise<{ risks: Risk[]; total: number; page: number; limit: number }> {
    const page = filter?.page && filter.page > 0 ? Number(filter.page) : 1;
    const limit = filter?.limit && filter.limit > 0 ? Number(filter.limit) : 25;
    const [risks, total] = await Promise.all([
      RiskRepository.findAll({ ...filter, page, limit }),
      RiskRepository.count(filter),
    ]);
    return { risks, total, page, limit };
  },

  async getRiskById(id: string): Promise<Risk | null> {
    return RiskRepository.findById(id);
  },

  async createRisk(data: Partial<Risk>, actor?: { id: string; name: string }): Promise<Risk> {
    // 1. Validate title
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
      throw new Error('Risk title is required and cannot be empty.');
    }

    // 2. Validate projectId
    if (!data.projectId || typeof data.projectId !== 'string') {
      throw new Error('Project ID is required.');
    }
    const project = await ProjectRepository.findById(data.projectId);
    if (!project) {
      throw new Error(`Referenced project with ID '${data.projectId}' does not exist.`);
    }

    // 3. Validate Probability (1-5)
    const prob = Number(data.probability);
    if (isNaN(prob) || prob < 1 || prob > 5) {
      throw new Error('Probability must be an integer between 1 and 5.');
    }

    // 4. Validate Impact (1-5)
    const imp = Number(data.impact);
    if (isNaN(imp) || imp < 1 || imp > 5) {
      throw new Error('Impact must be an integer between 1 and 5.');
    }

    // 5. Validate Status
    const status: RiskStatus = (data.status as RiskStatus) || 'Identified';
    if (!VALID_RISK_STATUSES.includes(status)) {
      throw new Error(`Invalid status '${data.status}'. Allowed: ${VALID_RISK_STATUSES.join(', ')}`);
    }

    // 6. Validate Category
    const category: RiskCategory = (data.category as RiskCategory) || 'Technical';
    if (!VALID_RISK_CATEGORIES.includes(category)) {
      throw new Error(`Invalid category '${data.category}'. Allowed: ${VALID_RISK_CATEGORIES.join(', ')}`);
    }

    // 7. Calculate riskScore and severity strictly on server (ignore any client-provided score/severity)
    const { riskScore, severity } = calculateRiskScoreAndSeverity(prob, imp);

    // Sanitize payload
    const sanitizedData: Partial<Risk> = {
      ...data,
      title: data.title.trim(),
      projectId: project.id,
      projectName: project.name,
      productId: data.productId || project.productId,
      portfolioId: data.portfolioId || project.portfolioId,
      probability: Math.round(prob),
      impact: Math.round(imp),
      riskScore,
      severity,
      status,
      category,
      createdBy: actor?.id || 'usr_admin_1',
      updatedBy: actor?.id || 'usr_admin_1',
    };

    const risk = await RiskRepository.create(sanitizedData);

    // Activity Log: Risk created
    await ActivityService.logActivity({
      entityType: 'risk',
      entityId: risk.id,
      action: 'create',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: risk.code,
        title: risk.title,
        severity: risk.severity,
        riskScore: risk.riskScore,
        probability: risk.probability,
        impact: risk.impact,
        projectId: risk.projectId,
      },
    });

    // Notification rule 1: Critical risk created
    if (risk.severity === 'Critical') {
      await NotificationService.sendNotification({
        userId: risk.ownerId || actor?.id || 'usr_admin_1',
        title: `Critical Risk Identified: [${risk.code}]`,
        message: `Critical risk "${risk.title}" (Score: ${risk.riskScore}) requires immediate mitigation review.`,
        type: 'CRITICAL_RISK_CREATED',
        link: `/PM-Portal/index.html?page=risks&id=${risk.id}`,
        isRead: false,
      });
    }

    // Notification rule 3: Risk assigned to a user (on create)
    if (risk.ownerId && risk.ownerId !== actor?.id) {
      await NotificationService.sendNotification({
        userId: risk.ownerId,
        title: `Risk Assigned: [${risk.code}]`,
        message: `You have been assigned as the owner of risk "${risk.title}" (Severity: ${risk.severity}).`,
        type: 'RISK_ASSIGNED',
        link: `/PM-Portal/index.html?page=risks&id=${risk.id}`,
        isRead: false,
      });
    }

    return risk;
  },

  async updateRisk(id: string, updates: Partial<Risk>, actor?: { id: string; name: string }): Promise<Risk | null> {
    const current = await RiskRepository.findById(id);
    if (!current) return null;

    // Validate updates if provided
    if (updates.title !== undefined) {
      if (typeof updates.title !== 'string' || !updates.title.trim()) {
        throw new Error('Risk title cannot be empty.');
      }
      updates.title = updates.title.trim();
    }

    if (updates.projectId !== undefined) {
      const project = await ProjectRepository.findById(updates.projectId);
      if (!project) {
        throw new Error(`Referenced project with ID '${updates.projectId}' does not exist.`);
      }
      updates.projectName = project.name;
    }

    let prob = current.probability;
    if (updates.probability !== undefined) {
      const p = Number(updates.probability);
      if (isNaN(p) || p < 1 || p > 5) {
        throw new Error('Probability must be an integer between 1 and 5.');
      }
      prob = Math.round(p);
      updates.probability = prob;
    }

    let imp = current.impact;
    if (updates.impact !== undefined) {
      const i = Number(updates.impact);
      if (isNaN(i) || i < 1 || i > 5) {
        throw new Error('Impact must be an integer between 1 and 5.');
      }
      imp = Math.round(i);
      updates.impact = imp;
    }

    if (updates.status !== undefined) {
      if (!VALID_RISK_STATUSES.includes(updates.status as RiskStatus)) {
        throw new Error(`Invalid status '${updates.status}'. Allowed: ${VALID_RISK_STATUSES.join(', ')}`);
      }
    }

    if (updates.category !== undefined) {
      if (!VALID_RISK_CATEGORIES.includes(updates.category as RiskCategory)) {
        throw new Error(`Invalid category '${updates.category}'. Allowed: ${VALID_RISK_CATEGORIES.join(', ')}`);
      }
    }

    // Always recalculate riskScore & severity from probability and impact (ignore client-provided values)
    const { riskScore, severity } = calculateRiskScoreAndSeverity(prob, imp);
    updates.riskScore = riskScore;
    updates.severity = severity;
    updates.updatedBy = actor?.id || 'usr_admin_1';

    const updated = await RiskRepository.update(id, updates);
    if (!updated) return null;

    // Activity Logging:
    const statusChanged = updates.status !== undefined && updates.status !== current.status;
    const severityChanged = updated.severity !== current.severity;

    if (statusChanged) {
      await ActivityService.logActivity({
        entityType: 'risk',
        entityId: updated.id,
        action: 'status_change',
        actorId: actor?.id || 'usr_admin_1',
        actorName: actor?.name || 'Admin User',
        details: {
          code: updated.code,
          from: current.status,
          to: updated.status,
        },
      });
    }

    if (severityChanged) {
      await ActivityService.logActivity({
        entityType: 'risk',
        entityId: updated.id,
        action: 'severity_change',
        actorId: actor?.id || 'usr_admin_1',
        actorName: actor?.name || 'Admin User',
        details: {
          code: updated.code,
          from: current.severity,
          to: updated.severity,
          riskScore: updated.riskScore,
        },
      });
    }

    // General update log if neither status nor severity alone captured the full change
    if (!statusChanged && !severityChanged) {
      await ActivityService.logActivity({
        entityType: 'risk',
        entityId: updated.id,
        action: 'update',
        actorId: actor?.id || 'usr_admin_1',
        actorName: actor?.name || 'Admin User',
        details: {
          code: updated.code,
          title: updated.title,
          status: updated.status,
          severity: updated.severity,
        },
      });
    }

    // Notification rule 2: Existing risk becomes Critical
    if (updated.severity === 'Critical' && current.severity !== 'Critical') {
      await NotificationService.sendNotification({
        userId: updated.ownerId || actor?.id || 'usr_admin_1',
        title: `Risk Escalated to Critical: [${updated.code}]`,
        message: `Risk "${updated.title}" has escalated to Critical severity (Score: ${updated.riskScore}).`,
        type: 'RISK_ESCALATED',
        link: `/PM-Portal/index.html?page=risks&id=${updated.id}`,
        isRead: false,
      });
    }

    // Notification rule 3: Risk assigned to a user (owner changed)
    if (updates.ownerId && updates.ownerId !== current.ownerId) {
      await NotificationService.sendNotification({
        userId: updates.ownerId,
        title: `Risk Assigned: [${updated.code}]`,
        message: `You have been assigned as the owner of risk "${updated.title}" (Severity: ${updated.severity}).`,
        type: 'RISK_ASSIGNED',
        link: `/PM-Portal/index.html?page=risks&id=${updated.id}`,
        isRead: false,
      });
    }

    return updated;
  },

  async deleteRisk(id: string, actor?: { id: string; name: string }): Promise<boolean> {
    const current = await RiskRepository.findById(id);
    if (!current) return false;

    const deleted = await RiskRepository.delete(id);
    if (deleted) {
      // Activity Log: Risk deleted
      await ActivityService.logActivity({
        entityType: 'risk',
        entityId: id,
        action: 'delete',
        actorId: actor?.id || 'usr_admin_1',
        actorName: actor?.name || 'Admin User',
        details: { code: current.code, title: current.title, projectId: current.projectId },
      });
    }
    return deleted;
  },

  async getHeatmap(filter?: { projectId?: string; productId?: string; status?: string }): Promise<RiskHeatmapData> {
    const risks = await RiskRepository.findAll(filter);

    // Initialize 5x5 grid (rows: prob 5 down to 1; cols: impact 1 to 5)
    const matrix: HeatmapCell[][] = [];
    for (let p = 5; p >= 1; p--) {
      const row: HeatmapCell[] = [];
      for (let i = 1; i <= 5; i++) {
        const { riskScore, severity } = calculateRiskScoreAndSeverity(p, i);
        row.push({
          probability: p,
          impact: i,
          riskScore,
          severity,
          count: 0,
          risks: [],
        });
      }
      matrix.push(row);
    }

    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let totalScoreSum = 0;
    let mitigatedCount = 0;
    let openCount = 0;

    for (const r of risks) {
      totalScoreSum += r.riskScore;
      if (r.severity === 'Critical') criticalCount++;
      else if (r.severity === 'High') highCount++;
      else if (r.severity === 'Medium') mediumCount++;
      else lowCount++;

      if (r.status === 'Closed' || r.status === 'Mitigating') mitigatedCount++;
      if (r.status !== 'Closed') openCount++;

      const rowIndex = 5 - r.probability; // prob 5 -> 0, prob 1 -> 4
      const colIndex = r.impact - 1;      // imp 1 -> 0, imp 5 -> 4
      if (matrix[rowIndex] && matrix[rowIndex][colIndex]) {
        matrix[rowIndex][colIndex].count++;
        matrix[rowIndex][colIndex].risks.push(r);
      }
    }

    const averageRiskScore = risks.length > 0 ? Number((totalScoreSum / risks.length).toFixed(1)) : 0;

    return {
      matrix,
      summary: {
        totalRisks: risks.length,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        averageRiskScore,
        mitigatedCount,
        openCount,
      },
    };
  },

  /**
   * Bridges V1.1 Risk Engine audits into V2
   * Analyzes project health, stories, resource coverage and generates automated risk assessment
   */
  async runProjectAuditScan(projectId: string, actor?: { id: string; name: string }): Promise<{
    projectId: string;
    flags: Array<{ id: string; label: string; desc: string; severity: RiskSeverity; points: number }>;
    totalPoints: number;
    recommendedSeverity: RiskSeverity;
    generatedRisks: Risk[];
  }> {
    const project = await ProjectRepository.findById(projectId);
    const stories = await StoryRepository.findAll({ projectId });
    const existingRisks = await RiskRepository.findAll({ projectId });

    const flags: Array<{ id: string; label: string; desc: string; severity: RiskSeverity; points: number }> = [];
    let totalPoints = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Overdue Project Check
    if (project && project.status !== 'completed' && project.targetDate && project.targetDate < todayStr && (project.progress || 0) < 100) {
      flags.push({
        id: 'OVERDUE_PROJECT',
        label: 'Overdue Project Schedule ⚠️',
        desc: `Target delivery date (${project.targetDate}) is past due with incomplete progress (${project.progress}%).`,
        severity: 'Critical',
        points: 20,
      });
      totalPoints += 20;
    }

    // 2. Overdue Stories
    const overdueStories = stories.filter((s) => s.status !== 'done' && s.targetDate && s.targetDate < todayStr);
    if (overdueStories.length > 0) {
      flags.push({
        id: 'OVERDUE_STORIES',
        label: 'Overdue Backlog Stories ⚠️',
        desc: `${overdueStories.length} backlog stories are overdue delivery in active sprints.`,
        severity: overdueStories.length >= 3 ? 'High' : 'Medium',
        points: 15,
      });
      totalPoints += 15;
    }

    // 3. Unmitigated High Severity Existing Risks
    const unmitigated = existingRisks.filter((r) => (r.severity === 'Critical' || r.severity === 'High') && r.status === 'Identified');
    if (unmitigated.length > 0) {
      flags.push({
        id: 'UNMITIGATED_RISKS',
        label: 'Unmitigated Critical/High Risks ⚠️',
        desc: `${unmitigated.length} risks have no approved mitigation strategy.`,
        severity: 'Critical',
        points: 25,
      });
      totalPoints += 25;
    }

    let recommendedSeverity: RiskSeverity = 'Low';
    if (totalPoints >= 40) recommendedSeverity = 'Critical';
    else if (totalPoints >= 25) recommendedSeverity = 'High';
    else if (totalPoints >= 10) recommendedSeverity = 'Medium';

    return {
      projectId,
      flags,
      totalPoints,
      recommendedSeverity,
      generatedRisks: existingRisks,
    };
  },
};

