import { apiClient } from './apiClient.js';

export class NotificationService {
  static async getNotifications(unreadOnly = false) {
    const data = await apiClient.get(`/notifications?unread=${unreadOnly}`);
    return data.notifications || [];
  }

  static async markAsRead(id) {
    const data = await apiClient.patch(`/notifications/${id}/read`, {});
    return data;
  }

  static async markAllAsRead() {
    const data = await apiClient.post('/notifications/read-all', {});
    return data;
  }
}
