import { apiClient } from './apiClient.js';

/**
 * Microsoft 365 account integration (Sprint 10A). Tokens never reach the
 * browser: every call returns only safe status or calendar data.
 */
const MICROSOFT_AUTHORIZE_ORIGIN = 'https://login.microsoftonline.com/';

export class MicrosoftService {
  static async getStatus() {
    return apiClient.get('/integrations/microsoft/status');
  }

  /** Asks the server for the Microsoft authorize URL, then navigates there. */
  static async connect() {
    const data = await apiClient.post('/integrations/microsoft/connect', {});
    const url = data && data.authorizationUrl;
    if (typeof url !== 'string' || !url.startsWith(MICROSOFT_AUTHORIZE_ORIGIN)) {
      throw new Error('The server returned an unexpected Microsoft sign-in address.');
    }
    window.location.assign(url);
  }

  static async disconnect() {
    return apiClient.delete('/integrations/microsoft/connection');
  }

  /**
   * Sprint 10B: sends a plain-text email through the signed-in user's own
   * connected account. Call only after the user has explicitly confirmed.
   * The server identifies the sender from the session; no identity is sent.
   */
  static async sendMail({ to, subject, body }) {
    return apiClient.post('/integrations/microsoft/mail/send', { to, subject, body, confirmed: true });
  }

  /** Upcoming Outlook events for the signed-in user (read-only). */
  static async getCalendar(days = 7) {
    return apiClient.get(`/integrations/microsoft/calendar?days=${encodeURIComponent(days)}`);
  }
}
