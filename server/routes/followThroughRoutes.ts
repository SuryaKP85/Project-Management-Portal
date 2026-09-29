import { Router } from 'express';
import { authenticateToken, requireRoles } from '../middleware/authMiddleware';
import { ActionItemController, FollowUpController, MeetingController, WaitingForController } from '../controllers/followThroughController';
import {
  FOLLOW_THROUGH_DELETE_ROLES, FOLLOW_THROUGH_STATUS_ROLES, FOLLOW_THROUGH_WRITE_ROLES,
} from '../services/followThroughSupport';

/**
 * Sprint 14 — Meetings, Action Items, Waiting For and Follow-ups.
 *
 * Reads are open to every authenticated role and scoped to the caller's
 * projects in the service. Create, edit and delete use the governance write
 * roles (requireRoles is hierarchical, as for risks); the status endpoints
 * also admit a team member acting on a record they own (checked in the
 * service).
 */
export const followThroughRoutes = Router();

const write = requireRoles([...FOLLOW_THROUGH_WRITE_ROLES]);
const remove = requireRoles([...FOLLOW_THROUGH_DELETE_ROLES]);
const status = requireRoles([...FOLLOW_THROUGH_STATUS_ROLES]);

followThroughRoutes.get('/meetings', authenticateToken, MeetingController.list);
followThroughRoutes.get('/meetings/:id', authenticateToken, MeetingController.get);
followThroughRoutes.post('/meetings', authenticateToken, write, MeetingController.create);
followThroughRoutes.patch('/meetings/:id', authenticateToken, write, MeetingController.update);
followThroughRoutes.delete('/meetings/:id', authenticateToken, remove, MeetingController.remove);

followThroughRoutes.get('/action-items', authenticateToken, ActionItemController.list);
followThroughRoutes.get('/action-items/:id', authenticateToken, ActionItemController.get);
followThroughRoutes.post('/action-items', authenticateToken, write, ActionItemController.create);
followThroughRoutes.patch('/action-items/:id/status', authenticateToken, status, ActionItemController.updateStatus);
followThroughRoutes.patch('/action-items/:id', authenticateToken, write, ActionItemController.update);
followThroughRoutes.delete('/action-items/:id', authenticateToken, remove, ActionItemController.remove);

followThroughRoutes.get('/waiting-for', authenticateToken, WaitingForController.list);
followThroughRoutes.get('/waiting-for/:id', authenticateToken, WaitingForController.get);
followThroughRoutes.post('/waiting-for', authenticateToken, write, WaitingForController.create);
followThroughRoutes.patch('/waiting-for/:id/status', authenticateToken, status, WaitingForController.updateStatus);
followThroughRoutes.patch('/waiting-for/:id', authenticateToken, write, WaitingForController.update);
followThroughRoutes.delete('/waiting-for/:id', authenticateToken, remove, WaitingForController.remove);

followThroughRoutes.get('/follow-ups', authenticateToken, FollowUpController.list);
followThroughRoutes.get('/follow-ups/:id', authenticateToken, FollowUpController.get);
followThroughRoutes.post('/follow-ups', authenticateToken, write, FollowUpController.create);
followThroughRoutes.patch('/follow-ups/:id/status', authenticateToken, status, FollowUpController.updateStatus);
followThroughRoutes.patch('/follow-ups/:id', authenticateToken, write, FollowUpController.update);
followThroughRoutes.delete('/follow-ups/:id', authenticateToken, remove, FollowUpController.remove);
