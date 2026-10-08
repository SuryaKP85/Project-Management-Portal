import { withoutClientIdentity } from '../repositories/recordConflict';
import { Release, ReleaseItem } from '../models/types';
import { ReleaseRepository } from '../repositories/releaseRepository';
import { ActivityService } from './activityService';
import { NotificationService } from './notificationService';
import { notifiableUser, ownerOrCaller, requireActor } from './followThroughSupport';

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
    const who = requireActor(actor); // Sprint 24: the authenticated caller, never a demo user
    // Sprint 24: the owner is the chosen user or the caller — always an existing, active user.
    const owner = await ownerOrCaller(data.ownerId, who.id);
    const release = await ReleaseRepository.create({
      ...withoutClientIdentity(data),
      ownerId: owner?.id,
      ownerName: owner?.name,
      createdBy: who.id,
      updatedBy: who.id,
    });

    await ActivityService.logActivity({
      entityType: 'release',
      entityId: release.id,
      action: 'create',
      actorId: who.id,
      actorName: who.name,
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
    const who = requireActor(actor); // Sprint 24: the authenticated caller, never a demo user
    const current = await ReleaseRepository.findById(id);
    if (!current) return null;

    const updated = await ReleaseRepository.update(id, {
      ...updates,
      updatedBy: who.id,
    });
    if (!updated) return null;

    let action: any = 'updated';
    if (updates.status === 'Released') action = 'released';
    if (updates.releaseDate && updates.releaseDate > current.releaseDate) action = 'delayed';

    await ActivityService.logActivity({
      entityType: 'release',
      entityId: updated.id,
      action,
      actorId: who.id,
      actorName: who.name,
      details: {
        code: updated.code,
        previousDate: current.releaseDate,
        newDate: updated.releaseDate,
        previousStatus: current.status,
        newStatus: updated.status,
        health: updated.health,
      },
    });

    // Sprint 24: only to an existing, active recipient.
    const recipient = action === 'delayed' || updated.health === 'Off Track' ? await notifiableUser(updated.ownerId) : undefined;
    if (recipient) {
      await NotificationService.sendNotification({
        userId: recipient,
        title: `Release Milestone Shifted: [${updated.code}]`,
        message: `Release "${updated.name}" (${updated.version}) target scheduled for ${updated.releaseDate}.`,
        type: 'release_delayed',
        link: `/pm-portal/index.html?view=governance&tab=releases&id=${updated.id}`,
        isRead: false,
      });
    }

    return updated;
  },

  async deleteRelease(id: string, actor?: { id: string; name: string }): Promise<boolean> {
    const who = requireActor(actor); // Sprint 24: the authenticated caller, never a demo user
    const current = await ReleaseRepository.findById(id);
    if (!current) return false;

    const deleted = await ReleaseRepository.delete(id);
    if (deleted) {
      await ActivityService.logActivity({
        entityType: 'release',
        entityId: id,
        action: 'delete',
        actorId: who.id,
        actorName: who.name,
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
