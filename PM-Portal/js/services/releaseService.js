import { apiClient } from './apiClient.js';

export class ReleaseService {
  static async getReleases(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/releases${qs}`);
    return data.releases || [];
  }

  static async getReleaseById(id) {
    const data = await apiClient.get(`/releases/${id}`);
    return data.release;
  }

  static async createRelease(releaseData) {
    const data = await apiClient.post('/releases', releaseData);
    return data.release;
  }

  static async updateRelease(id, updates) {
    const data = await apiClient.put(`/releases/${id}`, updates);
    return data.release;
  }

  static async deleteRelease(id) {
    return apiClient.delete(`/releases/${id}`);
  }

  static async addItem(releaseId, itemType, itemId, itemCode, itemTitle, status, progress) {
    const data = await apiClient.post(`/releases/${releaseId}/items`, {
      itemType,
      itemId,
      itemCode,
      itemTitle,
      status,
      progress,
    });
    return data.item;
  }

  static async removeItem(releaseId, itemId) {
    return apiClient.delete(`/releases/${releaseId}/items/${itemId}`);
  }
}
