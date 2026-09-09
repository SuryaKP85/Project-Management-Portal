import { Portfolio } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryPortfolios: Map<string, Portfolio> = new Map();

function seedDefaultPortfolios() {
  if (memoryPortfolios.size > 0) return;
  const defaults: Portfolio[] = [
    {
      id: 'port_1',
      code: 'PORT-AERO',
      name: 'Aerospace & Mission Systems',
      description: 'Critical flight control, telemetry, and autonomous deep space guidance platforms.',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      status: 'active',
      health: 'healthy',
      productCount: 2,
      projectCount: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'port_2',
      code: 'PORT-CORP',
      name: 'Enterprise Cloud Operations',
      description: 'Next-generation cloud infrastructure, microservices orchestration, and AI copilots.',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      status: 'active',
      health: 'caution',
      productCount: 1,
      projectCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  defaults.forEach((p) => memoryPortfolios.set(p.id, p));
}

seedDefaultPortfolios();

export const PortfolioRepository = {
  async findAll(): Promise<Portfolio[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM portfolios ORDER BY created_at DESC');
      return res.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        ownerId: r.owner_id,
        status: r.status,
        health: r.health,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }
    return Array.from(memoryPortfolios.values());
  },

  async findById(id: string): Promise<Portfolio | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM portfolios WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        ownerId: r.owner_id,
        status: r.status,
        health: r.health,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memoryPortfolios.get(id) || null;
  },

  async create(portfolioData: Partial<Portfolio>): Promise<Portfolio> {
    const id = portfolioData.id || `port_${Date.now()}`;
    const code = portfolioData.code || `PORT-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const newPortfolio: Portfolio = {
      id,
      code,
      name: portfolioData.name || 'Untitled Portfolio',
      description: portfolioData.description || '',
      ownerId: portfolioData.ownerId || 'usr_admin_1',
      ownerName: portfolioData.ownerName || 'Surya Prashanth',
      status: portfolioData.status || 'active',
      health: portfolioData.health || 'healthy',
      productCount: portfolioData.productCount || 0,
      projectCount: portfolioData.projectCount || 0,
      createdAt: now,
      updatedAt: now,
    };

    if (isDbConnected()) {
      await query(
        `INSERT INTO portfolios (id, code, name, description, owner_id, status, health, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newPortfolio.id,
          newPortfolio.code,
          newPortfolio.name,
          newPortfolio.description,
          newPortfolio.ownerId,
          newPortfolio.status,
          newPortfolio.health,
          newPortfolio.createdAt,
          newPortfolio.updatedAt,
        ]
      );
    }

    memoryPortfolios.set(id, newPortfolio);
    return newPortfolio;
  },

  async update(id: string, updates: Partial<Portfolio>): Promise<Portfolio | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: Portfolio = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (isDbConnected()) {
      await query(
        `UPDATE portfolios SET name = $1, description = $2, status = $3, health = $4, owner_id = $5, updated_at = $6
         WHERE id = $7`,
        [
          updated.name,
          updated.description,
          updated.status,
          updated.health,
          updated.ownerId,
          updated.updatedAt,
          id,
        ]
      );
    }

    memoryPortfolios.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      await query('DELETE FROM portfolios WHERE id = $1', [id]);
    }
    return memoryPortfolios.delete(id);
  },
};
