import { apiClient } from './apiClient.js';

/**
 * Roadmap API client (Sprint 9.4).
 *
 * Thin wrapper over the existing apiClient, which supplies authentication,
 * timeouts and error normalisation. Progress is never computed here: the
 * server returns `progress` and `progressSource` and this client passes them
 * through untouched.
 */
export class RoadmapService {
  /**
   * @param {{productId?:string, portfolioId?:string, projectId?:string,
   *          ownerId?:string, status?:string, priority?:string, search?:string}} params
   */
  static async getItems(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'all') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/roadmap${qs}`);
    return data.items || [];
  }

  static async getItemById(id) {
    const data = await apiClient.get(`/roadmap/${id}`);
    return data.item;
  }

  static async createItem(payload) {
    const data = await apiClient.post('/roadmap', payload);
    return data.item;
  }

  static async updateItem(id, updates) {
    const data = await apiClient.patch(`/roadmap/${id}`, updates);
    return data.item;
  }

  static async deleteItem(id) {
    return apiClient.delete(`/roadmap/${id}`);
  }

  /** @param {Array<{id:string, sequence:number}>} items */
  static async reorder(items) {
    return apiClient.put('/roadmap/reorder', { items });
  }

  /**
   * Initiatives aligned to a goal. The reverse of the link direction stored on
   * the server, which always treats the roadmap item as the source.
   */
  static async getItemsForGoal(goalId) {
    const data = await apiClient.get(`/goals/${goalId}/roadmap`);
    return data.items || [];
  }

  /**
   * Aligns an initiative to a goal. Only identifiers are sent: the server
   * resolves the goal's name itself, so no display text is submitted here.
   */
  static async linkGoal(roadmapId, goalId) {
    const data = await apiClient.post(`/roadmap/${roadmapId}/links`, {
      targetType: 'goal',
      targetId: goalId,
    });
    return data.link;
  }

  /** Removes one alignment by its server-issued link id. */
  static async unlinkGoal(roadmapId, linkId) {
    return apiClient.delete(`/roadmap/${roadmapId}/links/${linkId}`);
  }
}
