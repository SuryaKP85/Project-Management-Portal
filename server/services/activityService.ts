import { ActivityRepository } from '../repositories/activityRepository';
import { ActivityAction, ActivityEntityType, ActivityLog } from '../models/types';
import crypto from 'crypto';

export const ActivityService = {
  async getRecentActivities(limit = 50): Promise<ActivityLog[]> {
    return ActivityRepository.findRecent(limit);
  },

  async getEntityActivities(entityType: string, entityId: string): Promise<ActivityLog[]> {
    return ActivityRepository.findByEntity(entityType, entityId);
  },

  async logActivity(data: {
    entityType: ActivityEntityType;
    entityId: string;
    action: ActivityAction;
    actorId: string;
    actorName: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }): Promise<ActivityLog> {
    const log: ActivityLog = {
      id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      actorId: data.actorId,
      actorName: data.actorName,
      details: data.details || {},
      ipAddress: data.ipAddress,
      createdAt: new Date().toISOString(),
    };
    return ActivityRepository.create(log);
  },
};
