import { Request, Response, NextFunction } from 'express';
import { AIService } from '../services/aiService';

export const AIController = {
  async query(req: Request, res: Response, next: NextFunction) {
    try {
      const { prompt, context, provider } = req.body;
      const response = await AIService.query(prompt, context, provider);
      res.json({ success: true, data: response });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'AI_ERROR', message: err.message || 'AI request failed' },
      });
    }
  },

  async projectInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const { project } = req.body;
      const insights = await AIService.getProjectInsights(project);
      res.json({ success: true, data: insights });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'AI_ERROR', message: err.message || 'AI insight generation failed' },
      });
    }
  },

  async draftEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { project, client, status, keyHighlights } = req.body;
      const email = await AIService.draftExecutiveEmail({ project, client, status, keyHighlights: keyHighlights || [] });
      res.json({ success: true, data: email });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'AI_ERROR', message: err.message || 'Draft email failed' },
      });
    }
  },
};
