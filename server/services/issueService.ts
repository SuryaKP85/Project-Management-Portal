import { Issue, IssueSeverity, IssuePriority, IssueStatus, RootCauseCategory } from '../models/types';
import { IssueRepository } from '../repositories/issueRepository';
import { ActivityService } from './activityService';
import { NotificationService } from './notificationService';
import { ProjectRepository } from '../repositories/projectRepository';
import { UserRepository } from '../repositories/userRepository';

export const VALID_ISSUE_STATUSES: IssueStatus[] = [
  'Open',
  'Investigating',
  'In Progress',
  'Blocked',
  'Resolved',
  'Closed',
  'Rejected',
];

export const VALID_ISSUE_SEVERITIES: IssueSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
export const VALID_ISSUE_PRIORITIES: IssuePriority[] = ['Urgent', 'High', 'Medium', 'Low'];
export const VALID_ROOT_CAUSE_CATEGORIES: RootCauseCategory[] = [
  'Requirements',
  'Technical',
  'Process',
  'Resource',
  'Vendor',
  'Customer',
  'Environment',
  'Communication',
  'Other',
];

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required and cannot be empty.`);
  }
  return value.trim();
}

async function validateProject(projectId: unknown) {
  const id = requireNonEmptyString(projectId, 'Project ID');
  const project = await ProjectRepository.findById(id);
  if (!project) {
    throw new Error(`Referenced project with ID '${id}' does not exist.`);
  }
  return project;
}

async function validateUser(userId: unknown, field: string) {
  if (userId === undefined || userId === null || userId === '') return undefined;
  const id = requireNonEmptyString(userId, field);
  const user = await UserRepository.findById(id);
  if (!user) {
    throw new Error(`Referenced user with ID '${id}' does not exist.`);
  }
  return id;
}

function validateEnum<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback: T): T {
  const resolved = value === undefined || value === null || value === '' ? fallback : String(value) as T;
  if (!allowed.includes(resolved)) {
    throw new Error(`Invalid ${field} '${value}'. Allowed: ${allowed.join(', ')}`);
  }
  return resolved;
}

function validateDate(value: unknown, field: string, required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${field} is required.`);
    return undefined;
  }
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`${field} must be a valid date in YYYY-MM-DD format.`);
  }
  return text;
}

export const IssueService = {
  async getAllIssues(filter?: {
    projectId?: string;
    productId?: string;
    assigneeId?: string;
    ownerId?: string;
    severity?: string;
    priority?: string;
    status?: string;
    search?: string;
  }): Promise<Issue[]> {
    return IssueRepository.findAll(filter);
  },

  async getIssueById(id: string): Promise<Issue | null> {
    return IssueRepository.findById(id);
  },

  async createIssue(data: Partial<Issue>, actor?: { id: string; name: string }): Promise<Issue> {
    const title = requireNonEmptyString(data.title, 'Issue title');
    const project = await validateProject(data.projectId);
    const ownerId = await validateUser(data.ownerId, 'Owner ID');
    const assigneeId = await validateUser(data.assigneeId, 'Assignee ID');

    const status = validateEnum(data.status, VALID_ISSUE_STATUSES, 'status', 'Open');
    const severity = validateEnum(data.severity, VALID_ISSUE_SEVERITIES, 'severity', 'Medium');
    const priority = validateEnum(data.priority, VALID_ISSUE_PRIORITIES, 'priority', 'Medium');
    const category = requireNonEmptyString(data.category || 'General', 'Issue category');
    const rootCauseCategory = data.rootCauseCategory === undefined || data.rootCauseCategory === ''
      ? undefined
      : validateEnum(data.rootCauseCategory, VALID_ROOT_CAUSE_CATEGORIES, 'root cause category', 'Other');
    const reportedDate = validateDate(data.reportedDate, 'Reported date', false) || new Date().toISOString().split('T')[0];
    const targetResolutionDate = validateDate(data.targetResolutionDate, 'Target resolution date');

    if (targetResolutionDate && targetResolutionDate < reportedDate) {
      throw new Error('Target resolution date cannot be earlier than the reported date.');
    }

    const issue = await IssueRepository.create({
      ...data,
      title,
      projectId: project.id,
      projectName: project.name,
      productId: data.productId || project.productId,
      ownerId,
      assigneeId,
      status,
      severity,
      priority,
      category,
      rootCauseCategory,
      reportedDate,
      targetResolutionDate,
      createdBy: actor?.id || 'usr_admin_1',
      updatedBy: actor?.id || 'usr_admin_1',
    });

    await ActivityService.logActivity({
      entityType: 'issue',
      entityId: issue.id,
      action: 'create',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: issue.code,
        title: issue.title,
        severity: issue.severity,
        priority: issue.priority,
        projectId: issue.projectId,
      },
    });

    if (issue.assigneeId) {
      await NotificationService.sendNotification({
        userId: issue.assigneeId,
        title: `Issue Assigned: [${issue.code}]`,
        message: `You were assigned to investigate "${issue.title}" (${issue.severity} severity).`,
        type: 'issue_assigned',
        link: `/PM-Portal/index.html?view=governance&tab=issues&id=${issue.id}`,
        isRead: false,
      });
    }

    if (issue.severity === 'Critical') {
      await NotificationService.sendNotification({
        userId: issue.ownerId || actor?.id || 'usr_admin_1',
        title: `CRITICAL Issue Reported: [${issue.code}]`,
        message: `${issue.title} requires urgent root cause investigation.`,
        type: 'critical_issue',
        link: `/PM-Portal/index.html?view=governance&tab=issues&id=${issue.id}`,
        isRead: false,
      });
    }

    return issue;
  },

  async updateIssue(id: string, updates: Partial<Issue>, actor?: { id: string; name: string }): Promise<Issue | null> {
    const current = await IssueRepository.findById(id);
    if (!current) return null;

    const sanitized: Partial<Issue> = { ...updates };

    if (updates.title !== undefined) sanitized.title = requireNonEmptyString(updates.title, 'Issue title');

    if (updates.projectId !== undefined) {
      const project = await validateProject(updates.projectId);
      sanitized.projectId = project.id;
      sanitized.projectName = project.name;
    }

    if (updates.ownerId !== undefined) sanitized.ownerId = await validateUser(updates.ownerId, 'Owner ID');
    if (updates.assigneeId !== undefined) sanitized.assigneeId = await validateUser(updates.assigneeId, 'Assignee ID');

    if (updates.status !== undefined) {
      sanitized.status = validateEnum(updates.status, VALID_ISSUE_STATUSES, 'status', current.status);
    }
    if (updates.severity !== undefined) {
      sanitized.severity = validateEnum(updates.severity, VALID_ISSUE_SEVERITIES, 'severity', current.severity);
    }
    if (updates.priority !== undefined) {
      sanitized.priority = validateEnum(updates.priority, VALID_ISSUE_PRIORITIES, 'priority', current.priority);
    }
    if (updates.category !== undefined) sanitized.category = requireNonEmptyString(updates.category, 'Issue category');
    if (updates.rootCauseCategory !== undefined) {
      sanitized.rootCauseCategory = updates.rootCauseCategory === ''
        ? undefined
        : validateEnum(updates.rootCauseCategory, VALID_ROOT_CAUSE_CATEGORIES, 'root cause category', 'Other');
    }

    if (updates.reportedDate !== undefined) {
      sanitized.reportedDate = validateDate(updates.reportedDate, 'Reported date', true);
    }
    if (updates.targetResolutionDate !== undefined) {
      sanitized.targetResolutionDate = validateDate(updates.targetResolutionDate, 'Target resolution date');
    }

    const reportedDate = sanitized.reportedDate || current.reportedDate;
    const targetDate = sanitized.targetResolutionDate === undefined
      ? current.targetResolutionDate
      : sanitized.targetResolutionDate;
    if (targetDate && reportedDate && targetDate < reportedDate) {
      throw new Error('Target resolution date cannot be earlier than the reported date.');
    }

    const updated = await IssueRepository.update(id, {
      ...sanitized,
      updatedBy: actor?.id || 'usr_admin_1',
    });
    if (!updated) return null;

    const statusChanged = updates.status !== undefined && updates.status !== current.status;
    const assigneeChanged = updates.assigneeId !== undefined && updates.assigneeId !== current.assigneeId;

    let action: 'update' | 'resolve' | 'assign' = 'update';
    if (updated.status === 'Resolved' && current.status !== 'Resolved') action = 'resolve';
    else if (assigneeChanged) action = 'assign';

    await ActivityService.logActivity({
      entityType: 'issue',
      entityId: updated.id,
      action,
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: updated.code,
        previousStatus: current.status,
        newStatus: updated.status,
        previousAssignee: current.assigneeName,
        newAssignee: updated.assigneeName,
        statusChanged,
      },
    });

    if (assigneeChanged && updated.assigneeId) {
      await NotificationService.sendNotification({
        userId: updated.assigneeId,
        title: `Issue Assigned: [${updated.code}]`,
        message: `You have been assigned to "${updated.title}".`,
        type: 'issue_assigned',
        link: `/PM-Portal/index.html?view=governance&tab=issues&id=${updated.id}`,
        isRead: false,
      });
    }

    if (updated.severity === 'Critical' && current.severity !== 'Critical') {
      await NotificationService.sendNotification({
        userId: updated.ownerId || actor?.id || 'usr_admin_1',
        title: `CRITICAL Issue Escalated: [${updated.code}]`,
        message: `Issue "${updated.title}" has escalated to Critical severity and requires immediate attention.`,
        type: 'critical_issue',
        link: `/PM-Portal/index.html?view=governance&tab=issues&id=${updated.id}`,
        isRead: false,
      });
    }

    return updated;
  },

  async deleteIssue(id: string, actor?: { id: string; name: string }): Promise<boolean> {
    const current = await IssueRepository.findById(id);
    if (!current) return false;

    const deleted = await IssueRepository.delete(id);
    if (deleted) {
      await ActivityService.logActivity({
        entityType: 'issue',
        entityId: id,
        action: 'delete',
        actorId: actor?.id || 'usr_admin_1',
        actorName: actor?.name || 'Admin User',
        details: { code: current.code, title: current.title },
      });
    }
    return deleted;
  },

  async getRootCauseSummary(filter?: { projectId?: string; productId?: string }): Promise<{
    breakdown: Array<{ category: RootCauseCategory; count: number; percentage: number }>;
    totalIssues: number;
    resolvedCount: number;
    resolutionRate: number;
  }> {
    const issues = await IssueRepository.findAll(filter);
    const categoryCounts: Record<string, number> = {};

    let resolvedCount = 0;
    for (const issue of issues) {
      if (issue.status === 'Resolved' || issue.status === 'Closed') resolvedCount++;
      const cat = issue.rootCauseCategory || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }

    const totalIssues = issues.length;
    const breakdown = Object.entries(categoryCounts).map(([category, count]) => ({
      category: category as RootCauseCategory,
      count,
      percentage: totalIssues > 0 ? Math.round((count / totalIssues) * 100) : 0,
    }));

    return {
      breakdown: breakdown.sort((a, b) => b.count - a.count),
      totalIssues,
      resolvedCount,
      resolutionRate: totalIssues > 0 ? Math.round((resolvedCount / totalIssues) * 100) : 0,
    };
  },
};
