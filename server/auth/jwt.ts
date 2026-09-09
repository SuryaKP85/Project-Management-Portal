import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { SafeUser, UserRole } from '../models/types';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
}

export function generateToken(user: SafeUser): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.sessionExpiry as any,
  });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch (err) {
    return null;
  }
}
