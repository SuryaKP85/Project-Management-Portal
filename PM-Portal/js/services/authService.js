import { apiClient } from './apiClient.js';

export class AuthService {
  static async login(email, password) {
    const data = await apiClient.post('/auth/login', { email, password });
    if (data.token) {
      apiClient.setAuthToken(data.token);
    }
    return data;
  }

  static async getCurrentUser() {
    try {
      const data = await apiClient.get('/auth/me');
      return data.user;
    } catch (err) {
      return null;
    }
  }

  static async logout() {
    try {
      await apiClient.post('/auth/logout', {});
    } finally {
      apiClient.setAuthToken(null);
    }
  }
}
