import { apiClient } from './apiClient.js';

export class TaskService {
  static async getTasks(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/tasks${qs}`);
    return data.tasks || [];
  }

  static async getTaskById(id) {
    const data = await apiClient.get(`/tasks/${id}`);
    return data.task;
  }

  static async createTask(taskData) {
    const data = await apiClient.post('/tasks', taskData);
    return data.task;
  }

  static async updateTask(id, updates) {
    const data = await apiClient.patch(`/tasks/${id}`, updates);
    return data.task;
  }

  static async deleteTask(id) {
    const data = await apiClient.delete(`/tasks/${id}`);
    return data;
  }
}
