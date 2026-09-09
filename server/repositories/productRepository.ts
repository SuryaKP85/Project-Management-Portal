import { Product } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryProducts: Map<string, Product> = new Map();

function seedDefaultProducts() {
  if (memoryProducts.size > 0) return;
  const defaultProducts: Product[] = [
    {
      id: 'prod_1',
      code: 'PROD-ARES',
      name: 'Ares Autonomous Flight Stack',
      description: 'Unified product management, strategy, and execution governance platform for launch vehicles.',
      status: 'in-development',
      health: 'on-track',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      category: 'Mission Avionics',
      targetAudience: 'Flight operations, guidance engineers, telemetry specialists',
      vision: 'Self-correcting, autonomous orbital insertion software with zero manual ground overrides.',
      strategicObjective: 'Deliver primary guidance stack for upcoming commercial launch cadence.',
      startDate: '2026-01-15',
      targetDate: '2026-11-30',
      targetRelease: '2026-Q4',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod_2',
      code: 'PROD-HELIOS',
      name: 'Helios Deep Space Telemetry Suite',
      description: 'Ultra-low latency packet multiplexing, automated health monitoring, and anomaly detection.',
      status: 'in-development',
      health: 'at-risk',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      category: 'Telemetry & Ground Station',
      targetAudience: 'Ground controllers and payload scientists',
      vision: 'Sub-20ms packet resolution across heterogeneous ground relays.',
      strategicObjective: 'Eliminate telemetry blackouts during atmospheric re-entry corridors.',
      startDate: '2026-03-01',
      targetDate: '2026-10-15',
      targetRelease: '2026-Q3',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  defaultProducts.forEach((p) => memoryProducts.set(p.id, p));
}

seedDefaultProducts();

export const ProductRepository = {
  async findAll(): Promise<Product[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM products ORDER BY created_at DESC');
      return res.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        status: r.status,
        health: r.health,
        ownerId: r.owner_id,
        teamId: r.team_id,
        portfolioId: r.portfolio_id,
        category: r.category,
        targetAudience: r.target_audience,
        vision: r.vision,
        strategicObjective: r.strategic_objective,
        startDate: r.start_date,
        targetDate: r.target_date,
        targetRelease: r.target_release,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }
    return Array.from(memoryProducts.values());
  },

  async findById(id: string): Promise<Product | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM products WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        status: r.status,
        health: r.health,
        ownerId: r.owner_id,
        teamId: r.team_id,
        portfolioId: r.portfolio_id,
        category: r.category,
        targetAudience: r.target_audience,
        vision: r.vision,
        strategicObjective: r.strategic_objective,
        startDate: r.start_date,
        targetDate: r.target_date,
        targetRelease: r.target_release,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memoryProducts.get(id) || null;
  },

  async create(product: Partial<Product>): Promise<Product> {
    const id = product.id || `prod_${Date.now()}`;
    const code = product.code || `PROD-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const newProduct: Product = {
      id,
      code,
      name: product.name || 'Untitled Product',
      description: product.description || '',
      status: product.status || 'in-development',
      health: product.health || 'on-track',
      ownerId: product.ownerId || 'usr_admin_1',
      ownerName: product.ownerName || 'Surya Prashanth',
      teamId: product.teamId,
      teamName: product.teamName,
      category: product.category,
      targetAudience: product.targetAudience,
      vision: product.vision,
      strategicObjective: product.strategicObjective,
      startDate: product.startDate,
      targetDate: product.targetDate,
      portfolioId: product.portfolioId,
      portfolioName: product.portfolioName,
      targetRelease: product.targetRelease,
      createdAt: now,
      updatedAt: now,
    };

    if (isDbConnected()) {
      await query(
        `INSERT INTO products (id, code, name, description, status, health, owner_id, team_id, portfolio_id, category, target_audience, vision, strategic_objective, start_date, target_date, target_release, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          newProduct.id,
          newProduct.code,
          newProduct.name,
          newProduct.description,
          newProduct.status,
          newProduct.health,
          newProduct.ownerId || null,
          newProduct.teamId || null,
          newProduct.portfolioId || null,
          newProduct.category || null,
          newProduct.targetAudience || null,
          newProduct.vision || null,
          newProduct.strategicObjective || null,
          newProduct.startDate || null,
          newProduct.targetDate || null,
          newProduct.targetRelease || null,
          newProduct.createdAt,
          newProduct.updatedAt,
        ]
      );
    }
    memoryProducts.set(id, newProduct);
    return newProduct;
  },

  async update(id: string, updates: Partial<Product>): Promise<Product | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: Product = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (isDbConnected()) {
      await query(
        `UPDATE products SET name = $1, description = $2, status = $3, health = $4, owner_id = $5, team_id = $6, portfolio_id = $7, category = $8, target_audience = $9, vision = $10, strategic_objective = $11, start_date = $12, target_date = $13, target_release = $14, updated_at = $15
         WHERE id = $16`,
        [
          updated.name,
          updated.description,
          updated.status,
          updated.health,
          updated.ownerId || null,
          updated.teamId || null,
          updated.portfolioId || null,
          updated.category || null,
          updated.targetAudience || null,
          updated.vision || null,
          updated.strategicObjective || null,
          updated.startDate || null,
          updated.targetDate || null,
          updated.targetRelease || null,
          updated.updatedAt,
          id,
        ]
      );
    }
    memoryProducts.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      await query('DELETE FROM products WHERE id = $1', [id]);
    }
    return memoryProducts.delete(id);
  },
};
