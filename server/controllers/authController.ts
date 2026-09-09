import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { config } from '../config/env';

export const AuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const ip = req.ip || req.socket.remoteAddress;

      const result = await AuthService.login(email, password, ip);

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

  async logout(req: Request, res: Response) {
    res.clearCookie('auth_token');
    return res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  },
};
