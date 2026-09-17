import { Request, Response, NextFunction } from 'express';
import { AIService } from '../services/aiService';
import { AiContextService } from '../services/aiContextService';
import { AiAssistantService } from '../services/aiAssistantService';
import { ProjectRepository } from '../repositories/projectRepository';

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
const MAX_HIGHLIGHTS = 20;

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
      res.json({ success: true, data: response });
    } catch (err: any) {
      respondAiError(res, err, 'AI request failed.');
    }
  },

  async projectInsights(req: Request, res: Response, _next: NextFunction) {
    try {
      // Accept an identifier only. A full project object from the client is
      // never trusted; the record is re-read from the repository so the
      // provider only ever sees server-owned data.
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

      let project = await ProjectRepository.findById(projectId);
      if (!project) {
        const all = await ProjectRepository.findAll();
        project = all.find((p) => p.code === projectId || p.id === projectId) || null;
      }

      if (!project) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        });
      }

      const insights = await AIService.getProjectInsights(project);
      res.json({ success: true, data: insights });
    } catch (err: any) {
      respondAiError(res, err, 'AI insight generation failed.');
    }
  },

  async draftEmail(req: Request, res: Response, _next: NextFunction) {
    try {
      // These are author-supplied composition inputs rather than authorisation
      // scoped records, but they still reach a prompt, so they are type-checked
      // and length-capped before use.
      const project = sanitizeText(req.body?.project, MAX_FIELD_LENGTH);
      const client = sanitizeText(req.body?.client, MAX_FIELD_LENGTH);
      const status = sanitizeText(req.body?.status, MAX_FIELD_LENGTH);

      const rawHighlights = Array.isArray(req.body?.keyHighlights) ? req.body.keyHighlights : [];
      const keyHighlights = rawHighlights
        .slice(0, MAX_HIGHLIGHTS)
        .map((h: unknown) => sanitizeText(h, MAX_FIELD_LENGTH))
        .filter((h: string) => h.length > 0);

      const email = await AIService.draftExecutiveEmail({ project, client, status, keyHighlights });
      res.json({ success: true, data: email });
    } catch (err: any) {
      respondAiError(res, err, 'Draft email failed.');
    }
  },
};
