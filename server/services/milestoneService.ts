import { Milestone } from '../models/types';
import { MilestoneRepository } from '../repositories/milestoneRepository';
import { GovernanceLinkRepository } from '../repositories/governanceLinkRepository';
import { ActivityService } from './activityService';
import { NotificationService } from './notificationService';

export const MilestoneService = {
  async getAllMilestones(filter?: {
    projectId?: string;
    productId?: string;
    ownerId?: string;
    status?: string;
    health?: string;
    type?: string;
    search?: string;
  }): Promise<Milestone[]> {
    const list = await MilestoneRepository.findAll(filter);
    // dynamically compute progress/health based on linked features/stories
    for (const m of list) {
      const derived = await MilestoneRepository.computeDerivedProgressAndHealth(m);
      m.progress = derived.progress;
      m.health = derived.health;
      if (m.status !== 'Cancelled') {
        m.status = derived.status;
      }
    }
    return list;
  },

  async getMilestoneById(id: string): Promise<Milestone | null> {
    const m = await MilestoneRepository.findById(id);
    if (!m) return null;
    const derived = await MilestoneRepository.computeDerivedProgressAndHealth(m);
    m.progress = derived.progress;
    m.health = derived.health;
    if (m.status !== 'Cancelled') {
      m.status = derived.status;
    }
    return m;
  },

  async createMilestone(data: Partial<Milestone>, actor?: { id: string; name: string }): Promise<Milestone> {
    const milestone = await MilestoneRepository.create({
      ...data,
      createdBy: actor?.id || 'usr_admin_1',
      updatedBy: actor?.id || 'usr_admin_1',
    });

    await ActivityService.logActivity({
      entityType: 'milestone',
      entityId: milestone.id,
      action: 'created',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: milestone.code,
        name: milestone.name,
        targetDate: milestone.targetDate,
        type: milestone.type,
      },
    });

    return milestone;
  },

  async updateMilestone(id: string, updates: Partial<Milestone>, actor?: { id: string; name: string }): Promise<Milestone | null> {
    const current = await MilestoneRepository.findById(id);
    if (!current) return null;

    const updated = await MilestoneRepository.update(id, {
      ...updates,
      updatedBy: actor?.id || 'usr_admin_1',
    });
    if (!updated) return null;

    let action: any = 'updated';
    if (updates.status === 'Completed') action = 'completed';
    if (updates.targetDate && updates.targetDate > current.targetDate) action = 'delayed';

    await ActivityService.logActivity({
      entityType: 'milestone',
      entityId: updated.id,
      action,
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: updated.code,
        previousTargetDate: current.targetDate,
        newTargetDate: updated.targetDate,
        previousStatus: current.status,
        newStatus: updated.status,
      },
    });

    // Notify if milestone missed or delayed
    if (action === 'delayed' || updated.status === 'Missed' || updated.health === 'Critical') {
      await NotificationService.sendNotification({
        userId: updated.ownerId || 'usr_admin_1',
        title: `Milestone Delayed: [${updated.code}]`,
        message: `Milestone "${updated.name}" delivery date moved to ${updated.targetDate}.`,
        type: 'MILESTONE_MISSED',
        link: `/pm-portal/index.html?view=governance&tab=milestones&id=${updated.id}`,
        isRead: false,
      });
    }

    return updated;
  },

  async deleteMilestone(id: string, actor?: { id: string; name: string }): Promise<boolean> {
    const current = await MilestoneRepository.findById(id);
    if (!current) return false;

    const deleted = await MilestoneRepository.delete(id);
    if (deleted) {
      await ActivityService.logActivity({
        entityType: 'milestone',
        entityId: id,
        action: 'deleted',
        actorId: actor?.id || 'usr_admin_1',
        actorName: actor?.name || 'Admin User',
        details: { code: current.code, name: current.name },
      });
    }
    return deleted;
  },

  async linkItem(
    milestoneId: string,
    targetType: any,
    targetId: string,
    targetCode?: string,
    targetName?: string
  ) {
    return GovernanceLinkRepository.addLink('milestone', milestoneId, targetType, targetId, targetCode, targetName);
  },

  async unlinkItem(linkId: string) {
    return GovernanceLinkRepository.removeLink(linkId);
  },
};
