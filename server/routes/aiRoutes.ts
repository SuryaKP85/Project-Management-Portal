import { Router } from 'express';
import { AIController } from '../controllers/aiController';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validation';
import { rateLimit } from '../middleware/rateLimit';

export const aiRoutes = Router();

/** Per-user quota for assistant queries. */
const aiAssistantRateLimit = rateLimit({
  bucket: 'ai-assistant',
  max: Number(process.env.AI_RATE_LIMIT_MAX || 20),
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60_000),
});

/**
 * Sprint 7A (Step 1) — AI access control.
 *
 * Read-only analysis is available to every authenticated role; it may only
 * surface data the caller is already authorised to read. Generative actions,
 * which produce outbound artefacts, are restricted to the management roles.
 */
const AI_READ_ROLES = ['admin', 'project-manager', 'product-manager', 'team-member', 'viewer'] as const;
const AI_GENERATE_ROLES = ['admin', 'project-manager', 'product-manager'] as const;

// Assistant: read-only analysis grounded in the caller's authorised context.
aiRoutes.post(
  '/ai/assistant/query',
  authenticateToken,
  requireRoles([...AI_READ_ROLES]),
  aiAssistantRateLimit,
  AIController.assistantQuery
);

aiRoutes.post(
  '/ai/query',
  authenticateToken,
  requireRoles([...AI_READ_ROLES]),
  validateBody([{ field: 'prompt', required: true, type: 'string', minLength: 2 }]),
  AIController.query
);

// Sprint 13 — Project Copilot: read-only analysis of one in-scope project.
// Shares the per-user AI quota with the assistant.
aiRoutes.post(
  '/ai/insights',
  authenticateToken,
  requireRoles([...AI_READ_ROLES]),
  aiAssistantRateLimit,
  AIController.projectInsights
);

// Sprint 13 — AI executive report over the caller's authorised context (read-only).
aiRoutes.post(
  '/ai/report',
  authenticateToken,
  requireRoles([...AI_READ_ROLES]),
  aiAssistantRateLimit,
  AIController.executiveReport
);

// Sprint 13 — AI email drafting for one in-scope project. Generative, so
// management roles only; returns a draft and never sends.
aiRoutes.post(
  '/ai/draft-email',
  authenticateToken,
  requireRoles([...AI_GENERATE_ROLES]),
  aiAssistantRateLimit,
  validateBody([{ field: 'projectId', required: true, type: 'string' }]),
  AIController.draftEmail
);
