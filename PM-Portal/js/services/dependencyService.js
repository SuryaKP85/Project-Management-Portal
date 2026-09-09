import { apiClient } from './apiClient.js';

export class DependencyService {
  static async getDependencies(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/dependencies${qs}`);
    return data.dependencies || [];
  }

  static async getDependencyById(id) {
    const data = await apiClient.get(`/dependencies/${id}`);
    return data.dependency;
  }

  static async createDependency(depData) {
    const data = await apiClient.post('/dependencies', depData);
    return data.dependency;
  }

  static async updateDependency(id, updates) {
    const data = await apiClient.put(`/dependencies/${id}`, updates);
    return data.dependency;
  }

  static async deleteDependency(id) {
    return apiClient.delete(`/dependencies/${id}`);
  }

  static async getChain(entityId) {
    const data = await apiClient.get(`/dependencies/chain/${entityId}`);
    return data.chain;
  }

  static async getGraph(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/dependencies/graph${qs}`);
    return data.graph;
  }
}
