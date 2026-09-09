import { apiClient } from './apiClient.js';

export class BacklogService {
  static async getBacklog(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiClient.get(`/backlog${qs}`);
    return Array.isArray(res) ? res : (res?.data || []);
  }

  static async reorderBacklog(itemOrders) {
    const res = await apiClient.post('/backlog/reorder', { itemOrders });
    return res;
  }

  static async createBacklogItem(itemData) {
    const res = await apiClient.post('/backlog/item', itemData);
    return res?.data !== undefined ? res.data : res;
  }

  static async moveToSprint(itemId, itemType, sprintId) {
    const res = await apiClient.post('/backlog/move-to-sprint', { itemId, itemType, sprintId });
    return res;
  }

  static async bulkMoveToSprint(itemIds, sprintId) {
    const res = await apiClient.post('/backlog/bulk-move', { itemIds, sprintId });
    return res;
  }
}
