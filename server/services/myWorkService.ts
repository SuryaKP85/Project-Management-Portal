import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { SubtaskRepository } from '../repositories/subtaskRepository';
import { SprintRepository } from '../repositories/sprintRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { Story, Task, Subtask } from '../models/types';
import { Actor } from './sprintService';
import crypto from 'crypto';

export interface MyWorkResult {
  userId: string;
  summary: {
    totalAssigned: number;
    inProgress: number;
    completed: number;
    overdue: number;
    storyPointsTotal: number;
    effortHoursTotal: number;
  };
  stories: Story[];
  tasks: Task[];
  subtasks: Subtask[];
}

export const MyWorkService = {
  async getMyWork(userId: string, timeframe: string = 'all'): Promise<MyWorkResult> {
    const [allStories, allTasks, allSubtasks, activeSprints] = await Promise.all([
      StoryRepository.findAll(),
      TaskRepository.findAll(),
      SubtaskRepository.findAll(),
      SprintRepository.findAll({ status: 'active' }),
    ]);

    const activeSprintIds = new Set(activeSprints.map((s) => s.id));

    // Filter assigned to current user
    const isAssigned = (item: any) => item.assigneeId === userId;

    let myStories = allStories.filter(isAssigned);
    let myTasks = allTasks.filter(isAssigned);
    let mySubtasks = allSubtasks.filter(isAssigned);

    const todayStr = new Date().toISOString().split('T')[0];
    const nextWeekDate = new Date();
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    const nextWeekStr = nextWeekDate.toISOString().split('T')[0];

    if (timeframe === 'current_sprint') {
      myStories = myStories.filter((s) => s.sprintId && activeSprintIds.has(s.sprintId));
      myTasks = myTasks.filter((t) => t.sprintId && activeSprintIds.has(t.sprintId));
    } else if (timeframe === 'overdue') {
      myStories = myStories.filter((s) => s.dueDate && s.dueDate < todayStr && s.status !== 'done');
      myTasks = myTasks.filter((t) => t.dueDate && t.dueDate < todayStr && t.status !== 'done');
    } else if (timeframe === 'today') {
      myStories = myStories.filter((s) => s.dueDate === todayStr || s.status === 'in-progress');
      myTasks = myTasks.filter((t) => t.dueDate === todayStr || t.status === 'in-progress');
    } else if (timeframe === 'this_week') {
      myStories = myStories.filter(
        (s) => (s.dueDate && s.dueDate <= nextWeekStr && s.status !== 'done') || s.status === 'in-progress'
      );
      myTasks = myTasks.filter(
        (t) => (t.dueDate && t.dueDate <= nextWeekStr && t.status !== 'done') || t.status === 'in-progress'
      );
    }

    const allItems = [...myStories, ...myTasks, ...mySubtasks];
    const inProgress = allItems.filter((i) => i.status === 'in-progress').length;
    const completed = allItems.filter((i) => i.status === 'done').length;
    const overdue = allItems.filter(
      (i: any) => i.dueDate && i.dueDate < todayStr && i.status !== 'done'
    ).length;

    const storyPointsTotal = myStories.reduce((acc, s) => acc + (s.storyPoints || 0), 0);
    const effortHoursTotal = myTasks.reduce((acc, t) => acc + (t.estimatedEffortHrs || 0), 0);

    return {
      userId,
      summary: {
        totalAssigned: allItems.length,
        inProgress,
        completed,
        overdue,
        storyPointsTotal,
        effortHoursTotal,
      },
      stories: myStories,
      tasks: myTasks,
      subtasks: mySubtasks,
    };
  },

  async updateItemStatus(
    itemId: string,
    type: 'story' | 'task' | 'subtask',
    status: string,
    actor: Actor
  ) {
    let updated: any = null;
    if (type === 'story') {
      updated = await StoryRepository.update(itemId, { status: status as any });
    } else if (type === 'task') {
      updated = await TaskRepository.update(itemId, { status: status as any });
    } else if (type === 'subtask') {
      updated = await SubtaskRepository.update(itemId, { status: status as any });
    }

    if (updated) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: type,
        entityId: itemId,
        action: 'status_change',
        actorId: actor.id,
        actorName: actor.name,
        details: { newStatus: status, title: updated.title },
        createdAt: new Date().toISOString(),
      });
    }

    return updated;
  },
};
