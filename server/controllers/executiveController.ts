import { Request, Response, NextFunction } from 'express';
import { ExecutiveDashboardService, ExecutiveScopeNotFoundError } from '../services/executiveDashboardService';

/**
 * Sprint 11.1A — executive overview HTTP layer.
 *
 * Thin: validates the two optional scope ids, resolves the caller's role for
 * commercial gating, and maps the service's typed not-found error onto the
 * established 404 envelope. All aggregation lives in the service.
 */

/** Accepted shape for a scope identifier, matching the other id-validating controllers. */
const SCOPE_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

function readScopeId(req: Request, key: string): { value?: string; invalid: boolean } {
  const raw = req.query[key];
  if (raw === undefined) return { invalid: false };
  if (typeof raw !== 'string') return { invalid: true };
  const trimmed = raw.trim();
  if (trimmed === '') return { invalid: false };
  return SCOPE_ID_PATTERN.test(trimmed) ? { value: trimmed, invalid: false } : { invalid: true };
}

export const ExecutiveController = {
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
      }

      const portfolioId = readScopeId(req, 'portfolioId');
      const productId = readScopeId(req, 'productId');
      if (portfolioId.invalid || productId.invalid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid scope identifier.',
            details: ['portfolioId and productId must be identifiers of 1-64 characters (letters, digits, _ . -).'],
          },
        });
      }

      const overview = await ExecutiveDashboardService.getOverview(
        { portfolioId: portfolioId.value, productId: productId.value },
        { role: req.user.role }
      );
      res.json({ success: true, data: overview });
    } catch (err) {
      if (err instanceof ExecutiveScopeNotFoundError) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: err.message },
        });
      }
      next(err);
    }
  },
};
