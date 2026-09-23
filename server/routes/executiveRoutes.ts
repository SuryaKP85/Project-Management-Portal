import { Router } from 'express';
import { ExecutiveController } from '../controllers/executiveController';
import { authenticateToken } from '../middleware/authMiddleware';

export const executiveRoutes = Router();

/**
 * Sprint 11.1A — executive overview.
 *
 * Read-only, so it follows the application-wide read convention of
 * authenticateToken alone. Commercial figures are gated by role inside the
 * service, so the server — not the client — decides what each role sees.
 * Literal path only; there is no '/:id' here to shadow.
 */
executiveRoutes.get('/executive/overview', authenticateToken, ExecutiveController.getOverview);
