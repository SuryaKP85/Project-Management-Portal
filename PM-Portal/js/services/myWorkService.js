import { apiClient } from './apiClient.js';

export class MyWorkService {
  static async getMyWork(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiClient.get(`/my-work${qs}`);
    return res?.data !== undefined ? res.data : res;
  }

  static async updateStatus(itemId, itemType, status) {
    const res = await apiClient.patch('/my-work/status', { itemId, itemType, status });
    return res?.data !== undefined ? res.data : res;
  }
}
