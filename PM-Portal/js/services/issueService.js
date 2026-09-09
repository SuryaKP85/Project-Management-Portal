import { apiClient } from './apiClient.js';

export class IssueService {
  static async getIssues(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/issues${qs}`);
    return data.issues || [];
  }

  static async getIssueById(id) {
    const data = await apiClient.get(`/issues/${id}`);
    return data.issue;
  }

  static async createIssue(issueData) {
    const data = await apiClient.post('/issues', issueData);
    return data.issue;
  }

  static async updateIssue(id, updates) {
    const data = await apiClient.put(`/issues/${id}`, updates);
    return data.issue;
  }

  static async deleteIssue(id) {
    return apiClient.delete(`/issues/${id}`);
  }

  static async getRootCauses(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/issues/analytics/root-causes${qs}`);
    return data.summary;
  }

  static async linkItem(issueId, targetType, targetId, targetCode, targetName) {
    const data = await apiClient.post(`/issues/${issueId}/links`, { targetType, targetId, targetCode, targetName });
    return data.link;
  }

  static async unlinkItem(issueId, linkId) {
    return apiClient.delete(`/issues/${issueId}/links/${linkId}`);
  }
}
