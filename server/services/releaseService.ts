import { Release, ReleaseItem } from '../models/types';
import { ReleaseRepository } from '../repositories/releaseRepository';
import { ActivityService } from './activityService';
import { NotificationService } from './notificationService';

export const ReleaseService = {
  async getAllReleases(filter?: {
    projectId?: string;
    productId?: string;
    ownerId?: string;
    status?: string;
    health?: string;
    search?: string;
  }): Promise<Release[]> {
    return ReleaseRepository.findAll(filter);
  },

  async getReleaseById(id: string): Promise<Release | null> {
    return ReleaseRepository.findById(id);
  },

  async createRelease(data: Partial<Release>, actor?: { id: string; name: string }): Promise<Release> {
    const release = await ReleaseRepository.create({
      ...data,
      createdBy: actor?.id || 'usr_admin_1',
      updatedBy: actor?.id || 'usr_admin_1',
    });

    await ActivityService.logActivity({
      entityType: 'release',
      entityId: release.id,
      action: 'created',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: release.code,
        name: release.name,
        version: release.version,
        releaseDate: release.releaseDate,
        health: release.health,
      },
    });

    return release;
  },

  async updateRelease(id: string, updates: Partial<Release>, actor?: { id: string; name: string }): Promise<Release | null> {
    const current = await ReleaseRepository.findById(id);
    if (!current) return null;

    const updated = await ReleaseRepository.update(id, {
      ...updates,
      updatedBy: actor?.id || 'usr_admin_1',
    });
    if (!updated) return null;

    let action: any = 'updated';
    if (updates.status === 'Released') action = 'released';
    if (updates.releaseDate && updates.releaseDate > current.releaseDate) action = 'delayed';

    await ActivityService.logActivity({
      entityType: 'release',
      entityId: updated.id,
      action,
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: updated.code,
        previousDate: current.releaseDate,
        newDate: updated.releaseDate,
        previousStatus: current.status,
        newStatus: updated.status,
        health: updated.health,
      },
    });

    if (action === 'delayed' || updated.health === 'Off Track') {
      await NotificationService.sendNotification({
        userId: updated.ownerId || 'usr_admin_1',
        title: `Release Milestone Shifted: [${updated.code}]`,
        message: `Release "${updated.name}" (${updated.version}) target scheduled for ${updated.releaseDate}.`,
        type: 'RELEASE_DELAYED',
        link: `/pm-portal/index.html?view=governance&tab=releases&id=${updated.id}`,
        isRead: false,
      });
    }

    return updated;
  },

  async deleteRelease(id: string, actor?: { id: string; name: string }): Promise<boolean> {
    const current = await ReleaseRepository.findById(id);
    if (!current) return false;

    const deleted = await ReleaseRepository.delete(id);
    if (deleted) {
      await ActivityService.logActivity({
        entityType: 'release',
        entityId: id,
        action: 'deleted',
        actorId: actor?.id || 'usr_admin_1',
        actorName: actor?.name || 'Admin User',
        details: { code: current.code, name: current.name, version: current.version },
      });
    }
    return deleted;
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
    return ReleaseRepository.addReleaseItem(releaseId, itemType, itemId, itemCode, itemTitle, status, progress);
  },

  async removeReleaseItem(id: string): Promise<boolean> {
    return ReleaseRepository.removeReleaseItem(id);
  },
};
