import { BacklogRepository } from '../repositories/backlogRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { BacklogItem, BacklogItemType } from '../models/types';
import { Actor } from './sprintService';
import crypto from 'crypto';

export const BacklogService = {
  async getBacklog(filter?: {
    projectId?: string;
    type?: string;
    status?: string;
    priority?: string;
    assigneeId?: string;
    search?: string;
    includeSprintItems?: boolean;
  }): Promise<BacklogItem[]> {
    return BacklogRepository.getBacklogItems(filter);
  },

  async createBacklogItem(
    data: {
      type: 'story' | 'task';
      title: string;
      description?: string;
      projectId?: string;
      featureId?: string;
      storyPoints?: number;
      estimatedEffortHrs?: number;
      priority?: string;
      assigneeId?: string;
      assigneeName?: string;
    },
    actor: Actor
  ) {
    if (data.type === 'story') {
      const code = `STR-${Math.floor(100 + Math.random() * 900)}`;
      const story = await StoryRepository.create({
        id: `str_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        code,
        title: data.title,
        description: data.description,
        featureId: data.featureId,
        projectId: data.projectId || 'proj_1',
        storyPoints: data.storyPoints || 3,
        priority: (data.priority as any) || 'medium',
        status: 'backlog',
        assigneeId: data.assigneeId,
        assigneeName: data.assigneeName,
        acceptanceCriteria: [],
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'story',
        entityId: story.id,
        action: 'create',
        actorId: actor.id,
        actorName: actor.name,
        details: { title: story.title, code: story.code },
        createdAt: new Date().toISOString(),
      });

      return story;
    } else {
      const code = `TSK-${Math.floor(100 + Math.random() * 900)}`;
      const task = await TaskRepository.create({
        id: `tsk_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        code,
        title: data.title,
        description: data.description,
        projectId: data.projectId || 'proj_1',
        storyId: undefined,
        estimatedEffortHrs: data.estimatedEffortHrs || 8,
        actualEffortHrs: 0,
        priority: (data.priority as any) || 'medium',
        status: 'backlog',
        assigneeId: data.assigneeId,
        assigneeName: data.assigneeName,
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'task',
        entityId: task.id,
        action: 'create',
        actorId: actor.id,
        actorName: actor.name,
        details: { title: task.title, code: task.code },
        createdAt: new Date().toISOString(),
      });

      return task;
    }
  },

  async reorder(
    items: Array<{ id: string; type: BacklogItemType; backlogOrder?: number; rank?: number }>,
    actor: Actor
  ) {
    const formatted = items.map((i, idx) => ({
      id: i.id,
      type: i.type,
      backlogOrder: i.backlogOrder ?? i.rank ?? idx + 1,
    }));
    await BacklogRepository.reorder(formatted);
    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      entityType: 'backlog',
      entityId: items[0]?.id || 'backlog',
      action: 'reorder',
      actorId: actor.id,
      actorName: actor.name,
      details: { reorderedCount: items.length },
      createdAt: new Date().toISOString(),
    });
  },

  async moveToSprint(
    itemId: string,
    type: 'story' | 'task',
    sprintId: string | null,
    actor: Actor
  ) {
    if (type === 'story') {
      const updated = await StoryRepository.update(itemId, {
        sprintId: sprintId || undefined,
        sprint: sprintId ? undefined : undefined,
      });
      return updated;
    } else {
      const updated = await TaskRepository.update(itemId, {
        sprintId: sprintId || undefined,
        sprint: sprintId ? undefined : undefined,
      });
      return updated;
    }
  },

  async bulkMoveToSprint(
    items: Array<{ id: string; type: 'story' | 'task' }>,
    sprintId: string | null,
    actor: Actor
  ) {
    const results = [];
    for (const item of items) {
      const res = await this.moveToSprint(item.id, item.type, sprintId, actor);
      results.push(res);
    }
    return results;
  },
};
