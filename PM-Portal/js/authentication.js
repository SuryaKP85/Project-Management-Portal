/* authentication.js - Session management backed by the V2 server (Sprint 12) */

import { AuthService } from './services/authService.js';

/**
 * The V2 server is the only authenticator and the only user directory. This
 * module keeps the V1.1 session record (`pm_portal_current_user`) that the
 * rest of the portal reads, but that record is always built from the user the
 * server authenticated. No credentials, hashes or account lists live in the
 * browser.
 */

/** V2 role -> the label the V1.1 session record has always carried. */
const V1_ROLE_LABELS = {
  admin: 'Administrator',
  'project-manager': 'Project Manager',
  'product-manager': 'Product Manager',
  'team-member': 'Team Member',
  viewer: 'Viewer',
};

/** Retired local-account storage, cleared on every visit so nothing lingers. */
const LEGACY_KEYS = ['pm_portal_users', 'pm_portal_auth_token'];

export const Authentication = {
  CURRENT_USER_KEY: 'pm_portal_current_user',

  /** Clears the retired local account registry; there is no local seeding. */
  init() {
    for (const key of LEGACY_KEYS) {
      try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
    }
  },

  /**
   * Builds the V1.1-compatible session record from an authenticated V2 user.
   * Shape is what existing modules read; values come only from the server.
   */
  toSessionUser(v2User) {
    if (!v2User || !v2User.id) return null;
    const firstName = v2User.firstName || '';
    const lastName = v2User.lastName || '';
    return {
      id: v2User.id,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim() || v2User.email || 'User',
      email: v2User.email || '',
      department: v2User.department || '',
      title: v2User.title || '',
      role: V1_ROLE_LABELS[v2User.role] || v2User.role || 'Team Member',
      v2Role: v2User.role,
      status: v2User.isActive === false ? 'inactive' : 'active',
      avatar: v2User.avatarUrl || '',
      mustChangePassword: false,
      createdAt: v2User.createdAt || '',
    };
  },

  /** Currently signed-in user (session record), or null. */
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(this.CURRENT_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  /** Stores or clears the session record. Never stores credentials. */
  setCurrentUser(user) {
    if (user) {
      const { passwordHash, password, ...safeUser } = user;
      localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(safeUser));
    } else {
      localStorage.removeItem(this.CURRENT_USER_KEY);
    }
  },

  /**
   * @deprecated There is no browser user registry; the directory is the V2
   * user service. Retained as empty no-ops for modules outside Sprint 12.
   */
  getUsers() {
    return [];
  },
  saveUsers() {
    /* no local registry */
  },

  /** Signs in against the V2 server. Never throws; returns { success, message, user }. */
  async login(email, password, remember = false) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { success: false, message: 'Please enter your email address and password.' };
    }
    try {
      const data = await AuthService.login(cleanEmail, password);
      const session = this.toSessionUser(data && data.user);
      if (!session) {
        return { success: false, message: 'Sign-in failed: the server returned no user.' };
      }
      this.setCurrentUser(session);
      try {
        if (remember) localStorage.setItem('pm_portal_remembered_email', cleanEmail);
        else localStorage.removeItem('pm_portal_remembered_email');
      } catch (e) { /* storage unavailable */ }
      return { success: true, user: session, mustChangePassword: false };
    } catch (err) {
      return { success: false, message: this.describeLoginError(err) };
    }
  },

  describeLoginError(err) {
    if (err && (err.status === 401 || err.status === 400)) {
      return err.message || 'Invalid email or password.';
    }
    if (err && (err.code === 'TIMEOUT' || err.status === undefined)) {
      return 'The sign-in service is unreachable. Please try again in a moment.';
    }
    return (err && err.message) || 'Sign-in failed.';
  },

  /**
   * Validates password against enterprise complexity policy:
   * - Min 8 characters
   * - At least 1 uppercase letter
   * - At least 1 lowercase letter
   * - At least 1 number
   * - At least 1 special character (@$!%*?&#)
   */
  validatePasswordPolicy(password) {
    const errors = [];
    if (!password || password.length < 8) {
      errors.push('Must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Must include at least 1 uppercase letter (A-Z)');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Must include at least 1 lowercase letter (a-z)');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Must include at least 1 number (0-9)');
    }
    if (!/[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Must include at least 1 special character (e.g. @$!%*?&)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /** Changes the signed-in user's password on the server. Never throws. */
  async changePassword(currentPassword, newPassword) {
    const policy = this.validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      return { success: false, message: 'Password does not meet complexity requirements: ' + policy.errors.join(', ') };
    }
    try {
      await AuthService.changePassword(currentPassword, newPassword);
      return { success: true, message: 'Password updated successfully.' };
    } catch (err) {
      return { success: false, message: (err && err.message) || 'Could not change password.' };
    }
  },

  /** Re-reads the authenticated user from the server and refreshes the session record. */
  async refreshSession() {
    const user = await AuthService.getCurrentUser();
    if (user) this.setCurrentUser(this.toSessionUser(user));
    return user;
  },

  /**
   * Logs out. The server session is torn down first, because only the server
   * can clear the HttpOnly auth_token cookie; local state is cleared regardless
   * of the outcome before redirecting.
   */
  async logout() {
    try {
      await AuthService.logout();
    } catch (err) {
      console.warn('Server logout failed; clearing local session anyway:', err && err.message);
    }

    this.setCurrentUser(null);

    try {
      sessionStorage.removeItem('pm_v2_auth_token');
      sessionStorage.removeItem('pm_v2_bridge_failure');
    } catch (e) {
      /* sessionStorage unavailable — nothing further to clear */
    }

    window.location.href = 'login.html';
  },

  /**
   * Guard function for pages requiring login
   */
  requireAuth() {
    this.init();
    const user = this.getCurrentUser();
    const currentPath = window.location.pathname.toLowerCase();

    if (!user) {
      if (!currentPath.endsWith('login.html') && !currentPath.endsWith('forgot-password.html')) {
        window.location.href = 'login.html';
      }
      return null;
    }

    return user;
  }
};
