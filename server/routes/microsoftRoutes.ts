import { Router } from 'express';
import { MicrosoftController } from '../controllers/microsoftController';
import { authenticateToken } from '../middleware/authMiddleware';

/**
 * Sprint 10A — Microsoft 365 account integration (not a portal login).
 * Every route requires the V2 session; authenticateToken also rejects
 * inactive accounts. The callback path matches MICROSOFT_REDIRECT_URI.
 */
export const microsoftRoutes = Router();

microsoftRoutes.get('/integrations/microsoft/status', authenticateToken, MicrosoftController.status);
microsoftRoutes.post('/integrations/microsoft/connect', authenticateToken, MicrosoftController.connect);
microsoftRoutes.delete('/integrations/microsoft/connection', authenticateToken, MicrosoftController.disconnect);
microsoftRoutes.get('/integrations/microsoft/calendar', authenticateToken, MicrosoftController.calendar);
// Sprint 10B: send through the caller's own connected account (Mail.Send).
microsoftRoutes.post('/integrations/microsoft/mail/send', authenticateToken, MicrosoftController.sendMail);
microsoftRoutes.get('/auth/microsoft/callback', authenticateToken, MicrosoftController.callback);
