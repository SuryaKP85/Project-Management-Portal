import { apiClient } from './apiClient.js';

export class FeatureService {
  static async getFeatures(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/features${qs}`);
    return data.features || [];
  }

  static async getFeatureById(id) {
    const data = await apiClient.get(`/features/${id}`);
    return data.feature;
  }

  static async createFeature(featureData) {
    const data = await apiClient.post('/features', featureData);
    return data.feature;
  }

  static async updateFeature(id, updates) {
    const data = await apiClient.patch(`/features/${id}`, updates);
    return data.feature;
  }

  static async deleteFeature(id) {
    const data = await apiClient.delete(`/features/${id}`);
    return data;
  }
}
