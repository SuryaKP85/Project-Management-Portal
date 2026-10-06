import { Request, Response, NextFunction } from 'express';
import { AIService } from '../services/aiService';
import { AiContextService } from '../services/aiContextService';
import { AiAssistantService } from '../services/aiAssistantService';
import { ActivityService } from '../services/activityService';
import crypto from 'crypto';
import { AiCopilotService, REPORT_PERIODS, ReportPeriod, EMAIL_TEMPLATE_PURPOSES } from '../services/aiCopilotService';

/** The acting user as the AI services expect it, from the verified JWT payload. */
function actorFrom(req: Request) {
  return req.user
    ? {
        userId: req.user.userId,
        role: req.user.role,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        ipAddress: req.ip,
      }
    : null;
}

const unauthenticated = (res: Response) =>
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });

/** Same answer for a missing project and one outside the caller's scope, so existence cannot be probed. */
const projectNotAvailable = (res: Response) =>
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found or not available to you.' } });

/**
 * Sprint 7A (Step 1) — AI endpoint hardening.
 *
 * Trust model: the client supplies a QUESTION, never DATA. Any context handed
 * to an AI provider is resolved server-side from the repositories, so that a
 * caller cannot dictate what an external model is shown, and cannot smuggle
 * arbitrary payloads through this server to a third party.
 *
 * Error responses are sanitised: upstream provider messages may disclose
 * configuration state (e.g. whether an API key is present) and are logged
 * server-side rather than returned.
 */

const MAX_PROMPT_LENGTH = 2000;
const MAX_FIELD_LENGTH = 500;

/** Coerce to a trimmed, length-capped string. Non-strings become ''. */
function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

/** Log the real failure server-side; return a generic message to the caller. */
function respondAiError(res: Response, err: any, message: string) {
  console.error('[AI] request failed:', err?.message || err);
  return res.status(500).json({
    success: false,
    error: { code: 'AI_ERROR', message },
  });
}

export const AIController = {
  /**
   * Sprint 7A assistant endpoint. Accepts a question only; the context is
   * always server-built from the authenticated identity, and each call is
   * audited.
   */
  async assistantQuery(req: Request, res: Response, _next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
        });
      }

      // `question` is canonical; `prompt` is accepted as an alias so callers
      // can use the same field name as /ai/query.
      const question =
        sanitizeText(req.body?.question, MAX_PROMPT_LENGTH) ||
        sanitizeText(req.body?.prompt, MAX_PROMPT_LENGTH);

      if (!question) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'A question is required.' },
        });
      }

      const result = await AiAssistantService.ask(
        {
          userId: req.user.userId,
          role: req.user.role,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          email: req.user.email,
          ipAddress: req.ip,
        },
        question
      );

      res.json({ success: true, data: result });
    } catch (err: any) {
      respondAiError(res, err, 'AI assistant request failed.');
    }
  },

  async query(req: Request, res: Response, _next: NextFunction) {
    try {
      const prompt = sanitizeText(req.body?.prompt, MAX_PROMPT_LENGTH);
      if (!prompt) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'A prompt is required.' },
        });
      }

      // Client-supplied `context` and `provider` are deliberately ignored.
      // The authoritative context is built server-side from the authenticated
      // identity, so the caller cannot influence what the provider is shown.
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
        });
      }

      const context = await AiContextService.buildContext({
        userId: req.user.userId,
        role: req.user.role,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
      });

      const response = await AIService.query(prompt, context as unknown as Record<string, any>);
      // Sprint 22A: audited like the assistant: who asked, from which scope, and how much; never the prompt or the answer.
      await ActivityService.logActivity({
        entityType: 'ai',
        entityId: `aiq_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        action: 'ai_query',
        actorId: req.user.userId,
        actorName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
        details: {
          endpoint: '/ai/query',
          provider: response.provider,
          scope: context.scope,
          role: req.user.role,
          promptLength: prompt.length,
          projectsInScope: context.meta.projectsInScope,
        },
        ipAddress: req.ip,
      });
      res.json({ success: true, data: response });
    } catch (err: any) {
      respondAiError(res, err, 'AI request failed.');
    }
  },

  /**
   * Sprint 13 — Project Copilot. Accepts an identifier only (projectId, or the
   * legacy project.id / project.code shape). A client-supplied project object is
   * never used: the server resolves the project through the caller's authorised
   * scope and sends the provider only the whitelisted projection.
   */
  async projectInsights(req: Request, res: Response, _next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      const projectId =
        sanitizeText(req.body?.projectId, MAX_FIELD_LENGTH) ||
        sanitizeText(req.body?.project?.id, MAX_FIELD_LENGTH) ||
        sanitizeText(req.body?.project?.code, MAX_FIELD_LENGTH);

      if (!projectId) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'A projectId is required.' },
        });
      }

      const insights = await AiCopilotService.projectInsights(actor, projectId);
      if (!insights) return projectNotAvailable(res);
      res.json({ success: true, data: insights });
    } catch (err: any) {
      respondAiError(res, err, 'AI insight generation failed.');
    }
  },

  /** Sprint 13 — AI executive report over the caller's authorised context. */
  async executiveReport(req: Request, res: Response, _next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      const raw = req.body?.period;
      const period = (raw === undefined || raw === null || raw === '' ? 'weekly' : raw) as ReportPeriod;
      if (!(REPORT_PERIODS as readonly string[]).includes(period)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Field 'period' must be one of: ${REPORT_PERIODS.join(', ')}.` },
        });
      }
      res.json({ success: true, data: await AiCopilotService.executiveReport(actor, period) });
    } catch (err: any) {
      respondAiError(res, err, 'AI report generation failed.');
    }
  },

  /**
   * Sprint 13 — AI email drafting. The caller chooses a project and one of the
   * composer's template keys; every fact in the draft comes from the server's
   * authorised project context. Client-supplied project/client/status/highlight
   * text is ignored. The draft is returned as text and is never sent here.
   */
  async draftEmail(req: Request, res: Response, _next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      const projectId = sanitizeText(req.body?.projectId, MAX_FIELD_LENGTH);
      if (!projectId) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'A projectId is required.' },
        });
      }
      const templateKey = req.body?.templateKey === undefined ? 'executive_status' : req.body.templateKey;
      if (typeof templateKey !== 'string' || !Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATE_PURPOSES, templateKey)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Field 'templateKey' must be one of: ${Object.keys(EMAIL_TEMPLATE_PURPOSES).join(', ')}.` },
        });
      }

      const draft = await AiCopilotService.draftEmail(actor, projectId, templateKey);
      if (!draft) return projectNotAvailable(res);
      res.json({ success: true, data: draft });
    } catch (err: any) {
      respondAiError(res, err, 'Draft email failed.');
    }
  },
};
