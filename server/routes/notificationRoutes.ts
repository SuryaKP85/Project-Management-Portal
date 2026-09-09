import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { authenticateToken } from '../middleware/authMiddleware';

export const notificationRoutes = Router();

notificationRoutes.get('/notifications', authenticateToken, NotificationController.list);
notificationRoutes.patch('/notifications/:id/read', authenticateToken, NotificationController.markAsRead);
notificationRoutes.post('/notifications/read-all', authenticateToken, NotificationController.markAllAsRead);
