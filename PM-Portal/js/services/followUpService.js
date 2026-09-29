import { apiClient } from './apiClient.js';

/**
 * Sprint 14 — Follow-ups (V2 /api/v1/follow-ups).
 * The server scopes every request to the caller's projects and decides who may
 * change what; this client only carries ids, filters and field values.
 */
export class FollowUpService {
  /** @param {object} params filters (projectId, status, …) plus page/limit */
  static async listFollowUps(params = {}) {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TypeError('FollowUpService.listFollowUps expects a filter object.');
    }
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/follow-ups${qs}`);
    return { items: data.followUps || [], total: data.total || 0, page: data.page || 1, limit: data.limit || 0 };
  }

  static async getFollowUp(id) {
    const data = await apiClient.get(`/follow-ups/${encodeURIComponent(id)}`);
    return data.followUp;
  }

  static async createFollowUp(fields) {
    const data = await apiClient.post('/follow-ups', fields);
    return data.followUp;
  }

  static async updateFollowUp(id, updates) {
    const data = await apiClient.patch(`/follow-ups/${encodeURIComponent(id)}`, updates);
    return data.followUp;
  }

  static async updateStatus(id, status) {
    const data = await apiClient.patch(`/follow-ups/${encodeURIComponent(id)}/status`, { status });
    return data.followUp;
  }

  static async deleteFollowUp(id) {
    return apiClient.delete(`/follow-ups/${encodeURIComponent(id)}`);
  }
}
