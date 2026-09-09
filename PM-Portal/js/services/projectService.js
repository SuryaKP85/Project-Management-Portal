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

  static async migrateProjects(projects) {
    const data = await apiClient.post('/projects/migrate', { projects });
    return data;
  }
}
