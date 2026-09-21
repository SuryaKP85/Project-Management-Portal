import { apiClient } from './apiClient.js';

export class ProjectService {
  static async getProjects() {
    const data = await apiClient.get('/projects');
    return data.projects || [];
  }

  static async getProjectById(id) {
    const data = await apiClient.get(`/projects/${id}`);
    return data.project;
  }

  static async createProject(projectData) {
    const data = await apiClient.post('/projects', projectData);
    return data.project;
  }

  static async updateProject(id, updates) {
    const data = await apiClient.patch(`/projects/${id}`, updates);
    return data.project;
  }

  static async deleteProject(id) {
    const data = await apiClient.delete(`/projects/${id}`);
    return data;
  }

  /**
   * Deterministic project health, calculated server-side.
   * The browser never computes this score; the response is the source of truth.
   */
  static async getProjectHealth(id) {
    const data = await apiClient.get(`/projects/${id}/health`);
    return data.health;
  }

  static async migrateProjects(projects) {
    const data = await apiClient.post('/projects/migrate', { projects });
    return data;
  }
}
