/* filters.js - Modular collection of filter and search handlers */

export const Filters = {
  /**
   * Filter an array of items by search text across specified keys
   * @param {Array<object>} items 
   * @param {string} query 
   * @param {Array<string>} keys 
   * @returns {Array<object>}
   */
  bySearch(items, query, keys) {
    if (!Array.isArray(items)) return [];
    if (!query || typeof query !== 'string' || query.trim() === '') return items;
    
    const lowerQuery = query.toLowerCase().trim();
    
    return items.filter(item => {
      return keys.some(key => {
        const val = item[key];
        if (val === undefined || val === null) return false;
        return String(val).toLowerCase().includes(lowerQuery);
      });
    });
  },

  /**
   * Filter items matching a specific status value
   * @param {Array<object>} items 
   * @param {string} status 
   * @param {string} statusKey 
   * @returns {Array<object>}
   */
  byStatus(items, status, statusKey = 'status') {
    if (!Array.isArray(items)) return [];
    if (!status || status === 'all' || status === '') return items;
    
    return items.filter(item => {
      const itemStatus = item[statusKey];
      if (itemStatus === undefined || itemStatus === null) return false;
      return String(itemStatus).toLowerCase() === String(status).toLowerCase();
    });
  },

  /**
   * Filter items between a date range
   * @param {Array<object>} items 
   * @param {string} dateKey 
   * @param {string|Date} startDate 
   * @param {string|Date} endDate 
   * @returns {Array<object>}
   */
  byDateRange(items, dateKey, startDate, endDate) {
    if (!Array.isArray(items)) return [];
    
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    if (start && isNaN(start.getTime())) return items;
    if (end && isNaN(end.getTime())) return items;
    
    return items.filter(item => {
      const itemDateVal = item[dateKey];
      if (!itemDateVal) return false;
      
      const itemDate = new Date(itemDateVal);
      if (isNaN(itemDate.getTime())) return false;
      
      if (start && itemDate < start) return false;
      if (end && itemDate > end) return false;
      
      return true;
    });
  }
};
