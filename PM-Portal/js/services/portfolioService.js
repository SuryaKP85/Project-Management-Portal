import { apiClient } from './apiClient.js';

export class PortfolioService {
  static async getPortfolios() {
    const data = await apiClient.get('/portfolios');
    return data.portfolios || [];
  }

  static async getPortfolioById(id) {
    const data = await apiClient.get(`/portfolios/${id}`);
    return data.portfolio;
  }

  static async createPortfolio(portfolioData) {
    const data = await apiClient.post('/portfolios', portfolioData);
    return data.portfolio;
  }

  static async updatePortfolio(id, updates) {
    const data = await apiClient.patch(`/portfolios/${id}`, updates);
    return data.portfolio;
  }

  static async deletePortfolio(id) {
    const data = await apiClient.delete(`/portfolios/${id}`);
    return data;
  }
}
