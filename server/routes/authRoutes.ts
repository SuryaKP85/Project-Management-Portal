import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const authRoutes = Router();

authRoutes.post(
  '/auth/login',
  validateBody([
    { field: 'email', required: true, type: 'email' },
    { field: 'password', required: true, type: 'string', minLength: 6 },
  ]),
  AuthController.login
);

authRoutes.post(
  '/auth/register',
  authenticateToken,
  requireRoles(['admin']),
  validateBody([
    { field: 'email', required: true, type: 'email' },
    { field: 'password', required: true, type: 'string', minLength: 8 },
    { field: 'firstName', required: true, type: 'string' },
    { field: 'lastName', required: true, type: 'string' },
  ]),
  AuthController.register
);

authRoutes.get('/auth/me', authenticateToken, AuthController.me);
authRoutes.post('/auth/logout', AuthController.logout);
