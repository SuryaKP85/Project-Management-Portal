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

  /** Sprint 23: POST /projects — the server assigns the id and code. */
  static async createProject(fields) {
    return ProjectService.createProject(fields);
  }

  /** Sprint 23: PATCH /projects/:id with just the given fields. */
  static async updateProject(id, changes) {
    return ProjectService.updateProject(id, changes);
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
        // Sprint 23: an empty list is an answer too — the browser copy never stands in for it.
        if (Array.isArray(apiProjects)) {
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

  /**
   * Sprint 23: projects are written one at a time, and only to the server.
   * Errors reach the caller (no silent fallback); callers update their own
   * list and the browser copy from the server's answer.
   */
  async createProject(fields) {
    return ApiAdapter.createProject(fields);
  }

  async updateProject(id, changes) {
    return ApiAdapter.updateProject(id, changes);
  }

  async deleteProject(id) {
    await ApiAdapter.deleteProject(id);
    const current = LocalStorageAdapter.get('projects', []) || [];
    LocalStorageAdapter.set('projects', current.filter((p) => p.id !== id && p.code !== id));
    return true;
  }

  /**
   * Sprint 23 — on sign-out the V1.1 project cache is settled and cleared, so
   * it can never show (or re-import) a stale project in a later session.
   * Projects that exist only in this browser are offered to the guarded
   * import first (POST /projects/migrate never overwrites); nothing is
   * dropped without the user's say. Returns false when the user chose to stay
   * signed in, in which case the cache is kept as it was.
   */
  async settleProjectCacheForLogout(confirmFn = (message) => window.confirm(message)) {
    const cached = LocalStorageAdapter.get('projects', []);
    if (Array.isArray(cached) && cached.length > 0) {
      let localOnly;
      try {
        const known = new Set((await ApiAdapter.getProjects()).flatMap((p) => [p.id, p.code]).filter(Boolean));
        localOnly = cached.filter((p) => p && typeof p === 'object' && !known.has(p.id) && !known.has(p.code));
      } catch (err) {
        if (!confirmFn('The server could not be reached to check for projects saved only in this browser.\n\nOK: sign out and clear the cached projects.\nCancel: stay signed in.')) return false;
        localOnly = [];
      }
      if (localOnly.length > 0) {
        const names = localOnly.slice(0, 10).map((p) => `- ${p.name || p.id}`).join('\n');
        if (!confirmFn(`${localOnly.length} project(s) exist only in this browser:\n${names}\n\nOK: save them to the server, then sign out.\nCancel: stay signed in.`)) return false;
        const result = await ApiAdapter.migrateLocalProjects(localOnly);
        if (result && result.skipped > 0 && !confirmFn(`${result.skipped} of them could not be saved (already on the server, or not valid).\n\nOK: sign out and discard those browser copies.\nCancel: stay signed in.`)) return false;
      }
    }
    this.clearProjectCache();
    return true;
  }

  /** Removes the V1.1 project cache (both storage keys it is kept under). */
  clearProjectCache() {
    LocalStorageAdapter.remove('projects');
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
