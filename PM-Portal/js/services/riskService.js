import { apiClient } from './apiClient.js';

export class RiskService {
  static async getRisks(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/risks${qs}`);
    const risks = data.risks || [];
    if (data.total !== undefined) {
      risks.total = data.total;
      risks.page = data.page;
      risks.limit = data.limit;
    }
    return risks;
  }

  static async getPaginatedRisks(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/risks${qs}`);
    return {
      risks: data.risks || [],
      total: data.total ?? (data.risks ? data.risks.length : 0),
      page: data.page ?? 1,
      limit: data.limit ?? (data.risks ? data.risks.length : 25),
    };
  }

  static async getRiskById(id) {
    const data = await apiClient.get(`/risks/${id}`);
    return data.risk;
  }

  static async createRisk(riskData) {
    const data = await apiClient.post('/risks', riskData);
    return data.risk;
  }

  static async updateRisk(id, updates) {
    const data = await apiClient.patch(`/risks/${id}`, updates);
    return data.risk;
  }

  static async deleteRisk(id) {
    return apiClient.delete(`/risks/${id}`);
  }

  static async getHeatmap(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/risks/analytics/heatmap${qs}`);
    return data.heatmap;
  }

  static async runProjectAudit(projectId) {
    const data = await apiClient.post(`/risks/projects/${projectId}/audit`, {});
    return data.audit;
  }

  static async linkItem(riskId, targetType, targetId, targetCode, targetName) {
    const data = await apiClient.post(`/risks/${riskId}/links`, { targetType, targetId, targetCode, targetName });
    return data.link;
  }

  static async unlinkItem(riskId, linkId) {
    return apiClient.delete(`/risks/${riskId}/links/${linkId}`);
  }
}
