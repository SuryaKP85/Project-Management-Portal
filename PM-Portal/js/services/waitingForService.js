import { apiClient } from './apiClient.js';

/**
 * Sprint 14 — Waiting For items (V2 /api/v1/waiting-for).
 * The server scopes every request to the caller's projects and decides who may
 * change what; this client only carries ids, filters and field values.
 */
export class WaitingForService {
  /** @param {object} params filters (projectId, status, …) plus page/limit */
  static async listWaitingFor(params = {}) {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TypeError('WaitingForService.listWaitingFor expects a filter object.');
    }
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/waiting-for${qs}`);
    return { items: data.waitingFor || [], total: data.total || 0, page: data.page || 1, limit: data.limit || 0 };
  }

  static async getWaitingForItem(id) {
    const data = await apiClient.get(`/waiting-for/${encodeURIComponent(id)}`);
    return data.waitingFor;
  }

  static async createWaitingForItem(fields) {
    const data = await apiClient.post('/waiting-for', fields);
    return data.waitingFor;
  }

  static async updateWaitingForItem(id, updates) {
    const data = await apiClient.patch(`/waiting-for/${encodeURIComponent(id)}`, updates);
    return data.waitingFor;
  }

  static async updateStatus(id, status) {
    const data = await apiClient.patch(`/waiting-for/${encodeURIComponent(id)}/status`, { status });
    return data.waitingFor;
  }

  static async deleteWaitingForItem(id) {
    return apiClient.delete(`/waiting-for/${encodeURIComponent(id)}`);
  }
}
