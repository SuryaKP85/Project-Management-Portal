import { ProductRepository } from '../repositories/productRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { NotificationRepository } from '../repositories/notificationRepository';
import { Product, SafeUser } from '../models/types';
import crypto from 'crypto';

export const ProductService = {
  async getAllProducts(): Promise<Product[]> {
    return ProductRepository.findAll();
  },

  async getProductById(id: string): Promise<Product | null> {
    return ProductRepository.findById(id);
  },

  async createProduct(data: Partial<Product>, actorUser: SafeUser): Promise<Product> {
    const newProduct: Partial<Product> = {
      ...data,
      id: data.id || `prod_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      code: data.code || `PROD-${Date.now().toString().slice(-4)}`,
    };

    const created = await ProductRepository.create(newProduct);

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'product',
      entityId: created.id,
      action: 'create',
      actorId: actorUser.id,
      actorName: `${actorUser.firstName} ${actorUser.lastName}`,
      details: {
        code: created.code,
        name: created.name,
        status: created.status,
        health: created.health,
        portfolioId: created.portfolioId,
        teamId: created.teamId,
      },
      createdAt: new Date().toISOString(),
    });

    if (created.ownerId && created.ownerId !== actorUser.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: created.ownerId,
        title: 'Product Leadership Assigned',
        message: `You have been assigned as owner for product ${created.name}.`,
        type: 'ownership_change',
        isRead: false,
        link: `/PM-Portal/index.html#products`,
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updateProduct(id: string, updates: Partial<Product>, actorUser: SafeUser): Promise<Product | null> {
    const existing = await ProductRepository.findById(id);
    if (!existing) return null;

    const updated = await ProductRepository.update(id, updates);
    if (updated) {
      const isStatusChange = updates.status && updates.status !== existing.status;
      const isHealthChange = updates.health && updates.health !== existing.health;
      const isOwnerChange = updates.ownerId && updates.ownerId !== existing.ownerId;

      let action = 'update';
      if (isStatusChange) action = 'status_change';
      else if (isOwnerChange) action = 'owner_change';

      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'product',
        entityId: id,
        action: action as any,
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { previousStatus: existing.status, ...updates },
        createdAt: new Date().toISOString(),
      });

      if (isOwnerChange && updates.ownerId && updates.ownerId !== actorUser.id) {
        await NotificationRepository.create({
          id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: updates.ownerId,
          title: 'Product Leadership Transferred',
          message: `You are now the designated owner for product ${updated.name}.`,
          type: 'ownership_change',
          isRead: false,
          link: `/PM-Portal/index.html#products`,
          createdAt: new Date().toISOString(),
        });
      }

      if (isHealthChange && updates.health === 'critical' && existing.ownerId) {
        await NotificationRepository.create({
          id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: existing.ownerId,
          title: 'Product Critical Health Escalation',
          message: `Product ${existing.name} has been marked as Critical health.`,
          type: 'risk_alert',
          isRead: false,
          link: `/PM-Portal/index.html#products`,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return updated;
  },

  async deleteProduct(id: string, actorUser: SafeUser): Promise<boolean> {
    const existing = await ProductRepository.findById(id);
    if (!existing) return false;

    const success = await ProductRepository.delete(id);
    if (success) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'product',
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
