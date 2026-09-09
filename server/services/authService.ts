import { UserRepository, sanitizeUser } from '../repositories/userRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { verifyPassword, hashPassword } from '../auth/password';
import { generateToken, JwtPayload } from '../auth/jwt';
import { SafeUser, User, UserRole } from '../models/types';
import crypto from 'crypto';

export interface AuthResult {
  user: SafeUser;
  token: string;
}

export const AuthService = {
  async login(email: string, password: string, ipAddress?: string): Promise<AuthResult> {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated. Please contact an administrator.');
    }

    if (!user.passwordHash) {
      throw new Error('Account does not have password authentication enabled.');
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    const safeUser = sanitizeUser(user);
    const token = generateToken(safeUser);

    // Log Activity
    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'auth',
      entityId: user.id,
      action: 'login',
      actorId: user.id,
      actorName: `${user.firstName} ${user.lastName}`,
      details: { email: user.email, role: user.role },
      ipAddress,
      createdAt: new Date().toISOString(),
    });

    return { user: safeUser, token };
  },

  async register(
    data: { email: string; password: string; firstName: string; lastName: string; role?: UserRole; department?: string; title?: string },
    actorUser?: SafeUser
  ): Promise<SafeUser> {
    const existing = await UserRepository.findByEmail(data.email);
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await hashPassword(data.password);
    const newUser: User = {
      id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      email: data.email.toLowerCase().trim(),
      passwordHash,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      role: data.role || 'team-member',
      department: data.department,
      title: data.title,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await UserRepository.create(newUser);

    if (actorUser) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'user',
        entityId: created.id,
        action: 'create',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { email: created.email, role: created.role },
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async getCurrentUser(payload: JwtPayload): Promise<SafeUser> {
    const user = await UserRepository.findById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }
    return sanitizeUser(user);
  },
};
