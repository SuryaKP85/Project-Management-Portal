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

function getActor(req: Request) {
  if (!req.user) return { id: 'usr_admin_1', name: 'Admin User' };
  return {
    id: req.user.userId,
    name: `${req.user.firstName} ${req.user.lastName}`.trim() || req.user.email,
  };
}

export const SprintController = {
  async listSprints(req: Request, res: Response) {
    try {
      const { projectId, status } = req.query;
      const sprints = await SprintRepository.findAll({
        projectId: projectId ? String(projectId) : undefined,
        status: status ? String(status) : undefined,
      });
      return res.json({ success: true, data: sprints });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async getSprint(req: Request, res: Response) {
    try {
      const sprint = await SprintRepository.findById(req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }
      return res.json({ success: true, data: sprint });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async createSprint(req: Request, res: Response) {
    try {
      const { name, projectId, goal, startDate, endDate, status, capacityHours, capacityPoints } = req.body;
      if (!name || !projectId || !startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Name, projectId, startDate, and endDate are required' });
      }

      const sprint = await SprintRepository.create({
        name,
        code: `SPR-${Math.floor(100 + Math.random() * 900)}`,
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
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async updateSprint(req: Request, res: Response) {
    try {
      const sprint = await SprintRepository.update(req.params.id, req.body);
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
        details: { sprintName: sprint.name, updates: req.body },
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, data: sprint });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async startSprint(req: Request, res: Response) {
    try {
      const sprint = await SprintRepository.findById(req.params.id);
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
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async completeSprint(req: Request, res: Response) {
    try {
      const sprint = await SprintRepository.findById(req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }

      const { carryoverAction = 'carryover', targetSprintId } = req.body;
      // carryoverAction: 'carryover' (to targetSprint or create new), 'backlog', 'cancelled'

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
      const updatedSprint = await SprintRepository.update(sprint.id, { status: 'completed' });
      const actor = getActor(req);

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
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async getSprintItems(req: Request, res: Response) {
    try {
      const sprint = await SprintRepository.findById(req.params.id);
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
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async addSprintItem(req: Request, res: Response) {
    try {
      const sprint = await SprintRepository.findById(req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }

      const { itemId, itemType } = req.body;
      if (!itemId) {
        return res.status(400).json({ success: false, message: 'itemId is required' });
      }

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
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async removeSprintItem(req: Request, res: Response) {
    try {
      const sprint = await SprintRepository.findById(req.params.id);
      if (!sprint) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }

      const { itemId } = req.params;
      const { itemType } = req.query;

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
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async getSprintCapacity(req: Request, res: Response) {
    try {
      const capacity = await CapacityService.calculateSprintCapacity(req.params.id);
      return res.json({ success: true, data: capacity });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async getSprintBurndown(req: Request, res: Response) {
    try {
      const burndown = await BurndownService.getSprintBurndown(req.params.id);
      return res.json({ success: true, data: burndown });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  async deleteSprint(req: Request, res: Response) {
    try {
      const deleted = await SprintRepository.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Sprint not found' });
      }
      return res.json({ success: true, message: 'Sprint deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },
};
