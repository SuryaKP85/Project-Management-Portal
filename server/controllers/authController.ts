import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { config } from '../config/env';
import { clearLoginFailures, loginRetryAfter, recordLoginFailure } from '../middleware/rateLimit';

export const AuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const ip = req.ip || req.socket.remoteAddress;

      // Sprint 20: repeated failed sign-ins from one address are slowed down (429 until the window ends).
      const limitKey = { ip: String(ip || 'unknown'), email: String(email || '') };
      const retryAfter = loginRetryAfter(limitKey.ip, limitKey.email);
      if (retryAfter > 0) {
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
          success: false,
          error: { code: 'RATE_LIMITED', message: `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` },
        });
      }

      let result;
      try {
        result = await AuthService.login(email, password, ip);
      } catch (err) {
        recordLoginFailure(limitKey.ip, limitKey.email);
        throw err;
      }
      clearLoginFailures(limitKey.ip, limitKey.email);

      // Set secure HTTP-only cookie
      res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.json({
        success: true,
        data: {
          user: result.user,
          token: result.token,
        },
      });
    } catch (err: any) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: err.message || 'Authentication failed',
        },
      });
    }
  },

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, firstName, lastName, role, department, title } = req.body;
      const actorUser = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;

      const newUser = await AuthService.register(
        { email, password, firstName, lastName, role, department, title },
        actorUser
      );

      return res.status(201).json({
        success: true,
        data: { user: newUser },
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: err.message || 'Could not register user',
        },
      });
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
      }

      const user = await AuthService.getCurrentUser(req.user);
      return res.json({
        success: true,
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  },

  /** POST /auth/change-password — the signed-in user only. */
  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      await AuthService.changePassword(req.user, req.body.currentPassword, req.body.newPassword);
      return res.json({ success: true, data: { message: 'Password updated successfully' } });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response) {
    res.clearCookie('auth_token');
    return res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  },
};
