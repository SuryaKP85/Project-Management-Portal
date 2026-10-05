import { apiClient } from './apiClient.js';

/**
 * Sprint 17 — Requirements (V2 /api/v1/requirements).
 * The server scopes every request to the caller's projects and decides who may
 * create, edit, change status or delete; this client only carries ids,
 * filters and field values.
 */
export class RequirementService {
  /** @param {object} params filters (projectId, status, type, priority, ownerId, search) plus page/limit */
  static async listRequirements(params = {}) {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TypeError('RequirementService.listRequirements expects a filter object.');
    }
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/requirements${qs}`);
    return { items: data.requirements || [], total: data.total || 0, page: data.page || 1, limit: data.limit || 0 };
  }

  static async getRequirement(id) {
    const data = await apiClient.get(`/requirements/${encodeURIComponent(id)}`);
    return data.requirement;
  }

  static async createRequirement(fields) {
    const data = await apiClient.post('/requirements', fields);
    return data.requirement;
  }

  static async updateRequirement(id, updates) {
    const data = await apiClient.patch(`/requirements/${encodeURIComponent(id)}`, updates);
    return data.requirement;
  }

  static async updateStatus(id, status) {
    const data = await apiClient.patch(`/requirements/${encodeURIComponent(id)}/status`, { status });
    return data.requirement;
  }

  static async deleteRequirement(id) {
    return apiClient.delete(`/requirements/${encodeURIComponent(id)}`);
  }

  /** Sprint 18: asks the server for an AI decomposition proposal (nothing is stored). */
  static async proposeDecomposition(id) {
    const data = await apiClient.post(`/requirements/${encodeURIComponent(id)}/decomposition/proposal`, {});
    return data.proposal;
  }

  /** Sprint 18: approves an edited proposal; the server creates the records atomically. */
  static async approveDecomposition(id, { requirementRevision, epics }) {
    const data = await apiClient.post(`/requirements/${encodeURIComponent(id)}/decomposition`, { requirementRevision, epics });
    return data.decomposition;
  }

  /** Sprint 18: the delivery records linked to a requirement. */
  static async getLinks(id) {
    const data = await apiClient.get(`/requirements/${encodeURIComponent(id)}/links`);
    return data.links || [];
  }
}
