import { UserRepository } from '../repositories/userRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { SafeUser, UserRole } from '../models/types';
import crypto from 'crypto';

export const UserService = {
  async getAllUsers(): Promise<SafeUser[]> {
    return UserRepository.findAll();
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
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'user',
        entityId: id,
        action: 'status_change',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { newRole },
        createdAt: new Date().toISOString(),
      });
    }
    return updated;
  },
};
