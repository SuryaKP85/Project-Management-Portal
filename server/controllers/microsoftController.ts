import { Request, Response, NextFunction } from 'express';
import { MicrosoftIntegrationService, MicrosoftActor, CALENDAR_DEFAULT_DAYS, validateSendRequest } from '../services/microsoftIntegrationService';

/**
 * Sprint 10A — Microsoft 365 account connection and Outlook calendar.
 * authenticateToken (which also rejects inactive accounts) runs first on
 * every route, so each handler acts only for the signed-in V2 user.
 */

function actorFrom(req: Request): MicrosoftActor | null {
  return req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName } : null;
}

const unauthenticated = (res: Response) =>
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });

const escapeHtml = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
)[c]);

/** Minimal self-contained result page for a failed callback. Never echoes the query string. */
function callbackFailurePage(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Microsoft 365 connection</title>`
    + `<meta name="viewport" content="width=device-width, initial-scale=1"></head>`
    + `<body style="font-family: system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5;">`
    + `<h1 style="font-size: 1.25rem;">Microsoft 365 was not connected</h1>`
    + `<p>${escapeHtml(message)}</p>`
    + `<p><a href="/PM-Portal/index.html">Return to the portal</a> and try again from Settings.</p>`
    + `</body></html>`;
}

export const MicrosoftController = {
  /** GET /integrations/microsoft/status */
  async status(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data: await MicrosoftIntegrationService.getStatus(actor.id) });
    } catch (err) {
      next(err);
    }
  },

  /** POST /integrations/microsoft/connect — returns the authorize URL for the browser to open. */
  async connect(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data: MicrosoftIntegrationService.startConnect(actor.id) });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /auth/microsoft/callback — Microsoft redirects the browser here. Errors
   * are answered in place (never forwarded to the global handler, which logs
   * the URL and would record the authorization code).
   */
  async callback(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const actor = actorFrom(req);
    if (!actor) {
      return res.status(401).type('html').send(callbackFailurePage('Your portal session has expired. Please sign in again.'));
    }
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    try {
      await MicrosoftIntegrationService.completeConnect(actor, {
        state: str(req.query.state),
        code: str(req.query.code),
        error: str(req.query.error),
      });
      return res.redirect(302, '/PM-Portal/index.html?microsoft=connected');
    } catch (err: any) {
      const status = Number(err?.status) >= 400 && Number(err?.status) < 600 ? Number(err.status) : 500;
      const message = status === 500 ? 'An unexpected error occurred while connecting Microsoft 365.' : err.message;
      return res.status(status).type('html').send(callbackFailurePage(message));
    }
  },

  /** DELETE /integrations/microsoft/connection */
  async disconnect(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      res.json({ success: true, data: await MicrosoftIntegrationService.disconnect(actor) });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /integrations/microsoft/mail/send — Sprint 10B. Sends as the signed-in
   * user only; the body can never name another identity. Responds with safe
   * fields only, never Graph data or message content.
   */
  async sendMail(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      res.setHeader('Cache-Control', 'no-store');
      const checked = validateSendRequest(req.body);
      if ('errors' in checked) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameters.', details: checked.errors },
        });
      }
      res.json({ success: true, data: await MicrosoftIntegrationService.sendMail(actor, checked.value) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /integrations/microsoft/calendar?days=7 — read-only, the caller's own calendar. */
  async calendar(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      const raw = req.query.days;
      let days = CALENDAR_DEFAULT_DAYS;
      if (raw !== undefined) {
        if (typeof raw !== 'string' || !/^\d{1,3}$/.test(raw) || Number(raw) < 1) {
          return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: "Query 'days' must be a whole number of at least 1." } });
        }
        days = Number(raw);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data: await MicrosoftIntegrationService.getCalendar(actor.id, days) });
    } catch (err) {
      next(err);
    }
  },
};
