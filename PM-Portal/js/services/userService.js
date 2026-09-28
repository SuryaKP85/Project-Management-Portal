import { apiClient } from './apiClient.js';

/** V2 user directory (Sprint 12). Every call goes to the server; nothing is cached locally. */
export class UserService {
  static async getUsers({ includeInactive = false } = {}) {
    const data = await apiClient.get(`/users${includeInactive ? '?includeInactive=true' : ''}`);
    return data.users || [];
  }

  static async getUserById(id) {
    const data = await apiClient.get(`/users/${id}`);
    return data.user;
  }

  /** Admin-only: creates the account through the existing registration endpoint. */
  static async register({ email, password, firstName, lastName, role, department, title }) {
    const data = await apiClient.post('/auth/register', { email, password, firstName, lastName, role, department, title });
    return data.user;
  }

  /** Profile fields only (firstName, lastName, department, title, avatarUrl); self or admin. */
  static async updateProfile(id, updates) {
    const data = await apiClient.patch(`/users/${id}`, updates);
    return data.user;
  }

  static async updateUserRole(id, role) {
    const data = await apiClient.patch(`/users/${id}/role`, { role });
    return data.user;
  }

  /** Admin-only: activate or deactivate. */
  static async setStatus(id, isActive) {
    const data = await apiClient.patch(`/users/${id}/status`, { isActive: !!isActive });
    return data.user;
  }

  /** Admin-only: sets another user's password. Not a recovery workflow. */
  static async setPassword(id, password) {
    return apiClient.post(`/users/${id}/set-password`, { password });
  }
}
