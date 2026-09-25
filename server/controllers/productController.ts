import { Request, Response, NextFunction } from 'express';
import { ProductService } from '../services/productService';

/** Accepted identifier shape, matching the other id-validating controllers. */
const SCOPE_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export const ProductController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const products = await ProductService.getAllProducts();
      res.json({ success: true, data: { products } });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await ProductService.getProductById(req.params.id);
      if (!product) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
      }
      res.json({ success: true, data: { product } });
    } catch (err) {
      next(err);
    }
  },

  /** GET /products/:id/health — derived rollup beside the declared value. */
  async getHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id ?? '').trim();
      if (!SCOPE_ID_PATTERN.test(id)) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid product identifier.' } });
      }
      const health = await ProductService.getProductHealth(id);
      if (!health) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
      }
      res.json({ success: true, data: health });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const product = await ProductService.createProduct(req.body, actor);
      res.status(201).json({ success: true, data: { product } });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const updated = await ProductService.updateProduct(req.params.id, req.body, actor);
      if (!updated) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
      }
      res.json({ success: true, data: { product: updated } });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const deleted = await ProductService.deleteProduct(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
      }
      res.json({ success: true, data: { message: 'Product deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },
};
