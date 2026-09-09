import { PortfolioRepository } from '../repositories/portfolioRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { NotificationRepository } from '../repositories/notificationRepository';
import { Portfolio, SafeUser } from '../models/types';
import crypto from 'crypto';

export const PortfolioService = {
  async getAllPortfolios(): Promise<Portfolio[]> {
    return PortfolioRepository.findAll();
  },

  async getPortfolioById(id: string): Promise<Portfolio | null> {
    return PortfolioRepository.findById(id);
  },

  async createPortfolio(data: Partial<Portfolio>, actorUser: SafeUser): Promise<Portfolio> {
    const created = await PortfolioRepository.create(data);

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'portfolio',
      entityId: created.id,
      action: 'create',
      actorId: actorUser.id,
      actorName: `${actorUser.firstName} ${actorUser.lastName}`,
      details: {
        code: created.code,
        name: created.name,
        health: created.health,
        status: created.status,
      },
      createdAt: new Date().toISOString(),
    });

    if (created.ownerId && created.ownerId !== actorUser.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: created.ownerId,
        title: 'Portfolio Leadership Assignment',
        message: `You have been assigned as leader of portfolio ${created.name}.`,
        type: 'ownership_change',
        isRead: false,
        link: `/PM-Portal/index.html#portfolios`,
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updatePortfolio(id: string, updates: Partial<Portfolio>, actorUser: SafeUser): Promise<Portfolio | null> {
    const existing = await PortfolioRepository.findById(id);
    if (!existing) return null;

    const updated = await PortfolioRepository.update(id, updates);
    if (updated) {
      const isStatusChange = updates.status && updates.status !== existing.status;
      const isHealthChange = updates.health && updates.health !== existing.health;

      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'portfolio',
        entityId: id,
        action: isStatusChange ? 'status_change' : 'update',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { previousStatus: existing.status, ...updates },
        createdAt: new Date().toISOString(),
      });

      if (isHealthChange && updates.health === 'critical' && existing.ownerId) {
        await NotificationRepository.create({
          id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: existing.ownerId,
          title: 'Portfolio Critical Health Alert',
          message: `Portfolio ${existing.name} has entered Critical health status.`,
          type: 'risk_alert',
          isRead: false,
          link: `/PM-Portal/index.html#portfolios`,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return updated;
  },

  async deletePortfolio(id: string, actorUser: SafeUser): Promise<boolean> {
    const existing = await PortfolioRepository.findById(id);
    if (!existing) return false;

    const success = await PortfolioRepository.delete(id);
    if (success) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'portfolio',
        entityId: id,
        action: 'delete',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { name: existing.name, code: existing.code },
        createdAt: new Date().toISOString(),
      });
    }
    return success;
  },
};
