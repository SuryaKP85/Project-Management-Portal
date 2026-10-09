import { User, SafeUser } from '../models/types';
import { config } from '../config/env';
import { persistentMap, skipDemoSeed } from '../config/persistence';
import { isDbConnected, query } from '../config/database';
import { hashPassword, verifyPassword } from '../auth/password';

// In-memory store for standalone/local development
// Sprint 20: restored from / saved to the embedded data file in persistent mode.
const memoryUsers = persistentMap<User>('users');

// Seed initial users
async function seedDefaultUsers() {
  if (memoryUsers.size > 0 || skipDemoSeed()) return;
  // Sprint 20: the demo accounts below have known passwords (they are in this file), so they are
  // development/demo data only. In production nothing is seeded: the first administrator comes
  // from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD (bootstrapAdmin.ts), as for PostgreSQL.
  if (config.isProduction) return;
  
  const adminHash = await hashPassword('iRely@123');
  const userHash = await hashPassword('User@123');
  // The portal's default local accounts share these credentials. Seeding them
  // server-side lets a single sign-in at login.html establish both the V1.1
  // local session and the V2 JWT session with the same credentials.
  const portalAdminHash = await hashPassword('Admin@123');
  const portalUserHash = await hashPassword('iRely@123');

  const defaultUsers: User[] = [
    {
      id: 'usr_admin_1',
      email: 'surya.prashanth@company.com', // Sprint 25: a demo address, never a personal one
      passwordHash: adminHash,
      firstName: 'Surya',
      lastName: 'Prashanth',
      role: 'admin',
      title: 'Head of Product & Delivery',
      department: 'Engineering & Product',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr_pm_2',
      email: 'alex.morgan@company.com',
      passwordHash: userHash,
      firstName: 'Alex',
      lastName: 'Morgan',
      role: 'project-manager',
      title: 'Senior Technical Project Manager',
      department: 'Program Management',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr_dev_3',
      email: 'sarah.connor@company.com',
      // Aligned with the portal's local default credentials so the V2 session
      // bridge works for this account too. Identity, role and title are
      // unchanged — other modules and tests reference usr_dev_3 directly.
      passwordHash: portalUserHash,
      firstName: 'Sarah',
      lastName: 'Connor',
      role: 'team-member',
      title: 'Staff Full-Stack Engineer',
      department: 'Core Platform',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // --- Portal default accounts (mirrors PM-Portal/js/authentication.js) ---
    {
      id: 'usr_portal_admin',
      email: 'admin@company.com',
      passwordHash: portalAdminHash,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'admin',
      title: 'Portal Administrator',
      department: 'Dev',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr_portal_pm',
      email: 'john.doe@company.com',
      passwordHash: portalUserHash,
      firstName: 'John',
      lastName: 'Doe',
      role: 'project-manager',
      title: 'Project Manager',
      department: 'Dev',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr_portal_dev',
      email: 'alice.smith@company.com',
      passwordHash: portalUserHash,
      firstName: 'Alice',
      lastName: 'Smith',
      role: 'team-member',
      title: 'Developer',
      department: 'Dev',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr_portal_qa',
      email: 'david.miller@company.com',
      passwordHash: portalUserHash,
      firstName: 'David',
      lastName: 'Miller',
      role: 'team-member',
      title: 'QA Analyst',
      department: 'QA',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  defaultUsers.forEach((u) => memoryUsers.set(u.id, u));
}

/**
 * Seeding hashes passwords asynchronously, so it cannot complete during module
 * evaluation. Every repository method awaits this promise before touching the
 * in-memory store, otherwise an early caller can observe an empty store.
 */
const seedReady: Promise<void> = seedDefaultUsers();

export function sanitizeUser(user: User): SafeUser {
  const { passwordHash, tokenVersion, ...safe } = user;
  return safe;
}

/**
 * Sprint 25 — the columns update() may write, each only when its key is supplied:
 * a profile save never rewrites role or is_active from a stale read, and a role or
 * status change touches nothing else.
 */
const UPDATABLE_COLUMNS: Record<string, string> = {
  firstName: 'first_name', lastName: 'last_name', role: 'role', department: 'department', title: 'title',
  avatarUrl: 'avatar_url', isActive: 'is_active', msUserId: 'ms_user_id', msTenantId: 'ms_tenant_id',
};
/** Changes that end every existing session of the account (Sprint 25). */
const SESSION_ENDING_FIELDS = ['role', 'isActive'];

/** The seeded demo accounts and their published passwords (Sprint 25: used to refuse unsafe startups). */
export const DEMO_ACCOUNT_IDS = ['usr_admin_1', 'usr_pm_2', 'usr_dev_3', 'usr_portal_admin', 'usr_portal_pm', 'usr_portal_dev', 'usr_portal_qa'];
const DEMO_PASSWORDS = ['iRely@123', 'User@123', 'Admin@123'];

export const UserRepository = {
  async findById(id: string): Promise<User | null> {
    await seedReady;
    if (isDbConnected()) {
      const res = await query('SELECT * FROM users WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.role,
        avatarUrl: row.avatar_url,
        department: row.department,
        title: row.title,
        msUserId: row.ms_user_id,
        msTenantId: row.ms_tenant_id,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tokenVersion: Number(row.token_version ?? 0),
      };
    }
    return memoryUsers.get(id) || null;
  },

  async findByEmail(email: string): Promise<User | null> {
    await seedReady;
    const normalizedEmail = email.toLowerCase().trim();
    if (isDbConnected()) {
      const res = await query('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.role,
        avatarUrl: row.avatar_url,
        department: row.department,
        title: row.title,
        msUserId: row.ms_user_id,
        msTenantId: row.ms_tenant_id,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tokenVersion: Number(row.token_version ?? 0),
      };
    }
    for (const user of memoryUsers.values()) {
      if (user.email.toLowerCase() === normalizedEmail) {
        return user;
      }
    }
    return null;
  },

  async findAll(): Promise<SafeUser[]> {
    await seedReady;
    if (isDbConnected()) {
      const res = await query('SELECT id, email, first_name, last_name, role, avatar_url, department, title, ms_user_id, ms_tenant_id, is_active, created_at, updated_at FROM users ORDER BY created_at ASC');
      return res.rows.map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.role,
        avatarUrl: row.avatar_url,
        department: row.department,
        title: row.title,
        msUserId: row.ms_user_id,
        msTenantId: row.ms_tenant_id,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    }
    return Array.from(memoryUsers.values()).map(sanitizeUser);
  },

  async create(user: User): Promise<SafeUser> {
    await seedReady;
    if (isDbConnected()) {
      await query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, avatar_url, department, title, ms_user_id, ms_tenant_id, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          user.id,
          user.email.toLowerCase().trim(),
          user.passwordHash,
          user.firstName,
          user.lastName,
          user.role,
          user.avatarUrl || null,
          user.department || null,
          user.title || null,
          user.msUserId || null,
          user.msTenantId || null,
          user.isActive ?? true,
          user.createdAt,
          user.updatedAt,
        ]
      );
    }
    memoryUsers.set(user.id, user);
    return sanitizeUser(user);
  },

  async update(id: string, updates: Partial<User>): Promise<SafeUser | null> {
    await seedReady;
    // Sprint 25: only the supplied columns are written (never a stale copy of the others),
    // and a role or status change ends the account's existing sessions.
    const keys = Object.keys(updates).filter((k) => k in UPDATABLE_COLUMNS && (updates as any)[k] !== undefined);
    const endsSessions = keys.some((k) => SESSION_ENDING_FIELDS.includes(k));
    const updatedAt = new Date().toISOString();

    if (isDbConnected()) {
      const sets = keys.map((k, i) => `${UPDATABLE_COLUMNS[k]} = $${i + 1}`);
      const values = keys.map((k) => (k === 'isActive' ? (updates as any)[k] : (updates as any)[k] || null));
      sets.push(`updated_at = $${keys.length + 1}`);
      if (endsSessions) sets.push('token_version = token_version + 1');
      const res = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${keys.length + 2}`, [...values, updatedAt, id]);
      if (!res.rowCount) return null;
      const fresh = await this.findById(id);
      return fresh ? sanitizeUser(fresh) : null;
    }

    const current = memoryUsers.get(id);
    if (!current) return null;
    const updated: User = { ...current, updatedAt };
    for (const k of keys) (updated as any)[k] = (updates as any)[k];
    if (endsSessions) updated.tokenVersion = (current.tokenVersion ?? 0) + 1;
    memoryUsers.set(id, updated);
    return sanitizeUser(updated);
  },

  /**
   * Sprint 12: replaces a user's password hash. Kept apart from update() so the
   * hash is never carried inside a general-purpose profile update.
   * Sprint 25: a new password ends every existing session of the account.
   */
  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    await seedReady;
    const updatedAt = new Date().toISOString();
    if (isDbConnected()) {
      const res = await query('UPDATE users SET password_hash = $1, updated_at = $2, token_version = token_version + 1 WHERE id = $3', [passwordHash, updatedAt, id]);
      return !!res.rowCount;
    }
    const current = memoryUsers.get(id);
    if (!current) return false;
    memoryUsers.set(id, { ...current, passwordHash, updatedAt, tokenVersion: (current.tokenVersion ?? 0) + 1 });
    return true;
  },

  /** Sprint 25: ends every session of the account (sign-out). */
  async bumpTokenVersion(id: string): Promise<boolean> {
    await seedReady;
    if (isDbConnected()) {
      const res = await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [id]);
      return !!res.rowCount;
    }
    const current = memoryUsers.get(id);
    if (!current) return false;
    memoryUsers.set(id, { ...current, tokenVersion: (current.tokenVersion ?? 0) + 1 });
    return true;
  },

  /**
   * Sprint 25: the seeded demo accounts that are active and still accept a password
   * published in this file. Used to refuse a production start, or a network-facing
   * one, while anyone could sign in with them.
   */
  async activeDemoAccounts(): Promise<string[]> {
    await seedReady;
    const found: string[] = [];
    for (const id of DEMO_ACCOUNT_IDS) {
      const user = await this.findById(id);
      if (!user || !user.isActive || !user.passwordHash) continue;
      for (const password of DEMO_PASSWORDS) {
        if (await verifyPassword(password, user.passwordHash)) {
          found.push(user.email);
          break;
        }
      }
    }
    return found;
  },

  /** Sprint 10A: the portal user linked to a Microsoft Graph user id, if any. */
  async findByMsUserId(msUserId: string): Promise<SafeUser | null> {
    await seedReady;
    if (!msUserId) return null;
    if (isDbConnected()) {
      const res = await query('SELECT id FROM users WHERE ms_user_id = $1', [msUserId]);
      if (res.rows.length === 0) return null;
      const user = await this.findById(res.rows[0].id);
      return user ? sanitizeUser(user) : null;
    }
    for (const user of memoryUsers.values()) {
      if (user.msUserId === msUserId) return sanitizeUser(user);
    }
    return null;
  },

  /**
   * Sprint 10A: records the Microsoft identity association only. Profile
   * fields, role and active status are never touched by the integration.
   */
  async setMicrosoftIdentity(id: string, msUserId: string, msTenantId?: string): Promise<SafeUser | null> {
    await seedReady;
    const existing = await this.findById(id);
    if (!existing) return null;
    const updatedAt = new Date().toISOString();
    if (isDbConnected()) {
      await query('UPDATE users SET ms_user_id = $1, ms_tenant_id = $2, updated_at = $3 WHERE id = $4', [msUserId, msTenantId || null, updatedAt, id]);
    }
    const updated: User = { ...existing, msUserId, msTenantId: msTenantId || undefined, updatedAt };
    memoryUsers.set(id, updated);
    return sanitizeUser(updated);
  },

  /** Sprint 10A: removes the Microsoft identity association (disconnect). */
  async clearMicrosoftIdentity(id: string): Promise<SafeUser | null> {
    await seedReady;
    const existing = await this.findById(id);
    if (!existing) return null;
    const updatedAt = new Date().toISOString();
    if (isDbConnected()) {
      await query('UPDATE users SET ms_user_id = NULL, ms_tenant_id = NULL, updated_at = $1 WHERE id = $2', [updatedAt, id]);
    }
    const { msUserId: _drop, msTenantId: _dropTenant, ...rest } = existing;
    const updated: User = { ...rest, updatedAt };
    memoryUsers.set(id, updated);
    return sanitizeUser(updated);
  },
};
