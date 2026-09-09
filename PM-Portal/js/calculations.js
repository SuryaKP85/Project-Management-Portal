/* calculations.js - Modular calculation helpers for Project & Resource metrics */

export const Calculations = {
  /**
   * Calculates a safe percentage value
   * @param {number} value 
   * @param {number} total 
   * @returns {number} 0-100 integer
   */
  percentage(value, total) {
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
  },

  /**
   * Calculate progression based on date ranges
   * @param {string|Date} startDateStr 
   * @param {string|Date} endDateStr 
   * @returns {number} Progress from 0 to 100
   */
  dateProgress(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    
    const totalDuration = end.getTime() - start.getTime();
    if (totalDuration <= 0) return 100;

    const elapsed = now.getTime() - start.getTime();
    return this.percentage(elapsed, totalDuration);
  },

  /**
   * Calculates remaining business days
   * @param {string|Date} targetDateStr 
   * @returns {number} Days remaining (positive or 0)
   */
  daysRemaining(targetDateStr) {
    const target = new Date(targetDateStr);
    const now = new Date();
    
    if (isNaN(target.getTime())) return 0;
    
    // Clear times for exact day calculations
    target.setHours(0,0,0,0);
    now.setHours(0,0,0,0);
    
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  },

  /**
   * Calculates resource capacity and utilization metrics based on standard daily (8h) or weekly (40h) capacity
   * @param {number} totalAllocatedHours 
   * @param {number} standardCapacity - 8 for daily, 40 for weekly
   */
  calculateCapacityMetrics(totalAllocatedHours = 0, standardCapacity = 8) {
    const allocated = Number(totalAllocatedHours) || 0;
    const capacity = Number(standardCapacity) || 8;
    const remaining = Math.max(0, capacity - allocated);
    const utilization = capacity > 0 ? Math.round((allocated / capacity) * 100) : 0;
    const overAllocation = allocated > capacity ? (allocated - capacity) : 0;
    const underUtilization = allocated < capacity ? (capacity - allocated) : 0;

    return {
      allocated,
      capacity,
      remaining,
      utilization,
      overAllocation,
      underUtilization,
      isOverAllocated: allocated > capacity,
      isUnderUtilized: allocated < capacity
    };
  },

  /**
   * Sums a field inside an array of objects
   * @param {Array<object>} items 
   * @param {string} key 
   * @returns {number}
   */
  sumField(items, key) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
  },

  /**
   * Calculates average completion rate of tasks or milestones
   * @param {Array<object>} items - Objects containing a 'progress' or 'completed' flag
   * @returns {number} Average progress percentage (0-100)
   */
  averageProgress(items) {
    if (!Array.isArray(items) || items.length === 0) return 0;
    const total = items.reduce((sum, item) => {
      if (item.progress !== undefined) {
        return sum + Number(item.progress);
      }
      return sum + (item.completed ? 100 : 0);
    }, 0);
    return Math.round(total / items.length);
  },

  /**
   * Safely escapes HTML strings to prevent Cross-Site Scripting (XSS)
   * @param {string} str 
   * @returns {string} Sanitized string
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
