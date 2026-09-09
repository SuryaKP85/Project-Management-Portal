import { apiClient } from './apiClient.js';

export class MilestoneService {
  static async getMilestones(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/milestones${qs}`);
    return data.milestones || [];
  }

  static async getMilestoneById(id) {
    const data = await apiClient.get(`/milestones/${id}`);
    return data.milestone;
  }

  static async createMilestone(mlsData) {
    const data = await apiClient.post('/milestones', mlsData);
    return data.milestone;
  }

  static async updateMilestone(id, updates) {
    const data = await apiClient.put(`/milestones/${id}`, updates);
    return data.milestone;
  }

  static async deleteMilestone(id) {
    return apiClient.delete(`/milestones/${id}`);
  }

  static async linkItem(milestoneId, targetType, targetId, targetCode, targetName) {
    const data = await apiClient.post(`/milestones/${milestoneId}/links`, { targetType, targetId, targetCode, targetName });
    return data.link;
  }

  static async unlinkItem(milestoneId, linkId) {
    return apiClient.delete(`/milestones/${milestoneId}/links/${linkId}`);
  }
}
