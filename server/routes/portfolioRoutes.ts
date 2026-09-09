import { Router } from 'express';
import { PortfolioController } from '../controllers/portfolioController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const portfolioRoutes = Router();

portfolioRoutes.get('/portfolios', authenticateToken, PortfolioController.list);
portfolioRoutes.get('/portfolios/:id', authenticateToken, PortfolioController.getById);
portfolioRoutes.post(
  '/portfolios',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  validateBody([
    { field: 'name', required: true, type: 'string' },
  ]),
  PortfolioController.create
);
portfolioRoutes.patch(
  '/portfolios/:id',
  authenticateToken,
  requireRoles(['admin', 'project-manager', 'product-manager']),
  PortfolioController.update
);
portfolioRoutes.delete(
  '/portfolios/:id',
  authenticateToken,
  requireRoles(['admin']),
  PortfolioController.delete
);
