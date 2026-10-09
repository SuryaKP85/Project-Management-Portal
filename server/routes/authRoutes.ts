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
    { field: 'firstName', required: true, type: 'string', maxLength: 100 },
    { field: 'lastName', required: true, type: 'string', maxLength: 100 },
  ]),
  AuthController.register
);

authRoutes.get('/auth/me', authenticateToken, AuthController.me);
// Sprint 12: self-service password change. Not a recovery flow — no tokens or email.
authRoutes.post(
  '/auth/change-password',
  authenticateToken,
  validateBody([
    { field: 'currentPassword', required: true, type: 'string' },
    { field: 'newPassword', required: true, type: 'string', minLength: 8 },
  ]),
  AuthController.changePassword
);
// Sprint 25: sign-out is authenticated and ends the session on the server too.
authRoutes.post('/auth/logout', authenticateToken, AuthController.logout);
