import { apiClient } from './apiClient.js';

/**
 * Executive Overview API client (Sprint 11.1B).
 *
 * Thin wrapper over the existing apiClient, which supplies authentication,
 * timeouts and error normalisation. Every figure on the Executive Overview is
 * aggregated server-side (see server/services/executiveDashboardService.ts);
 * this client passes the response through untouched and never derives
 * health, progress, alignment or governance values itself.
 */
export class ExecutiveService {
  /**
   * @param {{portfolioId?:string, productId?:string}} params
   *   Only the two supported scope ids are ever sent; blanks are omitted.
   * @returns {Promise<object>} the server's ExecutiveOverview
   */
  static async getOverview(params = {}) {
    const query = new URLSearchParams();
    if (params.portfolioId) query.set('portfolioId', params.portfolioId);
    if (params.productId) query.set('productId', params.productId);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiClient.get(`/executive/overview${qs}`);
  }
}
