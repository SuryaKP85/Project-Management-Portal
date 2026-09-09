import { apiClient } from './apiClient.js';

export class VelocityService {
  static async getVelocity(projectId) {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const res = await apiClient.get(`/velocity${qs}`);
    return Array.isArray(res) ? res : (res?.data || []);
  }

  static async getAverageVelocity(projectId) {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const res = await apiClient.get(`/velocity/average${qs}`);
    return res?.data !== undefined ? res.data : res;
  }
}
