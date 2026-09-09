/**
 * Storage Migration Strategy & Dual Data Adapter for Surya PM Portal V2.0
 * Allows the application to run seamlessly across LocalStorage (V1.1 fallback) and V2 REST APIs.
 */
import { Storage } from '../storage.js';
import { ProjectService } from './projectService.js';
import { ProductService } from './productService.js';
import { PortfolioService } from './portfolioService.js';
import { GoalService } from './goalService.js';
import { UserService } from './userService.js';
import { TeamService } from './teamService.js';

export class LocalStorageAdapter {
  static get(key, defaultValue = null) {
    try {
      const val = Storage.get(key);
      if (val !== null && val !== undefined) return val;
      const direct = localStorage.getItem(key);
      return direct ? JSON.parse(direct) : defaultValue;
    } catch (e) {
      console.error(`LocalStorage get error for ${key}:`, e);
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      Storage.set(key, value);
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`LocalStorage set error for ${key}:`, e);
      return false;
    }
  }

  static remove(key) {
    try {
      Storage.remove(key);
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error(`LocalStorage remove error for ${key}:`, e);
      return false;
    }
  }
}

export class ApiAdapter {
  static async getProjects() {
    return ProjectService.getProjects();
  }

  static async saveProject(project) {
    if (project.id && !project.isNew) {
      return ProjectService.updateProject(project.id, project);
    }
    return ProjectService.createProject(project);
  }

  static async deleteProject(id) {
    return ProjectService.deleteProject(id);
  }

  static async migrateLocalProjects(localProjects) {
    return ProjectService.migrateProjects(localProjects);
  }

  static async getPortfolios() {
    return PortfolioService.getPortfolios();
  }

  static async savePortfolio(portfolio) {
    if (portfolio.id && !portfolio.isNew) {
      return PortfolioService.updatePortfolio(portfolio.id, portfolio);
    }
    return PortfolioService.createPortfolio(portfolio);
  }

  static async deletePortfolio(id) {
    return PortfolioService.deletePortfolio(id);
  }

  static async getProducts() {
    return ProductService.getProducts();
  }

  static async saveProduct(product) {
    if (product.id && !product.isNew) {
      return ProductService.updateProduct(product.id, product);
    }
    return ProductService.createProduct(product);
  }

  static async deleteProduct(id) {
    return ProductService.deleteProduct(id);
  }

  static async getGoals() {
    return GoalService.getGoals();
  }

  static async saveGoal(goal) {
    if (goal.id && !goal.isNew) {
      return GoalService.updateGoal(goal.id, goal);
    }
    return GoalService.createGoal(goal);
  }

  static async deleteGoal(id) {
    return GoalService.deleteGoal(id);
  }

  static async getUsers() {
    return UserService.getUsers();
  }

  static async getTeams() {
    return TeamService.getTeams();
  }

  static async saveTeam(team) {
    if (team.id && !team.isNew) {
      return TeamService.updateTeam(team.id, team);
    }
    return TeamService.createTeam(team);
  }

  static async deleteTeam(id) {
    return TeamService.deleteTeam(id);
  }
}

export class DataService {
  constructor(mode = 'hybrid') {
    this.mode = mode; // 'api' | 'local' | 'hybrid'
    this.hasMigratedProjects = false;
  }

  async getProjects() {
    if (this.mode === 'api' || this.mode === 'hybrid') {
      try {
        const apiProjects = await ApiAdapter.getProjects();
        if (apiProjects && Array.isArray(apiProjects) && apiProjects.length > 0) {
          // Keep local storage up-to-date for backward compatibility & offline resiliency
          LocalStorageAdapter.set('projects', apiProjects);
          return apiProjects;
        }
      } catch (err) {
        console.warn('API getProjects failed, falling back to LocalStorage:', err);
      }
    }
    // Fallback to local storage
    const local = LocalStorageAdapter.get('projects', []);
    return Array.isArray(local) ? local : [];
  }

  async saveProjects(projects) {
    // Persist to local storage for instant UI and fallback
    LocalStorageAdapter.set('projects', projects);

    if (this.mode === 'api' || this.mode === 'hybrid') {
      // In hybrid mode, sync any pending project creations or updates
      try {
        for (const p of projects) {
          await ApiAdapter.saveProject(p).catch(() => {});
        }
      } catch (e) {
        console.warn('Syncing projects to API had some issues:', e);
      }
    }
    return true;
  }

  async saveSingleProject(project) {
    let saved = project;
    if (this.mode === 'api' || this.mode === 'hybrid') {
      try {
        saved = await ApiAdapter.saveProject(project);
      } catch (e) {
        console.warn('API saveSingleProject failed, persisting locally:', e);
      }
    }

    // Update in local cache
    const current = LocalStorageAdapter.get('projects', []) || [];
    const idx = current.findIndex((p) => p.id === (saved.id || project.id));
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...saved };
    } else {
      current.unshift(saved);
    }
    LocalStorageAdapter.set('projects', current);
    return saved;
  }

  async deleteProject(id) {
    if (this.mode === 'api' || this.mode === 'hybrid') {
      try {
        await ApiAdapter.deleteProject(id);
      } catch (e) {
        console.warn('API deleteProject failed:', e);
      }
    }
    const current = LocalStorageAdapter.get('projects', []) || [];
    const filtered = current.filter((p) => p.id !== id && p.code !== id);
    LocalStorageAdapter.set('projects', filtered);
    return true;
  }

  /**
   * Safe migration of LocalStorage project records to V2 PostgreSQL backend
   */
  async autoMigrateLocalProjects() {
    if (this.hasMigratedProjects) return;
    const migratedMarker = Storage.get('v2_projects_migrated_at');
    const localProjects = Storage.get('projects') || [];

    if (!migratedMarker && Array.isArray(localProjects) && localProjects.length > 0) {
      try {
        console.log(`[DataService] Migrating ${localProjects.length} local project records to V2 API...`);
        const result = await ApiAdapter.migrateLocalProjects(localProjects);
        Storage.set('v2_projects_migrated_at', new Date().toISOString());
        this.hasMigratedProjects = true;
        console.log('[DataService] Migration completed successfully:', result);
        return result;
      } catch (e) {
        console.warn('[DataService] Local project migration deferred or failed:', e);
      }
    }
    this.hasMigratedProjects = true;
  }

  async getTeams() {
    if (this.mode === 'api' || this.mode === 'hybrid') {
      try {
        const teams = await ApiAdapter.getTeams();
        if (teams && Array.isArray(teams) && teams.length > 0) {
          return teams;
        }
      } catch (err) {
        console.warn('API getTeams failed, fallback to local resources:', err);
      }
    }
    return LocalStorageAdapter.get('resources', []);
  }

  async getPortfolios() {
    if (this.mode === 'api' || this.mode === 'hybrid') {
      try {
        return await ApiAdapter.getPortfolios();
      } catch (err) {
        console.warn('API getPortfolios failed:', err);
      }
    }
    return LocalStorageAdapter.get('portfolios', []);
  }

  async getProducts() {
    if (this.mode === 'api' || this.mode === 'hybrid') {
      try {
        return await ApiAdapter.getProducts();
      } catch (err) {
        console.warn('API getProducts failed:', err);
      }
    }
    return LocalStorageAdapter.get('products', []);
  }

  async getGoals() {
    if (this.mode === 'api' || this.mode === 'hybrid') {
      try {
        return await ApiAdapter.getGoals();
      } catch (err) {
        console.warn('API getGoals failed:', err);
      }
    }
    return LocalStorageAdapter.get('goals', []);
  }
}

export const dataService = new DataService('hybrid');
