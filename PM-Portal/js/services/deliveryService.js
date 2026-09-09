import { apiClient } from './apiClient.js';

export class DeliveryService {
  static async getTrace(entityType, id) {
    const data = await apiClient.get(`/delivery/trace/${entityType}/${id}`);
    return data.trace;
  }

  static async getSummary() {
    const data = await apiClient.get('/delivery/summary');
    return data.summary;
  }
}
