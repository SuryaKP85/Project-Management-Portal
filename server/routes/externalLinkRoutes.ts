import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { JIRA_CLOUD_HOST_SUFFIXES, configuredJiraBase } from '../services/jiraReference';

/**
 * Sprint 15A — link settings the browser needs to render Jira references:
 * the configured Jira base URL (JIRA_BASE_URL, or null) and the Atlassian
 * cloud host suffixes that are recognised without configuration. There are
 * no credentials here and nothing calls Jira.
 */
export const externalLinkRoutes = Router();

externalLinkRoutes.get('/config/external-links', authenticateToken, (_req: Request, res: Response) => {
  const base = configuredJiraBase();
  res.json({
    success: true,
    data: {
      jira: {
        baseUrl: base ? `${base.origin}${base.pathname.replace(/\/+$/, '')}` : null,
        cloudHostSuffixes: [...JIRA_CLOUD_HOST_SUFFIXES],
      },
    },
  });
});
