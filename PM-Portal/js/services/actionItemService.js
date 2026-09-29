import { apiClient } from './apiClient.js';

/**
 * Sprint 14 — Action items (V2 /api/v1/action-items).
 * The server scopes every request to the caller's projects and decides who may
 * change what; this client only carries ids, filters and field values.
 */
export class ActionItemService {
  /** @param {object} params filters (projectId, status, …) plus page/limit */
  static async listActionItems(params = {}) {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TypeError('ActionItemService.listActionItems expects a filter object.');
    }
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/action-items${qs}`);
    return { items: data.actionItems || [], total: data.total || 0, page: data.page || 1, limit: data.limit || 0 };
  }

  static async getActionItem(id) {
    const data = await apiClient.get(`/action-items/${encodeURIComponent(id)}`);
    return data.actionItem;
  }

  static async createActionItem(fields) {
    const data = await apiClient.post('/action-items', fields);
    return data.actionItem;
  }

  static async updateActionItem(id, updates) {
    const data = await apiClient.patch(`/action-items/${encodeURIComponent(id)}`, updates);
    return data.actionItem;
  }

  static async updateStatus(id, status) {
    const data = await apiClient.patch(`/action-items/${encodeURIComponent(id)}/status`, { status });
    return data.actionItem;
  }

  static async deleteActionItem(id) {
    return apiClient.delete(`/action-items/${encodeURIComponent(id)}`);
  }
}
