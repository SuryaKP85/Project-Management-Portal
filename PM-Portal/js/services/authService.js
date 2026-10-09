import { apiClient } from './apiClient.js';

export class AuthService {
  static async login(email, password) {
    // Sprint 25: the server sets the HttpOnly session cookie; no token reaches JavaScript.
    return apiClient.post('/auth/login', { email, password });
  }

  static async getCurrentUser() {
    try {
      const data = await apiClient.get('/auth/me');
      return data.user;
    } catch (err) {
      return null;
    }
  }

  /** Sprint 12: the signed-in user changes their own password on the server. */
  static async changePassword(currentPassword, newPassword) {
    return apiClient.post('/auth/change-password', { currentPassword, newPassword });
  }

  static async logout() {
    try {
      await apiClient.post('/auth/logout', {});
    } finally {
      // Runs even when the server call fails, so the client never keeps a
      // token for a session it believes is over.
      apiClient.setAuthToken(null);
      try { sessionStorage.removeItem('pm_v2_bridge_failure'); } catch { /* ignore */ }
    }
  }

  /**
   * @deprecated Sprint 12 retired the V1.1-to-V2 session bridge: the server is
   * the only authenticator, so there is never a bridge failure to report.
   * Kept so modules that still ask keep working unchanged.
   */
  static getV2BridgeFailure() {
    return null;
  }
}
