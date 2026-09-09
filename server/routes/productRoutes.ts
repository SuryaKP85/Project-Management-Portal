import { Router } from 'express';
import { ProductController } from '../controllers/productController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const productRoutes = Router();

productRoutes.get('/products', authenticateToken, ProductController.list);
productRoutes.get('/products/:id', authenticateToken, ProductController.getById);
productRoutes.post(
  '/products',
  authenticateToken,
  requireRoles(['admin', 'product-manager', 'project-manager']),
  validateBody([
    { field: 'code', required: true, type: 'string' },
    { field: 'name', required: true, type: 'string' },
  ]),
  ProductController.create
);
productRoutes.patch('/products/:id', authenticateToken, requireRoles(['admin', 'product-manager']), ProductController.update);
productRoutes.delete('/products/:id', authenticateToken, requireRoles(['admin']), ProductController.delete);
