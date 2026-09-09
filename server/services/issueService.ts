import { Issue, IssueSeverity, RootCauseCategory } from '../models/types';
import { IssueRepository } from '../repositories/issueRepository';
import { ActivityService } from './activityService';
import { NotificationService } from './notificationService';

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
    const issue = await IssueRepository.create({
      ...data,
      createdBy: actor?.id || 'usr_admin_1',
      updatedBy: actor?.id || 'usr_admin_1',
    });

    await ActivityService.logActivity({
      entityType: 'issue',
      entityId: issue.id,
      action: 'created',
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

    // Notify assignee if assigned
    if (issue.assigneeId) {
      await NotificationService.sendNotification({
        userId: issue.assigneeId,
        title: `Issue Assigned: [${issue.code}]`,
        message: `You were assigned to investigate "${issue.title}" (${issue.severity} severity).`,
        type: 'ISSUE_ASSIGNED',
        link: `/pm-portal/index.html?view=governance&tab=issues&id=${issue.id}`,
        isRead: false,
      });
    }

    // Critical issue notification
    if (issue.severity === 'Critical') {
      await NotificationService.sendNotification({
        userId: issue.ownerId || 'usr_admin_1',
        title: `CRITICAL Defect Reported: [${issue.code}]`,
        message: `${issue.title} requires urgent root cause investigation.`,
        type: 'CRITICAL_ISSUE_OPENED',
        link: `/pm-portal/index.html?view=governance&tab=issues&id=${issue.id}`,
        isRead: false,
      });
    }

    return issue;
  },

  async updateIssue(id: string, updates: Partial<Issue>, actor?: { id: string; name: string }): Promise<Issue | null> {
    const current = await IssueRepository.findById(id);
    if (!current) return null;

    const updated = await IssueRepository.update(id, {
      ...updates,
      updatedBy: actor?.id || 'usr_admin_1',
    });
    if (!updated) return null;

    let action: any = 'updated';
    if (updates.status === 'Resolved') action = 'resolved';
    if (updates.status === 'Closed') action = 'closed';
    if (updates.assigneeId && updates.assigneeId !== current.assigneeId) action = 'assigned';

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
      },
    });

    // Notify if new assignee
    if (updates.assigneeId && updates.assigneeId !== current.assigneeId) {
      await NotificationService.sendNotification({
        userId: updates.assigneeId,
        title: `Issue Reassigned: [${updated.code}]`,
        message: `You have been assigned to "${updated.title}".`,
        type: 'ISSUE_ASSIGNED',
        link: `/pm-portal/index.html?view=governance&tab=issues&id=${updated.id}`,
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
        action: 'deleted',
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
      if (issue.status === 'Resolved' || issue.status === 'Closed') {
        resolvedCount++;
      }
      const cat = issue.rootCauseCategory || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }

    const totalIssues = issues.length;
    const breakdown = Object.entries(categoryCounts).map(([category, count]) => ({
      category: category as RootCauseCategory,
      count,
      percentage: totalIssues > 0 ? Math.round((count / totalIssues) * 100) : 0,
    }));

    const resolutionRate = totalIssues > 0 ? Math.round((resolvedCount / totalIssues) * 100) : 0;

    return {
      breakdown: breakdown.sort((a, b) => b.count - a.count),
      totalIssues,
      resolvedCount,
      resolutionRate,
    };
  },
};
