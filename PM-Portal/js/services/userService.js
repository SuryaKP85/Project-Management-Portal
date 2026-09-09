import { apiClient } from './apiClient.js';

export class UserService {
  static async getUsers() {
    const data = await apiClient.get('/users');
    return data.users || [];
  }

  static async getUserById(id) {
    const data = await apiClient.get(`/users/${id}`);
    return data.user;
  }

  static async updateUserRole(id, role) {
    const data = await apiClient.patch(`/users/${id}/role`, { role });
    return data.user;
  }
}
