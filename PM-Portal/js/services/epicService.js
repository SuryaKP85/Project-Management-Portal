import { apiClient } from './apiClient.js';

export class EpicService {
  static async getEpics(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/epics${qs}`);
    return data.epics || [];
  }

  static async getEpicById(id) {
    const data = await apiClient.get(`/epics/${id}`);
    return data.epic;
  }

  static async createEpic(epicData) {
    const data = await apiClient.post('/epics', epicData);
    return data.epic;
  }

  static async updateEpic(id, updates) {
    const data = await apiClient.patch(`/epics/${id}`, updates);
    return data.epic;
  }

  static async deleteEpic(id) {
    const data = await apiClient.delete(`/epics/${id}`);
    return data;
  }
}
