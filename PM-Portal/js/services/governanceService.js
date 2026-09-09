import { apiClient } from './apiClient.js';

export class GovernanceService {
  static async getSummary(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/governance/summary${qs}`);
    return data;
  }

  static async getTraceability(entityType, id) {
    const data = await apiClient.get(`/governance/traceability/${entityType}/${id}`);
    return data.chain;
  }
}
