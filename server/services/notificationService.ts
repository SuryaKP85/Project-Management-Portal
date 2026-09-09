import { NotificationRepository } from '../repositories/notificationRepository';
import { Notification } from '../models/types';
import crypto from 'crypto';

export const NotificationService = {
  async getUserNotifications(userId: string, unreadOnly = false): Promise<Notification[]> {
    return NotificationRepository.findByUserId(userId, unreadOnly);
  },

  async sendNotification(data: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification> {
    const notif: Notification = {
      ...data,
      id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      createdAt: new Date().toISOString(),
    };
    return NotificationRepository.create(notif);
  },

  async markAsRead(id: string, userId: string): Promise<boolean> {
    return NotificationRepository.markAsRead(id, userId);
  },

  async markAllAsRead(userId: string): Promise<number> {
    return NotificationRepository.markAllAsRead(userId);
  },
};
