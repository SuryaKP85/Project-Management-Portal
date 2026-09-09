import { Notification } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryNotifications: Notification[] = [
  {
    id: 'notif_1',
    userId: 'usr_admin_1',
    title: 'Executive SOW Alert',
    message: 'Orion Life Support Automation is awaiting executive SOW sign-off.',
    type: 'approval_request',
    isRead: false,
    link: '/PM-Portal/index.html#projects',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'notif_2',
    userId: 'usr_admin_1',
    title: 'Capacity Warning',
    message: 'Engineering Core team is allocated at 82% capacity for the current cycle.',
    type: 'risk_alert',
    isRead: false,
    link: '/PM-Portal/index.html#resource-planner',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

export const NotificationRepository = {
  async findByUserId(userId: string, unreadOnly = false): Promise<Notification[]> {
    if (isDbConnected()) {
      const sql = unreadOnly
        ? 'SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC'
        : 'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC';
      const res = await query(sql, [userId]);
      return res.rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        title: r.title,
        message: r.message,
        type: r.type,
        isRead: r.is_read,
        link: r.link,
        createdAt: r.created_at,
      }));
    }
    return memoryNotifications.filter((n) => n.userId === userId && (!unreadOnly || !n.isRead));
  },

  async create(notification: Notification): Promise<Notification> {
    if (isDbConnected()) {
      await query(
        `INSERT INTO notifications (id, user_id, title, message, type, is_read, link, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          notification.id,
          notification.userId,
          notification.title,
          notification.message,
          notification.type,
          notification.isRead,
          notification.link || null,
          notification.createdAt,
        ]
      );
    }
    memoryNotifications.unshift(notification);
    return notification;
  },

  async markAsRead(id: string, userId: string): Promise<boolean> {
    if (isDbConnected()) {
      const res = await query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, userId]);
      return (res.rowCount ?? 0) > 0;
    }
    const notif = memoryNotifications.find((n) => n.id === id && n.userId === userId);
    if (notif) {
      notif.isRead = true;
      return true;
    }
    return false;
  },

  async markAllAsRead(userId: string): Promise<number> {
    if (isDbConnected()) {
      const res = await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);
      return res.rowCount ?? 0;
    }
    let count = 0;
    memoryNotifications.forEach((n) => {
      if (n.userId === userId && !n.isRead) {
        n.isRead = true;
        count++;
      }
    });
    return count;
  },
};
