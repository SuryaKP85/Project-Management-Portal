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

  /** Sprint 21B: Home and unified My Work for the signed-in user (no parameters: the server decides the scope). */
  static async getHome() {
    const res = await apiClient.get('/home');
    return res?.data !== undefined ? res.data : res;
  }

  static async updateStatus(itemId, itemType, status) {
    // The server route is POST /my-work/status (Sprint 21B correction: this used to send PATCH and always failed).
    const res = await apiClient.post('/my-work/status', { itemId, itemType, status });
    return res?.data !== undefined ? res.data : res;
  }
}
