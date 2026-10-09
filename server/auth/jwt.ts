import jwt from 'jsonwebtoken';
import { config, sessionExpiryMs } from '../config/env';
import { SafeUser, UserRole } from '../models/types';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  /** Sprint 25: the account's session generation when the token was issued (revocation). */
  tv?: number;
}

export function generateToken(user: SafeUser, tokenVersion = 0): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    tv: tokenVersion,
  };

  return jwt.sign(payload, config.jwtSecret, {
    // Sprint 25: seconds as a number (a numeric string would be read as milliseconds).
    expiresIn: Math.floor(sessionExpiryMs(config.sessionExpiry) / 1000),
  });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch (err) {
    return null;
  }
}
