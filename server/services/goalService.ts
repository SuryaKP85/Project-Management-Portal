import { GoalRepository } from '../repositories/goalRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { NotificationRepository } from '../repositories/notificationRepository';
import { Goal, SafeUser } from '../models/types';
import crypto from 'crypto';

export const GoalService = {
  async getAllGoals(): Promise<Goal[]> {
    return GoalRepository.findAll();
  },

  async getGoalById(id: string): Promise<Goal | null> {
    return GoalRepository.findById(id);
  },

  async createGoal(data: Partial<Goal>, actorUser: SafeUser): Promise<Goal> {
    const created = await GoalRepository.create(data);

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'goal',
      entityId: created.id,
      action: 'create',
      actorId: actorUser.id,
      actorName: `${actorUser.firstName} ${actorUser.lastName}`,
      details: {
        objective: created.objective,
        targetValue: created.targetValue,
        unit: created.unit,
        portfolioId: created.portfolioId,
        productId: created.productId,
      },
      createdAt: new Date().toISOString(),
    });

    if (created.ownerId && created.ownerId !== actorUser.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: created.ownerId,
        title: 'Goal / OKR Assigned',
        message: `You have been assigned as owner for objective: ${created.objective}`,
        type: 'task_assigned',
        isRead: false,
        link: `/PM-Portal/index.html#portfolios`,
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updateGoal(id: string, updates: Partial<Goal>, actorUser: SafeUser): Promise<Goal | null> {
    const existing = await GoalRepository.findById(id);
    if (!existing) return null;

    const updated = await GoalRepository.update(id, updates);
    if (updated) {
      const isStatusChange = updates.status && updates.status !== existing.status;
      const isAchieved = updates.status === 'achieved' && existing.status !== 'achieved';

      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'goal',
        entityId: id,
        action: isStatusChange ? 'status_change' : 'update',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { previousStatus: existing.status, ...updates },
        createdAt: new Date().toISOString(),
      });

      if (isAchieved && existing.ownerId) {
        await NotificationRepository.create({
          id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: existing.ownerId,
          title: 'Goal Achieved!',
          message: `Objective '${existing.objective}' has been achieved successfully!`,
          type: 'milestone_alert',
          isRead: false,
          link: `/PM-Portal/index.html#portfolios`,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return updated;
  },

  async deleteGoal(id: string, actorUser: SafeUser): Promise<boolean> {
    const existing = await GoalRepository.findById(id);
    if (!existing) return false;

    const success = await GoalRepository.delete(id);
    if (success) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'goal',
        entityId: id,
        action: 'delete',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { objective: existing.objective },
        createdAt: new Date().toISOString(),
      });
    }
    return success;
  },
};
