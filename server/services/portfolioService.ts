import { PortfolioRepository } from '../repositories/portfolioRepository';
import { ProjectRepository } from '../repositories/projectRepository';
import { ProductRepository } from '../repositories/productRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { NotificationRepository } from '../repositories/notificationRepository';
import { buildContainerHealth, projectsInPortfolio } from './healthRollupService';
import {
  Portfolio,
  PortfolioHealthResponse,
  SafeUser,
  DeclaredHealth,
  normalizeDeclaredHealth,
  invalidDeclaredHealthError,
} from '../models/types';
import crypto from 'crypto';

/**
 * Absent/blank health means "not supplied" (repository default applies);
 * canonical or legacy values normalise; anything else is a 400.
 */
function resolveDeclaredHealth(entity: 'portfolio' | 'product', value: unknown): DeclaredHealth | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = normalizeDeclaredHealth(value);
  if (!normalized) throw invalidDeclaredHealthError(entity, value);
  return normalized;
}

export const PortfolioService = {
  async getAllPortfolios(): Promise<Portfolio[]> {
    return PortfolioRepository.findAll();
  },

  async getPortfolioById(id: string): Promise<Portfolio | null> {
    return PortfolioRepository.findById(id);
  },

  /**
   * Sprint 11.2C — derived health for a portfolio, computed from its projects'
   * canonical ProjectHealthService results. Read-only: the stored declared
   * health is reported alongside and is never overwritten by the rollup.
   */
  async getPortfolioHealth(id: string, options: { now?: Date } = {}): Promise<PortfolioHealthResponse | null> {
    const portfolio = await PortfolioRepository.findById(id);
    if (!portfolio) return null;

    const [projects, products] = await Promise.all([ProjectRepository.findAll(), ProductRepository.findAll()]);
    const members = projectsInPortfolio(projects, products, portfolio.id);
    const built = await buildContainerHealth(members, options.now);

    return {
      portfolioId: portfolio.id,
      portfolioCode: portfolio.code,
      declaredHealth: portfolio.health,
      derivedHealth: built.derivedHealth,
      projects: built.projects,
      computedAt: (options.now ?? new Date()).toISOString(),
    };
  },

  async createPortfolio(data: Partial<Portfolio>, actorUser: SafeUser): Promise<Portfolio> {
    // Declared health is validated and canonicalised before anything is stored.
    const payload: Partial<Portfolio> = { ...data };
    const health = resolveDeclaredHealth('portfolio', data.health);
    if (health) payload.health = health;
    else delete payload.health;

    const created = await PortfolioRepository.create(payload);

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

  async updatePortfolio(id: string, rawUpdates: Partial<Portfolio>, actorUser: SafeUser): Promise<Portfolio | null> {
    const existing = await PortfolioRepository.findById(id);
    if (!existing) return null;

    // Normalise once; every downstream step (store, audit, notification)
    // sees the canonical value, never the alias the client sent.
    const updates: Partial<Portfolio> = { ...rawUpdates };
    if (rawUpdates.health !== undefined) {
      const health = resolveDeclaredHealth('portfolio', rawUpdates.health);
      if (health) updates.health = health;
      else delete updates.health;
    }

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
