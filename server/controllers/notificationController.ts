import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/notificationService';

export const NotificationController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const unreadOnly = req.query.unread === 'true';
      const notifications = await NotificationService.getUserNotifications(req.user.userId, unreadOnly);
      res.json({ success: true, data: { notifications } });
    } catch (err) {
      next(err);
    }
  },

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const success = await NotificationService.markAsRead(req.params.id, req.user.userId);
      res.json({ success: true, data: { markedRead: success } });
    } catch (err) {
      next(err);
    }
  },

  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const count = await NotificationService.markAllAsRead(req.user.userId);
      res.json({ success: true, data: { count } });
    } catch (err) {
      next(err);
    }
  },
};
