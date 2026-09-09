import { Request, Response, NextFunction } from 'express';
import { ActivityService } from '../services/activityService';

export const ActivityController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt((req.query.limit as string) || '50', 10);
      const entityType = req.query.entityType as string;
      const entityId = req.query.entityId as string;

      let activities;
      if (entityType && entityId) {
        activities = await ActivityService.getEntityActivities(entityType, entityId);
      } else {
        activities = await ActivityService.getRecentActivities(limit);
      }

      res.json({ success: true, data: { activities } });
    } catch (err) {
      next(err);
    }
  },
};
