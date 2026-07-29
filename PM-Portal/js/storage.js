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
   * Clear all app-specific localStorage keys
   */
  clear() {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('pm_portal_')) {
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
  }
};
