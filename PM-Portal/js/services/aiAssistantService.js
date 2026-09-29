import { apiClient } from './apiClient.js';

/**
 * Sprint 7A (Step 5) — thin client for the secure server assistant.
 *
 * Sends ONLY the user's question. All context is built server-side from the
 * authenticated identity (see server/services/aiContextService.ts), so this
 * client deliberately has no way to supply project, risk or user data.
 */
export class AiAssistantService {
  /**
   * @param {string} question
   * @returns {Promise<{queryId:string, answer:string, provider:string, scope:string,
   *                    recommendations?:Array, suggestedActions?:Array, meta:object}>}
   */
  static async ask(question) {
    // The request body is intentionally just the question.
    return apiClient.post('/ai/assistant/query', { question });
  }

  /**
   * Sprint 13 — Project Copilot. Sends only the project identifier; the server
   * resolves the project through the caller's authorised scope.
   */
  static async projectInsights(projectId) {
    return apiClient.post('/ai/insights', { projectId });
  }

  /** Sprint 13 — AI executive report. Sends only the period label. */
  static async executiveReport(period = 'weekly') {
    return apiClient.post('/ai/report', { period });
  }

  /**
   * Sprint 13 — AI email draft for one project. Sends only the project
   * identifier and a composer template key; returns { subject, body, provider }.
   * Drafting never sends email.
   */
  static async draftEmail(projectId, templateKey) {
    return apiClient.post('/ai/draft-email', { projectId, templateKey });
  }

  /**
   * Decides whether a failure should fall back to the local V1.1 engine.
   *
   * Fall back only when the secure path is genuinely unavailable — network
   * failure, timeout, or a server-side error. Deliberate server decisions
   * (unauthenticated, forbidden, rate limited, bad request) are surfaced to the
   * user instead, because silently answering from local data would hide the
   * real reason and give a false impression of a working secure session.
   *
   * @param {any} err
   * @returns {boolean}
   */
  static shouldFallback(err) {
    if (!err) return false;
    const status = err.status;
    if (status === undefined || status === null) return true; // network / timeout
    if (err.code === 'TIMEOUT') return true;
    return status >= 500;
  }
}
