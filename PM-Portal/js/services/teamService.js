import { apiClient } from './apiClient.js';

export class TeamService {
  static async getTeams() {
    const data = await apiClient.get('/teams');
    return data.teams || [];
  }

  static async getTeamById(id) {
    const data = await apiClient.get(`/teams/${id}`);
    return data.team;
  }

  static async createTeam(teamData) {
    const data = await apiClient.post('/teams', teamData);
    return data.team;
  }

  static async updateTeam(id, updates) {
    const data = await apiClient.patch(`/teams/${id}`, updates);
    return data.team;
  }

  static async deleteTeam(id) {
    const data = await apiClient.delete(`/teams/${id}`);
    return data;
  }

  static async addMember(teamId, memberData) {
    const data = await apiClient.post(`/teams/${teamId}/members`, memberData);
    return data.team;
  }

  static async removeMember(teamId, userId) {
    const data = await apiClient.delete(`/teams/${teamId}/members/${userId}`);
    return data.team;
  }
}
