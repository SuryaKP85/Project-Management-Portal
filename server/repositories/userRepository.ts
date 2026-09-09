import { User, SafeUser } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { hashPassword } from '../auth/password';

// In-memory store for standalone/local development
const memoryUsers: Map<string, User> = new Map();

// Seed initial users
async function seedDefaultUsers() {
  if (memoryUsers.size > 0) return;
  
  const adminHash = await hashPassword('iRely@123');
  const userHash = await hashPassword('User@123');

  const defaultUsers: User[] = [
    {
      id: 'usr_admin_1',
      email: 'surya.prashanth.kp@gmail.com',
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
      passwordHash: userHash,
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
  ];

  defaultUsers.forEach((u) => memoryUsers.set(u.id, u));
}

seedDefaultUsers();

export function sanitizeUser(user: User): SafeUser {
  const { passwordHash, ...safe } = user;
  return safe;
}

export const UserRepository = {
  async findById(id: string): Promise<User | null> {
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
      };
    }
    return memoryUsers.get(id) || null;
  },

  async findByEmail(email: string): Promise<User | null> {
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
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: User = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (isDbConnected()) {
      await query(
        `UPDATE users SET first_name = $1, last_name = $2, role = $3, department = $4, title = $5, avatar_url = $6, is_active = $7, updated_at = $8 WHERE id = $9`,
        [
          updated.firstName,
          updated.lastName,
          updated.role,
          updated.department || null,
          updated.title || null,
          updated.avatarUrl || null,
          updated.isActive,
          updated.updatedAt,
          id,
        ]
      );
    }

    memoryUsers.set(id, updated);
    return sanitizeUser(updated);
  },
};
