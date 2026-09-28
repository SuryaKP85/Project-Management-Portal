import { UserRepository } from '../repositories/userRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { hashPassword } from '../auth/password';
import { SafeUser, UserRole } from '../models/types';
import crypto from 'crypto';

/** Profile fields a user (or an admin) may change through PATCH /users/:id. Role and status have their own endpoints. */
export const PROFILE_FIELDS = ['firstName', 'lastName', 'department', 'title', 'avatarUrl'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileUpdates = Partial<Record<ProfileField, string>>;

/** Typed error the global errorHandler maps to its status and code. */
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}

function actorName(actor: SafeUser): string {
  return `${actor.firstName} ${actor.lastName}`.trim();
}

async function logUserActivity(entityId: string, action: 'update' | 'status_change', actor: SafeUser, details: Record<string, unknown>) {
  await ActivityRepository.create({
    id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    entityType: 'user',
    entityId,
    action,
    actorId: actor.id,
    actorName: actorName(actor),
    details,
    createdAt: new Date().toISOString(),
  });
}

export const UserService = {
  /** Active users by default; inactive accounts only when the caller (an admin, enforced by the controller) asks. */
  async getAllUsers(options: { includeInactive?: boolean } = {}): Promise<SafeUser[]> {
    const users = await UserRepository.findAll();
    return options.includeInactive ? users : users.filter((u) => u.isActive !== false);
  },

  async getUserById(id: string): Promise<SafeUser | null> {
    const user = await UserRepository.findById(id);
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  },

  async updateUserRole(id: string, newRole: UserRole, actorUser: SafeUser): Promise<SafeUser | null> {
    const updated = await UserRepository.update(id, { role: newRole });
    if (updated) {
      await logUserActivity(id, 'status_change', actorUser, { newRole });
    }
    return updated;
  },

  /**
   * Sprint 12: profile fields only. A user may edit their own record; an admin
   * may edit anyone's. Anything outside PROFILE_FIELDS in `updates` is ignored,
   * so role and isActive can never travel through this path.
   */
  async updateProfile(id: string, updates: Record<string, unknown>, actorUser: SafeUser): Promise<SafeUser | null> {
    if (actorUser.id !== id && actorUser.role !== 'admin') {
      throw httpError(403, 'FORBIDDEN', 'You may only edit your own profile.');
    }
    const clean: ProfileUpdates = {};
    for (const field of PROFILE_FIELDS) {
      const value = updates[field];
      if (value === undefined) continue;
      if (typeof value !== 'string') {
        throw httpError(400, 'VALIDATION_ERROR', `Field '${field}' must be a string.`);
      }
      const trimmed = value.trim();
      if ((field === 'firstName' || field === 'lastName') && trimmed === '') {
        throw httpError(400, 'VALIDATION_ERROR', `Field '${field}' cannot be blank.`);
      }
      clean[field] = field === 'avatarUrl' ? value : trimmed;
    }
    const changed = Object.keys(clean) as ProfileField[];
    if (changed.length === 0) {
      throw httpError(400, 'VALIDATION_ERROR', `No profile fields supplied. Allowed: ${PROFILE_FIELDS.join(', ')}.`);
    }
    const updated = await UserRepository.update(id, clean);
    if (updated) {
      await logUserActivity(id, 'update', actorUser, { fields: changed, self: actorUser.id === id });
    }
    return updated;
  },

  /** Sprint 12: activate or deactivate. Admin-only at the route; an admin cannot deactivate their own account. */
  async setActiveStatus(id: string, isActive: boolean, actorUser: SafeUser): Promise<SafeUser | null> {
    if (!isActive && actorUser.id === id) {
      throw httpError(400, 'VALIDATION_ERROR', 'You cannot deactivate your own account.');
    }
    const existing = await UserRepository.findById(id);
    if (!existing) return null;
    const updated = await UserRepository.update(id, { isActive });
    if (updated) {
      await logUserActivity(id, 'status_change', actorUser, { isActive });
    }
    return updated;
  },

  /** Sprint 12: admin sets another user's password. Not a recovery workflow; no tokens, no email. */
  async setPassword(id: string, newPassword: string, actorUser: SafeUser): Promise<boolean> {
    const existing = await UserRepository.findById(id);
    if (!existing) return false;
    const passwordHash = await hashPassword(newPassword);
    await UserRepository.updatePassword(id, passwordHash);
    await logUserActivity(id, 'update', actorUser, { fields: ['password'], setByAdmin: true });
    return true;
  },
};
