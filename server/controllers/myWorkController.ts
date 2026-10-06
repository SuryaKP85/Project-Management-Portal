import { Request, Response, NextFunction } from 'express';
import { HomeService } from '../services/homeService';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { SprintRepository } from '../repositories/sprintRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import crypto from 'crypto';
import { DeliveryGuards } from '../services/deliveryGuards';

function getActor(req: Request) {
  if (!req.user) return { id: 'usr_dev_3', name: 'Bob Johnson' };
  return {
    id: req.user.userId,
    name: `${req.user.firstName} ${req.user.lastName}`.trim() || req.user.email,
  };
}

export const MyWorkController = {
  /**
   * Sprint 21B — GET /home: Home and unified My Work for the signed-in user.
   * Read-only; the query string is ignored entirely (no user, project,
   * portfolio or product scope can be requested).
   */
  async getHome(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      const { id, name } = getActor(req);
      res.json({ success: true, data: await HomeService.getHome({ userId: id, role: req.user.role, name }) });
    } catch (err) {
      next(err);
    }
  },

  async getMyWork(req: Request, res: Response) {
    try {
      // Sprint 21A: My Work is always the signed-in user's. The identity comes
      // from the verified token only; ?userId= and ?userName= are ignored, and
      // items match by assignee id (a display name is editable by its owner).
      if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      const { id: userId, name: userName } = getActor(req);
      const { timeframe = 'all' } = req.query;

      const [allStories, allTasks, sprints] = await Promise.all([
        StoryRepository.findAll(),
        TaskRepository.findAll(),
        SprintRepository.findAll({ status: 'active' }),
      ]);

      const activeSprintIds = new Set(sprints.map((s) => s.id));
      const activeSprintNames = new Set(sprints.map((s) => s.name));

      // Filter assigned to current user
      const isAssigned = (item: any) => item.assigneeId === userId;

      let myStories = allStories.filter(isAssigned);
      let myTasks = allTasks.filter(isAssigned);

      const todayStr = new Date().toISOString().split('T')[0];
      const nextWeekDate = new Date();
      nextWeekDate.setDate(nextWeekDate.getDate() + 7);
      const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

      // Timeframe filtering
      if (timeframe === 'current_sprint') {
        myStories = myStories.filter((s) => (s.sprintId && activeSprintIds.has(s.sprintId)) || (s.sprint && activeSprintNames.has(s.sprint)));
        myTasks = myTasks.filter((t) => (t.sprintId && activeSprintIds.has(t.sprintId)) || (t.sprint && activeSprintNames.has(t.sprint)));
      } else if (timeframe === 'overdue') {
        myStories = myStories.filter((s) => s.dueDate && s.dueDate < todayStr && s.status !== 'done');
        myTasks = myTasks.filter((t) => t.dueDate && t.dueDate < todayStr && t.status !== 'done');
      } else if (timeframe === 'today') {
        myStories = myStories.filter((s) => s.dueDate === todayStr || s.status === 'in-progress');
        myTasks = myTasks.filter((t) => t.dueDate === todayStr || t.status === 'in-progress');
      } else if (timeframe === 'this_week') {
        myStories = myStories.filter((s) => (s.dueDate && s.dueDate <= nextWeekStr && s.status !== 'done') || s.status === 'in-progress');
        myTasks = myTasks.filter((t) => (t.dueDate && t.dueDate <= nextWeekStr && t.status !== 'done') || t.status === 'in-progress');
      }

      // Key metrics
      const overdueStories = myStories.filter((s) => s.dueDate && s.dueDate < todayStr && s.status !== 'done');
      const overdueTasks = myTasks.filter((t) => t.dueDate && t.dueDate < todayStr && t.status !== 'done');
      const blockedStories = myStories.filter((s) => s.status === 'blocked');
      const blockedTasks = myTasks.filter((t) => t.status === 'blocked');
      const inProgressStories = myStories.filter((s) => s.status === 'in-progress');
      const inProgressTasks = myTasks.filter((t) => t.status === 'in-progress');
      const completedStories = myStories.filter((s) => s.status === 'done');
      const completedTasks = myTasks.filter((t) => t.status === 'done');

      return res.json({
        success: true,
        data: {
          user: { id: userId, name: userName },
          timeframe,
          counts: {
            totalStories: myStories.length,
            totalTasks: myTasks.length,
            inProgress: inProgressStories.length + inProgressTasks.length,
            blocked: blockedStories.length + blockedTasks.length,
            overdue: overdueStories.length + overdueTasks.length,
            completed: completedStories.length + completedTasks.length,
          },
          summary: {
            totalAssigned: myStories.length + myTasks.length,
            inProgress: inProgressStories.length + inProgressTasks.length,
            blocked: blockedStories.length + blockedTasks.length,
            overdue: overdueStories.length + overdueTasks.length,
            completed: completedStories.length + completedTasks.length,
          },
          stories: myStories,
          tasks: myTasks,
          activeSprints: sprints,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async updateItemStatus(req: Request, res: Response) {
    try {
      const { itemId, itemType, status } = req.body;
      if (!itemId || !itemType || !status) {
        return res.status(400).json({ success: false, message: 'itemId, itemType, and status are required' });
      }

      if (itemType !== 'story' && itemType !== 'task') {
        return res.status(400).json({ success: false, message: 'Invalid itemType' });
      }
      if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      const actor = getActor(req);
      // Sprint 16: only the assignee or a member of the project may change the
      // status, and only to a known status value.
      const repo: any = itemType === 'story' ? StoryRepository : TaskRepository;
      const existing = await repo.findById(itemId);
      if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } });
      const checkedStatus = await DeliveryGuards.assertStatusChange(itemType, existing, status, { id: req.user.userId, role: req.user.role });
      const updated: any = await repo.update(itemId, { status: checkedStatus });

      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: itemType,
        entityId: itemId,
        action: 'status_change',
        actorId: actor.id,
        actorName: actor.name,
        details: { newStatus: checkedStatus, fromMyWork: true },
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, data: updated });
    } catch (err: any) {
      const status = Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : 500;
      return res.status(status).json({ success: false, error: { code: err?.code || 'INTERNAL_ERROR', message: err.message }, message: err.message });
    }
  },
};
