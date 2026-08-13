/* storage.js - LocalStorage management and persistent preferences */

export const Storage = {
  /**
   * Save a key-value pair to localStorage
   * @param {string} key 
   * @param {any} value 
   */
  set(key, value) {
    try {
      const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;
      localStorage.setItem(`pm_portal_${key}`, serializedValue);
    } catch (e) {
      console.error('Error writing to localStorage', e);
    }
  },

  /**
   * Get a value from localStorage
   * @param {string} key 
   * @param {any} defaultValue 
   * @returns {any}
   */
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(`pm_portal_${key}`);
      if (item === null) return defaultValue;
      
      // Try to parse as JSON, if it fails, return the raw string
      try {
        return JSON.parse(item);
      } catch {
        return item;
      }
    } catch (e) {
      console.error('Error reading from localStorage', e);
      return defaultValue;
    }
  },

  /**
   * Remove a key from localStorage
   * @param {string} key 
   */
  remove(key) {
    localStorage.removeItem(`pm_portal_${key}`);
  },

  /**
   * Clear all app-specific localStorage keys and imported spreadsheets
   */
  clear() {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('pm_portal_') || key === 'excel_imported_data' || key === 'leaves' || key === 'weekend_logs') {
        localStorage.removeItem(key);
      }
    });
  },

  /**
   * Get user theme setting (dark/light)
   * @returns {string}
   */
  getTheme() {
    return this.get('theme', 'light');
  },

  /**
   * Set user theme setting (dark/light)
   * @param {string} theme 
   */
  setTheme(theme) {
    this.set('theme', theme);
  },

  /* Domain entity accessors */
  getProjects() {
    const res = this.get('projects');
    return Array.isArray(res) ? res : [];
  },
  getResources() {
    const res = this.get('resources');
    return Array.isArray(res) ? res : [];
  },
  getCustomers() {
    const res = this.get('customers');
    return Array.isArray(res) ? res : [];
  },
  getTimeLogs() {
    const res = this.get('time_logs');
    return Array.isArray(res) ? res : [];
  },
  getRisks() {
    const res = this.get('risk_escalations');
    return Array.isArray(res) ? res : [];
  },
  getUserStories() {
    const res = this.get('risk_overdue_stories');
    return Array.isArray(res) ? res : [];
  },
  getLeaves() {
    const res = this.get('leaves');
    return Array.isArray(res) ? res : [];
  },
  getWeekendWork() {
    const res = this.get('weekend_logs');
    return Array.isArray(res) ? res : [];
  },

  /* Domain entity mutators */
  saveProjects(data) {
    this.set('projects', data);
  },
  saveResources(data) {
    this.set('resources', data);
  },
  saveCustomers(data) {
    this.set('customers', data);
  },
  saveTimeLogs(data) {
    this.set('time_logs', data);
  },
  saveLeaves(data) {
    this.set('leaves', data);
  },
  saveWeekendWork(data) {
    this.set('weekend_logs', data);
  },
  saveRisks(data) {
    this.set('risk_escalations', data);
  },
  saveUserStories(data) {
    this.set('risk_overdue_stories', data);
  }
};
