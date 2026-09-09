import { apiClient } from './apiClient.js';

export class GoalService {
  static async getGoals() {
    const data = await apiClient.get('/goals');
    return data.goals || [];
  }

  static async getGoalById(id) {
    const data = await apiClient.get(`/goals/${id}`);
    return data.goal;
  }

  static async createGoal(goalData) {
    const data = await apiClient.post('/goals', goalData);
    return data.goal;
  }

  static async updateGoal(id, updates) {
    const data = await apiClient.patch(`/goals/${id}`, updates);
    return data.goal;
  }

  static async deleteGoal(id) {
    const data = await apiClient.delete(`/goals/${id}`);
    return data;
  }
}
