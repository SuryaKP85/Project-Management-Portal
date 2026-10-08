import { respondToDatabaseFailure } from '../middleware/errorHandler';
import { Request, Response } from 'express';
import { SprintRepository } from '../repositories/sprintRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { VelocityRepository } from '../repositories/velocityRepository';
import { CapacityService } from '../services/capacityService';
import { BurndownService } from '../services/burndownService';
import { ActivityRepository } from '../repositories/activityRepository';
import { NotificationService } from '../services/notificationService';
import crypto from 'crypto';
import { ProjectScope, scopeActor } from '../services/projectScope';
import { notAvailable, requireActor } from '../services/followThroughSupport';
import { withTransaction } from '../config/database';

function getActor(req: Request) {
  // Sprint 24: the authenticated caller (401 without one) — never a placeholder user.
  return requireActor(req.user ? { id: req.user.userId, name: `${req.user.firstName} ${req.user.lastName}`.trim() || req.user.email } : undefined);
}

/** Sprint 22A: access errors keep their status (404 / 403); other errors keep this handler's fallback. */
/** Sprint 24: sprint names fit sprints.name and the stories/tasks sprint columns (255 characters). */
export const SPRINT_NAME_MAX = 255;
function sprintNameError(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'Sprint name must be text.';
  return name.length > SPRINT_NAME_MAX ? `Sprint name must be at most ${SPRINT_NAME_MAX} characters.` : null;
}

function failWith(res: Response, err: any, fallback: number) {
  if (respondToDatabaseFailure(res, err)) return res; // Sprint 24: database failures are 409/503, never a validation error
  const status = Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : fallback;
  return res.status(status).json({ success: false, message: err?.message, ...(err?.code ? { error: { code: err.code, message: err.message } } : {}) });
}

/** The sprint when the caller can see its project; otherwise null (a 404 that reveals nothing). */
async function visibleSprint(req: Request, id: string) {
  const sprint = await SprintRepository.findById(id);
  return sprint && (await ProjectScope.canRead(scopeActor(req), sprint.projectId)) ? sprint : null;
}

/** The sprint when the caller can change its project: 404 when not visible, 403 when read-only. */
async function writableSprint(req: Request, id: string) {
  const sprint = await visibleSprint(req, id);
  if (!sprint) throw notAvailable('Sprint');
  await ProjectScope.assertWrite(scopeActor(req), sprint.projectId, 'Sprint');
  return sprint;
}

/** A story or task to move in or out of a sprint: visible, and in the sprint's own project. */
async function sprintProjectItem(req: Request, sprintProjectId: string, itemType: unknown, itemId: string) {
  const item: any = itemType === 'task' ? await TaskRepository.findById(itemId) : await StoryRepository.findById(itemId);
  if (!item || !(await ProjectScope.canRead(scopeActor(req), item.projectId))) {
    throw notAvailable(itemType === 'task' ? 'Task' : 'Story');
  }
  if (item.projectId !== sprintProjectId) {
    throw Object.assign(new Error('Only work from the sprint\'s own project can be planned into it.'), { status: 400, code: 'VALIDATION_ERROR' });
  }
  return item;
}

export const SprintController = {
  async listSprints(req: Request, res: Response) {
    try {
      const { projectId, status } = req.query;
      const sprints = await ProjectScope.filter(scopeActor(req), await SprintRepository.findAll({
        projectId: projectId ? String(projectId) : undefined,
        status: status ? String(status) : undefined,
      }), (sp) => sp.projectId);
      return res.json({ success: true, data: sprints });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },

  async getSprint(req: Request, res: Response) {
    try {
      const sprint = await visibleSprint(req, req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }
      return res.json({ success: true, data: sprint });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },

  async createSprint(req: Request, res: Response) {
    try {
      const { name, projectId, goal, startDate, endDate, status, capacityHours, capacityPoints } = req.body;
      if (!name || !projectId || !startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Name, projectId, startDate, and endDate are required' });
      }
      if (sprintNameError(name)) return res.status(400).json({ success: false, message: sprintNameError(name) });
      await ProjectScope.assertWrite(scopeActor(req), String(projectId), 'Project');

      const sprint = await SprintRepository.create({
        name,
        code: '', // Sprint 24: the repository issues a collision-safe SPR code
        projectId,
        goal,
        startDate,
        endDate,
        status: status || 'planning',
        capacityHours: Number(capacityHours) || 160,
        capacityPoints: Number(capacityPoints) || 40,
      });

      const actor = getActor(req);
      // Log activity
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'sprint',
        entityId: sprint.id,
        action: 'create',
        actorId: actor.id,
        actorName: actor.name,
        details: { sprintName: sprint.name, projectId: sprint.projectId },
        createdAt: new Date().toISOString(),
      });

      return res.status(201).json({ success: true, data: sprint });
    } catch (err: any) {
      return failWith(res, err, 400);
    }
  },

  async updateSprint(req: Request, res: Response) {
    try {
      const current = await writableSprint(req, req.params.id);
      const { id: _id, projectId: movedTo, ...updates } = req.body || {};
      if (movedTo !== undefined && movedTo !== current.projectId) {
        return res.status(400).json({ success: false, message: 'A sprint cannot be moved to another project.' });
      }
      if (updates.name !== undefined && sprintNameError(updates.name)) return res.status(400).json({ success: false, message: sprintNameError(updates.name) });
      const sprint = await SprintRepository.update(req.params.id, updates);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }

      const actor = getActor(req);
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'sprint',
        entityId: sprint.id,
        action: 'update',
        actorId: actor.id,
        actorName: actor.name,
        details: { sprintName: sprint.name, updates },
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, data: sprint });
    } catch (err: any) {
      return failWith(res, err, 400);
    }
  },

  async startSprint(req: Request, res: Response) {
    try {
      const sprint = await writableSprint(req, req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }

      // Check if project already has an active sprint
      const activeSprint = await SprintRepository.findActiveByProject(sprint.projectId);
      if (activeSprint && activeSprint.id !== sprint.id) {
        return res.status(400).json({
          success: false,
          message: `Cannot start sprint. Project already has an active sprint "${activeSprint.name}". Complete or cancel it first.`,
        });
      }

      const updated = await SprintRepository.update(sprint.id, { status: 'active' });
      const actor = getActor(req);

      // Activity log
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'sprint',
        entityId: sprint.id,
        action: 'start',
        actorId: actor.id,
        actorName: actor.name,
        details: { sprintName: sprint.name, projectId: sprint.projectId },
        createdAt: new Date().toISOString(),
      });

      // Notification
      await NotificationService.sendNotification({
        userId: actor.id,
        title: 'Sprint Started',
        message: `Sprint "${sprint.name}" is now Active! Target completion: ${sprint.endDate}`,
        type: 'sprint_started',
        isRead: false,
      });

      return res.json({ success: true, data: updated, message: `Sprint "${sprint.name}" started successfully.` });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },

  async completeSprint(req: Request, res: Response) {
    try {
      const actor = getActor(req); // Sprint 24: before any change
      const sprint = await writableSprint(req, req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }
      // Sprint 24: a sprint is completed once (its velocity is recorded once).
      if (sprint.status === 'completed') {
        return res.status(409).json({ success: false, message: 'This sprint is already completed.', error: { code: 'CONFLICT', message: 'This sprint is already completed.' } });
      }

      const { carryoverAction = 'carryover', targetSprintId } = req.body;
      // carryoverAction: 'carryover' (to targetSprint or create new), 'backlog', 'cancelled'
      // Sprint 22A: carried-over work stays in the sprint's project (checked before anything is recorded).
      if (carryoverAction !== 'backlog' && carryoverAction !== 'cancelled' && targetSprintId) {
        const target = await SprintRepository.findById(String(targetSprintId));
        if (!target || target.projectId !== sprint.projectId || !(await ProjectScope.canRead(scopeActor(req), target.projectId))) {
          return res.status(400).json({ success: false, message: 'The target sprint must be a sprint of the same project.' });
        }
      }

      // Get all stories and tasks in sprint
      const allStories = await StoryRepository.findAll({ sprintId: sprint.id });
      const allTasks = await TaskRepository.findAll({ sprintId: sprint.id });

      const completedStories = allStories.filter((s) => s.status === 'done');
      const incompleteStories = allStories.filter((s) => s.status !== 'done');

      const completedTasks = allTasks.filter((t) => t.status === 'done');
      const incompleteTasks = allTasks.filter((t) => t.status !== 'done');

      const committedPoints = allStories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
      const completedPoints = completedStories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);

      const committedHours = allTasks.reduce((sum, t) => sum + (t.estimatedEffortHrs || 0), 0);
      const completedHours = completedTasks.reduce((sum, t) => sum + (t.actualEffortHrs || t.estimatedEffortHrs || 0), 0);

      // Sprint 24: velocity, carry-over and the sprint's completion are one unit (a PostgreSQL
      // transaction): a failure part-way leaves the sprint and its items as they were.
      const updatedSprint = await withTransaction(async () => {
        // Record velocity
        await VelocityRepository.record({
          sprintId: sprint.id,
          sprintName: sprint.name,
          projectId: sprint.projectId,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          completedDate: new Date().toISOString(),
          committedPoints,
          completedPoints,
          committedHours,
          completedHours,
        });

        // Handle carryover for incomplete items
        if (carryoverAction === 'backlog') {
          // Return to backlog
          for (const story of incompleteStories) {
            await StoryRepository.update(story.id, {
              sprintId: undefined,
              sprint: undefined,
              status: story.status === 'in-progress' ? 'ready' : story.status,
            });
          }
          for (const task of incompleteTasks) {
            await TaskRepository.update(task.id, {
              sprintId: undefined,
              sprint: undefined,
              status: task.status === 'in-progress' ? 'ready' : task.status,
            });
          }
        } else if (carryoverAction === 'cancelled') {
          // Cancel incomplete items
          for (const story of incompleteStories) {
            await StoryRepository.update(story.id, { status: 'cancelled' });
          }
          for (const task of incompleteTasks) {
            await TaskRepository.update(task.id, { status: 'cancelled' });
          }
        } else {
          // Move to targetSprintId if provided, else clear sprint so they can be planned
          const destSprintId = targetSprintId || null;
          let destSprintName = '';
          if (destSprintId) {
            const destSprint = await SprintRepository.findById(destSprintId);
            if (destSprint) destSprintName = destSprint.name;
          }

          for (const story of incompleteStories) {
            await StoryRepository.update(story.id, {
              sprintId: destSprintId || undefined,
              sprint: destSprintName || undefined,
            });
          }
          for (const task of incompleteTasks) {
            await TaskRepository.update(task.id, {
              sprintId: destSprintId || undefined,
              sprint: destSprintName || undefined,
            });
          }
        }

        // Mark sprint completed
        return SprintRepository.update(sprint.id, { status: 'completed' });
      });

      // Activity log
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'sprint',
        entityId: sprint.id,
        action: 'complete',
        actorId: actor.id,
        actorName: actor.name,
        details: {
          sprintName: sprint.name,
          completedPoints,
          committedPoints,
          carriedOverStories: incompleteStories.length,
          carryoverAction,
        },
        createdAt: new Date().toISOString(),
      });

      // Notification
      await NotificationService.sendNotification({
        userId: actor.id,
        title: 'Sprint Completed',
        message: `Sprint "${sprint.name}" completed! Delivered ${completedPoints} / ${committedPoints} story points. ${incompleteStories.length} items carried over.`,
        type: 'work_completed',
        isRead: false,
      });

      return res.json({
        success: true,
        data: updatedSprint,
        velocity: { committedPoints, completedPoints, committedHours, completedHours },
        carriedOverCount: incompleteStories.length + incompleteTasks.length,
        message: `Sprint "${sprint.name}" completed successfully.`,
      });
    } catch (err: any) {
      // Sprint 24: a concurrent completion loses on the one-velocity-per-sprint index; nothing of it was kept.
      if (err?.code === '23505') return res.status(409).json({ success: false, message: 'This sprint is already completed.', error: { code: 'CONFLICT', message: 'This sprint is already completed.' } });
      return failWith(res, err, 500);
    }
  },

  async getSprintItems(req: Request, res: Response) {
    try {
      const sprint = await visibleSprint(req, req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }

      const stories = await StoryRepository.findAll({ sprintId: sprint.id });
      const tasks = await TaskRepository.findAll({ sprintId: sprint.id });

      return res.json({
        success: true,
        data: {
          sprint,
          stories,
          tasks,
          totalStories: stories.length,
          totalTasks: tasks.length,
          storyPointsCommitted: stories.reduce((sum, s) => sum + (s.storyPoints || 0), 0),
          storyPointsCompleted: stories.filter((s) => s.status === 'done').reduce((sum, s) => sum + (s.storyPoints || 0), 0),
          taskHoursCommitted: tasks.reduce((sum, t) => sum + (t.estimatedEffortHrs || 0), 0),
          taskHoursCompleted: tasks.filter((t) => t.status === 'done').reduce((sum, t) => sum + (t.actualEffortHrs || t.estimatedEffortHrs || 0), 0),
        },
      });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },

  async addSprintItem(req: Request, res: Response) {
    try {
      const sprint = await writableSprint(req, req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }

      const { itemId, itemType } = req.body;
      if (!itemId) {
        return res.status(400).json({ success: false, message: 'itemId is required' });
      }
      await sprintProjectItem(req, sprint.projectId, itemType, String(itemId));

      let updatedItem: any = null;
      if (itemType === 'task') {
        const task = await TaskRepository.findById(itemId);
        if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
        updatedItem = await TaskRepository.update(itemId, {
          sprintId: sprint.id,
          sprint: sprint.name,
          status: task.status === 'backlog' ? 'ready' : task.status,
        });
      } else {
        // Default to story
        const story = await StoryRepository.findById(itemId);
        if (!story) return res.status(404).json({ success: false, message: 'Story not found' });
        updatedItem = await StoryRepository.update(itemId, {
          sprintId: sprint.id,
          sprint: sprint.name,
          status: story.status === 'backlog' ? 'ready' : story.status,
        });

        // Also update child tasks of story if any
        const childTasks = await TaskRepository.findAll({ storyId: itemId });
        for (const ct of childTasks) {
          await TaskRepository.update(ct.id, {
            sprintId: sprint.id,
            sprint: sprint.name,
            status: ct.status === 'backlog' ? 'ready' : ct.status,
          });
        }
      }

      const actor = getActor(req);
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'sprint',
        entityId: sprint.id,
        action: 'assign',
        actorId: actor.id,
        actorName: actor.name,
        details: { itemId, itemType, sprintName: sprint.name },
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, data: updatedItem });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },

  async removeSprintItem(req: Request, res: Response) {
    try {
      const sprint = await writableSprint(req, req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }

      const { itemId } = req.params;
      const { itemType } = req.query;
      await sprintProjectItem(req, sprint.projectId, itemType, itemId);

      let updatedItem: any = null;
      if (itemType === 'task') {
        updatedItem = await TaskRepository.update(itemId, {
          sprintId: undefined,
          sprint: undefined,
          status: 'ready',
        });
      } else {
        // Default to story
        updatedItem = await StoryRepository.update(itemId, {
          sprintId: undefined,
          sprint: undefined,
          status: 'ready',
        });
      }

      const actor = getActor(req);
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'sprint',
        entityId: sprint.id,
        action: 'reassign',
        actorId: actor.id,
        actorName: actor.name,
        details: { itemId, itemType, removedFromSprint: sprint.name },
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, data: updatedItem, message: 'Item returned to backlog' });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },

  async getSprintCapacity(req: Request, res: Response) {
    try {
      if (!(await visibleSprint(req, req.params.id))) throw notAvailable('Sprint');
      const capacity = await CapacityService.calculateSprintCapacity(req.params.id);
      return res.json({ success: true, data: capacity });
    } catch (err: any) {
      return failWith(res, err, 400);
    }
  },

  async getSprintBurndown(req: Request, res: Response) {
    try {
      if (!(await visibleSprint(req, req.params.id))) throw notAvailable('Sprint');
      const burndown = await BurndownService.getSprintBurndown(req.params.id);
      return res.json({ success: true, data: burndown });
    } catch (err: any) {
      return failWith(res, err, 400);
    }
  },

  async deleteSprint(req: Request, res: Response) {
    try {
      await writableSprint(req, req.params.id);
      const deleted = await SprintRepository.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }
      return res.json({ success: true, message: 'Sprint deleted successfully' });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },
};
