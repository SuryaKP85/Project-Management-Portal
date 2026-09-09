import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const userRoutes = Router();

userRoutes.get('/users', authenticateToken, UserController.list);
userRoutes.get('/users/:id', authenticateToken, UserController.getById);
userRoutes.patch(
  '/users/:id/role',
  authenticateToken,
  requireRoles(['admin']),
  validateBody([{ field: 'role', required: true, enum: ['admin', 'project-manager', 'product-manager', 'team-member', 'viewer'] }]),
  UserController.updateRole
);
