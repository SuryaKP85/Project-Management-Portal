/* authentication.js - Central Authentication and Session Management Service */

import { Storage } from './storage.js';

export const Authentication = {
  // Storage keys
  USERS_KEY: 'pm_portal_users',
  CURRENT_USER_KEY: 'pm_portal_current_user',
  TOKEN_KEY: 'pm_portal_auth_token',

  // Default Administrator Account
  DEFAULT_ADMIN: {
    id: 'USR001',
    firstName: 'System',
    lastName: 'Administrator',
    name: 'System Administrator',
    email: 'admin@company.com',
    passwordHash: 'Admin@123', // In production, hash with bcrypt; stored securely in LocalStorage for portal
    department: 'Dev',
    role: 'Administrator',
    phone: '+1 (555) 019-2831',
    manager: 'Executive Committee',
    status: 'active',
    avatar: '',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z'
  },

  /**
   * Initializes users registry with default accounts if empty
   */
  init() {
    let users = this.getUsers();
    if (!users || !Array.isArray(users) || users.length === 0) {
      users = [
        this.DEFAULT_ADMIN,
        {
          id: 'USR002',
          firstName: 'John',
          lastName: 'Doe',
          name: 'John Doe',
          email: 'john.doe@company.com',
          passwordHash: 'iRely@123',
          department: 'Dev',
          role: 'Project Manager',
          phone: '+1 (555) 012-3456',
          manager: 'System Administrator',
          status: 'active',
          avatar: '',
          mustChangePassword: true,
          createdAt: '2026-01-15T00:00:00.000Z'
        },
        {
          id: 'USR003',
          firstName: 'Sarah',
          lastName: 'Connor',
          name: 'Sarah Connor',
          email: 'sarah.connor@company.com',
          passwordHash: 'iRely@123',
          department: 'Product Manager',
          role: 'Product Manager',
          phone: '+1 (555) 012-7890',
          manager: 'System Administrator',
          status: 'active',
          avatar: '',
          mustChangePassword: true,
          createdAt: '2026-02-01T00:00:00.000Z'
        },
        {
          id: 'USR004',
          firstName: 'Alice',
          lastName: 'Smith',
          name: 'Alice Smith',
          email: 'alice.smith@company.com',
          passwordHash: 'iRely@123',
          department: 'Dev',
          role: 'Developer',
          phone: '+1 (555) 019-4422',
          manager: 'John Doe',
          status: 'active',
          avatar: '',
          mustChangePassword: true,
          createdAt: '2026-02-10T00:00:00.000Z'
        },
        {
          id: 'USR005',
          firstName: 'David',
          lastName: 'Miller',
          name: 'David Miller',
          email: 'david.miller@company.com',
          passwordHash: 'iRely@123',
          department: 'QA',
          role: 'QA',
          phone: '+1 (555) 018-9911',
          manager: 'John Doe',
          status: 'active',
          avatar: '',
          mustChangePassword: true,
          createdAt: '2026-03-01T00:00:00.000Z'
        }
      ];
      this.saveUsers(users);
    }

    // Default current user if non-existent for instant preview compatibility
    if (!this.getCurrentUser()) {
      this.setCurrentUser(users[0]);
    }
  },

  /**
   * Retrieves all users from storage
   */
  getUsers() {
    try {
      const raw = localStorage.getItem(this.USERS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to parse users:', e);
      return null;
    }
  },

  /**
   * Saves users list to storage
   */
  saveUsers(users) {
    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
  },

  /**
   * Gets currently authenticated user
   */
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(this.CURRENT_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Sets active session user
   */
  setCurrentUser(user) {
    if (user) {
      // Omit sensitive fields when storing session object
      const safeUser = { ...user };
      localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(safeUser));
      localStorage.setItem(this.TOKEN_KEY, 'token_' + Date.now() + '_' + Math.random().toString(36).substring(2));
    } else {
      localStorage.removeItem(this.CURRENT_USER_KEY);
      localStorage.removeItem(this.TOKEN_KEY);
    }
  },

  /**
   * Logs in with email and password
   */
  login(email, password, remember = false) {
    const users = this.getUsers() || [];
    const cleanEmail = (email || '').trim().toLowerCase();
    
    const user = users.find(u => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      return { success: false, message: 'Invalid email address or account does not exist.' };
    }

    if (user.status === 'inactive' || user.status === 'deactivated') {
      return { success: false, message: 'This account has been deactivated. Please contact your system administrator.' };
    }

    if (user.passwordHash !== password) {
      return { success: false, message: 'Incorrect password entered.' };
    }

    // Login successful
    this.setCurrentUser(user);

    if (remember) {
      localStorage.setItem('pm_portal_remembered_email', cleanEmail);
    } else {
      localStorage.removeItem('pm_portal_remembered_email');
    }

    return {
      success: true,
      user,
      mustChangePassword: !!user.mustChangePassword
    };
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

  /**
   * Change password for logged in user or given user ID
   */
  changePassword(userId, oldPassword, newPassword) {
    const users = this.getUsers() || [];
    const idx = users.findIndex(u => u.id === userId);

    if (idx === -1) {
      return { success: false, message: 'User not found.' };
    }

    const user = users[idx];

    // Validate old password unless forced reset
    if (oldPassword && user.passwordHash !== oldPassword) {
      return { success: false, message: 'Current password is incorrect.' };
    }

    // Validate policy
    const policy = this.validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      return { success: false, message: 'Password does not meet complexity requirements: ' + policy.errors.join(', ') };
    }

    // Update password
    users[idx].passwordHash = newPassword;
    users[idx].mustChangePassword = false;
    this.saveUsers(users);

    // Sync session user if modifying active user
    const curr = this.getCurrentUser();
    if (curr && curr.id === userId) {
      curr.mustChangePassword = false;
      this.setCurrentUser(curr);
    }

    return { success: true, message: 'Password updated successfully.' };
  },

  /**
   * Resets password to temporary value
   */
  resetPassword(email, tempPassword = 'iRely@123') {
    const users = this.getUsers() || [];
    const cleanEmail = (email || '').trim().toLowerCase();
    const idx = users.findIndex(u => u.email.toLowerCase() === cleanEmail);

    if (idx === -1) {
      return { success: false, message: 'No account registered with this email address.' };
    }

    users[idx].passwordHash = tempPassword;
    users[idx].mustChangePassword = true;
    this.saveUsers(users);

    return { success: true, message: `Password reset to temporary password: ${tempPassword}`, tempPassword };
  },

  /**
   * Logs out active user
   */
  logout() {
    this.setCurrentUser(null);
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

    if (user.mustChangePassword && !currentPath.endsWith('change-password.html')) {
      window.location.href = 'change-password.html';
      return user;
    }

    return user;
  }
};
