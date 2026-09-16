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

  /**
   * Establishes the V2 JWT session alongside the existing V1.1 local sign-in,
   * reusing the same credentials. Never throws: a failure here must not block
   * the local login, it only means V2 API-backed modules stay unauthenticated.
   *
   * @returns {Promise<boolean>} true when a V2 session was established.
   */
  static async syncV2Session(email, password) {
    try {
      const data = await AuthService.login(email, password);
      try { sessionStorage.removeItem('pm_v2_bridge_failure'); } catch { /* ignore */ }
      return !!(data && data.token);
    } catch (err) {
      console.warn('V2 session could not be established for this account:', err && err.message);
      // Record why the bridge failed so downstream modules can explain the
      // situation instead of telling the user to sign in again — which would
      // not help when the account simply has no server-side counterpart.
      try {
        sessionStorage.setItem('pm_v2_bridge_failure', JSON.stringify({
          email,
          status: err && err.status,
          message: (err && err.message) || 'Unknown error',
        }));
      } catch { /* ignore */ }
      return false;
    }
  }

  /** Returns details of the last failed V2 session bridge, or null. */
  static getV2BridgeFailure() {
    try {
      const raw = sessionStorage.getItem('pm_v2_bridge_failure');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
