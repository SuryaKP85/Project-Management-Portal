import { Router } from 'express';
import { AIController } from '../controllers/aiController';
import { authenticateToken } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';

export const aiRoutes = Router();

aiRoutes.post(
  '/ai/query',
  authenticateToken,
  validateBody([{ field: 'prompt', required: true, type: 'string', minLength: 2 }]),
  AIController.query
);

aiRoutes.post('/ai/insights', authenticateToken, AIController.projectInsights);

aiRoutes.post(
  '/ai/draft-email',
  authenticateToken,
  validateBody([
    { field: 'project', required: true, type: 'string' },
    { field: 'client', required: true, type: 'string' },
    { field: 'status', required: true, type: 'string' },
  ]),
  AIController.draftEmail
);
