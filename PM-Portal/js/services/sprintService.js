import { apiClient } from './apiClient.js';

export class SprintService {
  static async getSprints(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await apiClient.get(`/sprints${qs}`);
    return Array.isArray(res) ? res : (res?.data || []);
  }

  static async getSprintById(id) {
    const res = await apiClient.get(`/sprints/${id}`);
    return res?.data !== undefined ? res.data : res;
  }

  static async createSprint(data) {
    const res = await apiClient.post('/sprints', data);
    return res?.data !== undefined ? res.data : res;
  }

  static async updateSprint(id, updates) {
    const res = await apiClient.patch(`/sprints/${id}`, updates);
    return res?.data !== undefined ? res.data : res;
  }

  static async startSprint(id) {
    const res = await apiClient.post(`/sprints/${id}/start`, {});
    return res?.data !== undefined ? res.data : res;
  }

  static async completeSprint(id, carryoverData = {}) {
    const res = await apiClient.post(`/sprints/${id}/complete`, carryoverData);
    return res;
  }

  static async getSprintItems(id) {
    const res = await apiClient.get(`/sprints/${id}/items`);
    return res?.data !== undefined ? res.data : res;
  }

  static async addSprintItem(id, itemId, itemType = 'story') {
    const res = await apiClient.post(`/sprints/${id}/items`, { itemId, itemType });
    return res?.data !== undefined ? res.data : res;
  }

  static async removeSprintItem(id, itemId, itemType = 'story') {
    const res = await apiClient.delete(`/sprints/${id}/items/${itemId}?itemType=${itemType}`);
    return res;
  }

  static async getSprintCapacity(id) {
    const res = await apiClient.get(`/sprints/${id}/capacity`);
    return res?.data !== undefined ? res.data : res;
  }

  static async getSprintBurndown(id) {
    const res = await apiClient.get(`/sprints/${id}/burndown`);
    return res?.data !== undefined ? res.data : res;
  }

  static async deleteSprint(id) {
    const res = await apiClient.delete(`/sprints/${id}`);
    return res;
  }
}
