import { apiClient } from './apiClient.js';

export class SubtaskService {
  static async getSubtasks(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/subtasks${qs}`);
    return data.subtasks || [];
  }

  static async getSubtaskById(id) {
    const data = await apiClient.get(`/subtasks/${id}`);
    return data.subtask;
  }

  static async createSubtask(subtaskData) {
    const data = await apiClient.post('/subtasks', subtaskData);
    return data.subtask;
  }

  static async updateSubtask(id, updates) {
    const data = await apiClient.patch(`/subtasks/${id}`, updates);
    return data.subtask;
  }

  static async deleteSubtask(id) {
    const data = await apiClient.delete(`/subtasks/${id}`);
    return data;
  }
}
