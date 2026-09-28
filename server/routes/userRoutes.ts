import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const userRoutes = Router();

const USER_ROLES = ['admin', 'project-manager', 'product-manager', 'team-member', 'viewer'];

userRoutes.get('/users', authenticateToken, UserController.list);
userRoutes.get('/users/:id', authenticateToken, UserController.getById);
userRoutes.patch(
  '/users/:id/role',
  authenticateToken,
  requireRoles(['admin']),
  validateBody([{ field: 'role', required: true, enum: USER_ROLES }]),
  UserController.updateRole
);

// Sprint 12 — identity foundation. Profile fields are self-or-admin (checked in
// the service); status and password administration are admin-only here.
userRoutes.patch(
  '/users/:id',
  authenticateToken,
  validateBody([
    { field: 'firstName', type: 'string', maxLength: 100 },
    { field: 'lastName', type: 'string', maxLength: 100 },
    { field: 'department', type: 'string', maxLength: 100 },
    { field: 'title', type: 'string', maxLength: 100 },
    { field: 'avatarUrl', type: 'string' },
  ]),
  UserController.updateProfile
);
userRoutes.patch(
  '/users/:id/status',
  authenticateToken,
  requireRoles(['admin']),
  validateBody([{ field: 'isActive', required: true, type: 'boolean' }]),
  UserController.updateStatus
);
userRoutes.post(
  '/users/:id/set-password',
  authenticateToken,
  requireRoles(['admin']),
  validateBody([{ field: 'password', required: true, type: 'string', minLength: 8 }]),
  UserController.setPassword
);
