import { apiClient } from './apiClient.js';

export class StoryService {
  static async getStories(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/stories${qs}`);
    return data.stories || [];
  }

  static async getStoryById(id) {
    const data = await apiClient.get(`/stories/${id}`);
    return data.story;
  }

  static async createStory(storyData) {
    const data = await apiClient.post('/stories', storyData);
    return data.story;
  }

  static async updateStory(id, updates) {
    const data = await apiClient.patch(`/stories/${id}`, updates);
    return data.story;
  }

  static async deleteStory(id) {
    const data = await apiClient.delete(`/stories/${id}`);
    return data;
  }
}
