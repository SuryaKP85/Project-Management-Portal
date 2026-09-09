import { apiClient } from './apiClient.js';

export class ActivityService {
  static async getRecentActivities(limit = 50) {
    const data = await apiClient.get(`/activity?limit=${limit}`);
    return data.activities || [];
  }

  static async getEntityActivities(entityType, entityId) {
    const data = await apiClient.get(`/activity?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
    return data.activities || [];
  }
}
