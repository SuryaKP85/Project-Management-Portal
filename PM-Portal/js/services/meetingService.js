import { apiClient } from './apiClient.js';

/**
 * Sprint 14 — Meetings (V2 /api/v1/meetings).
 * The server scopes every request to the caller's projects and decides who may
 * change what; this client only carries ids, filters and field values.
 */
export class MeetingService {
  /** @param {object} params filters (projectId, status, …) plus page/limit */
  static async listMeetings(params = {}) {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TypeError('MeetingService.listMeetings expects a filter object.');
    }
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/meetings${qs}`);
    return { items: data.meetings || [], total: data.total || 0, page: data.page || 1, limit: data.limit || 0 };
  }

  static async getMeeting(id) {
    const data = await apiClient.get(`/meetings/${encodeURIComponent(id)}`);
    return data.meeting;
  }

  static async createMeeting(fields) {
    const data = await apiClient.post('/meetings', fields);
    return data.meeting;
  }

  static async updateMeeting(id, updates) {
    const data = await apiClient.patch(`/meetings/${encodeURIComponent(id)}`, updates);
    return data.meeting;
  }

  static async deleteMeeting(id) {
    return apiClient.delete(`/meetings/${encodeURIComponent(id)}`);
  }
}
