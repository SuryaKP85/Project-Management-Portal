import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../auth/jwt';
import { hasPermission } from '../auth/rbac';
import { UserRole } from '../models/types';
import { UserRepository } from '../repositories/userRepository';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export type AuthRequest = Request;

/**
 * Verifies the session JWT, then re-reads the account so that a user who was
 * deactivated (or removed) after signing in is refused immediately rather than
 * when the token expires (Sprint 10A security correction to Sprint 12).
 * The checks before the first await stay synchronous.
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  let token: string | undefined;

  // 1. Check HTTP-only cookie first
  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  // 2. Check Authorization header
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token is required. Please log in.',
      },
    });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Session token has expired or is invalid. Please log in again.',
      },
    });
  }

  let account;
  try {
    account = await UserRepository.findById(payload.userId);
  } catch (err) {
    return next(err);
  }
  if (!account) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'This account no longer exists. Please log in again.',
      },
    });
  }
  if (!account.isActive) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'ACCOUNT_INACTIVE',
        message: 'This account has been deactivated. Please contact an administrator.',
      },
    });
  }

  req.user = payload;
  next();
}

export function requireRoles(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
    }

    if (!hasPermission(req.user.role, roles)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: ${roles.join(', ')}. Your role: ${req.user.role}`,
        },
      });
    }

    next();
  };
}
