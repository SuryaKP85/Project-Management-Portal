import { SprintRepository } from '../repositories/sprintRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { VelocityRepository } from '../repositories/velocityRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { NotificationService } from '../services/notificationService';
import { Sprint, Story, Task } from '../models/types';
import crypto from 'crypto';

export interface Actor {
  id: string;
  name: string;
}

export const SprintService = {
  async listSprints(filter?: { projectId?: string; status?: string }): Promise<Sprint[]> {
    return SprintRepository.findAll(filter);
  },

  async getSprint(id: string): Promise<Sprint | null> {
    return SprintRepository.findById(id);
  },

  async createSprint(
    data: {
      name: string;
      projectId: string;
      goal?: string;
      startDate: string;
      endDate: string;
      capacityHours?: number;
      capacityPoints?: number;
    },
    actor: Actor
  ): Promise<Sprint> {
    const id = `spr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const code = `SPR-${Math.floor(100 + Math.random() * 900)}`;
    const sprint: Sprint = {
      id,
      code,
      name: data.name,
      projectId: data.projectId,
      goal: data.goal,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'planning',
      capacityHours: data.capacityHours || 160,
      capacityPoints: data.capacityPoints || 40,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await SprintRepository.create(sprint);

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      entityType: 'sprint',
      entityId: created.id,
      action: 'create',
      actorId: actor.id,
      actorName: actor.name,
      details: { sprintName: created.name, projectId: created.projectId },
      createdAt: new Date().toISOString(),
    });

    return created;
  },

  async updateSprint(id: string, updates: Partial<Sprint>, actor: Actor): Promise<Sprint | null> {
    const updated = await SprintRepository.update(id, updates);
    if (!updated) return null;

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      entityType: 'sprint',
      entityId: updated.id,
      action: 'update',
      actorId: actor.id,
      actorName: actor.name,
      details: { sprintName: updated.name, updates },
      createdAt: new Date().toISOString(),
    });

    return updated;
  },

  async startSprint(id: string, actor: Actor): Promise<Sprint> {
    const sprint = await SprintRepository.findById(id);
    if (!sprint) {
      throw new Error('Sprint not found');
    }

    const activeSprint = await SprintRepository.findActiveByProject(sprint.projectId);
    if (activeSprint && activeSprint.id !== sprint.id) {
      throw new Error(
        `Cannot start sprint. Project already has an active sprint "${activeSprint.name}". Complete or cancel it first.`
      );
    }

    const updated = await SprintRepository.update(sprint.id, { status: 'active' });
    if (!updated) throw new Error('Failed to update sprint status');

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

    await NotificationService.sendNotification({
      userId: actor.id,
      title: 'Sprint Started',
      message: `Sprint "${sprint.name}" is now Active! Target completion: ${sprint.endDate}`,
      type: 'sprint_started',
      isRead: false,
    });

    return updated;
  },

  async completeSprint(
    id: string,
    options: { carryoverAction?: 'carryover' | 'backlog' | 'cancelled'; targetSprintId?: string },
    actor: Actor
  ): Promise<{ sprint: Sprint; velocity: any; carryoverCount: number }> {
    const sprint = await SprintRepository.findById(id);
    if (!sprint) throw new Error('Sprint not found');

    const carryoverAction = options.carryoverAction || 'backlog';

    const allStories = await StoryRepository.findAll({ sprintId: sprint.id });
    const allTasks = await TaskRepository.findAll({ sprintId: sprint.id });

    const completedStories = allStories.filter((s) => s.status === 'done');
    const incompleteStories = allStories.filter((s) => s.status !== 'done');

    const completedTasks = allTasks.filter((t) => t.status === 'done');
    const incompleteTasks = allTasks.filter((t) => t.status !== 'done');

    const committedPoints = allStories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const completedPoints = completedStories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);

    const committedHours = allTasks.reduce((sum, t) => sum + (t.estimatedEffortHrs || 0), 0);
    const completedHours = completedTasks.reduce(
      (sum, t) => sum + (t.actualEffortHrs || t.estimatedEffortHrs || 0),
      0
    );

    const velocity = await VelocityRepository.record({
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

    let carryoverCount = 0;
    if (carryoverAction === 'backlog') {
      for (const story of incompleteStories) {
        await StoryRepository.update(story.id, { sprintId: undefined, sprint: undefined });
        carryoverCount++;
      }
      for (const task of incompleteTasks) {
        await TaskRepository.update(task.id, { sprintId: undefined, sprint: undefined });
        carryoverCount++;
      }
    } else if (carryoverAction === 'carryover' && options.targetSprintId) {
      for (const story of incompleteStories) {
        await StoryRepository.update(story.id, { sprintId: options.targetSprintId });
        carryoverCount++;
      }
      for (const task of incompleteTasks) {
        await TaskRepository.update(task.id, { sprintId: options.targetSprintId });
        carryoverCount++;
      }
    }

    const updatedSprint = await SprintRepository.update(sprint.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    if (!updatedSprint) throw new Error('Failed to update sprint status to completed');

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
        carryoverCount,
      },
      createdAt: new Date().toISOString(),
    });

    await NotificationService.sendNotification({
      userId: actor.id,
      title: 'Sprint Completed',
      message: `Sprint "${sprint.name}" completed! Delivered ${completedPoints}/${committedPoints} points.`,
      type: 'sprint_completed',
      isRead: false,
    });

    return { sprint: updatedSprint, velocity, carryoverCount };
  },

  async deleteSprint(id: string, actor: Actor): Promise<boolean> {
    const sprint = await SprintRepository.findById(id);
    if (!sprint) return false;

    // Return all items to backlog
    const stories = await StoryRepository.findAll({ sprintId: id });
    for (const story of stories) {
      await StoryRepository.update(story.id, { sprintId: undefined, sprint: undefined });
    }
    const tasks = await TaskRepository.findAll({ sprintId: id });
    for (const task of tasks) {
      await TaskRepository.update(task.id, { sprintId: undefined, sprint: undefined });
    }

    const success = await SprintRepository.delete(id);
    if (success) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'sprint',
        entityId: id,
        action: 'delete',
        actorId: actor.id,
        actorName: actor.name,
        details: { sprintName: sprint.name },
        createdAt: new Date().toISOString(),
      });
    }
    return success;
  },

  async getSprintItems(sprintId: string) {
    const stories = await StoryRepository.findAll({ sprintId });
    const tasks = await TaskRepository.findAll({ sprintId });
    return { stories, tasks };
  },

  async addSprintItem(
    sprintId: string,
    item: { itemId: string; itemType: 'story' | 'task' },
    actor: Actor
  ) {
    if (item.itemType === 'story') {
      const story = await StoryRepository.update(item.itemId, { sprintId });
      return story;
    } else {
      const task = await TaskRepository.update(item.itemId, { sprintId });
      return task;
    }
  },

  async removeSprintItem(
    sprintId: string,
    item: { itemId: string; itemType: 'story' | 'task' },
    actor: Actor
  ) {
    if (item.itemType === 'story') {
      const story = await StoryRepository.update(item.itemId, { sprintId: undefined, sprint: undefined });
      return story;
    } else {
      const task = await TaskRepository.update(item.itemId, { sprintId: undefined, sprint: undefined });
      return task;
    }
  },
};
