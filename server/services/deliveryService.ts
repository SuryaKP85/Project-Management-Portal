import crypto from 'crypto';
import {
  Epic,
  Feature,
  UserStory,
  Task,
  Subtask,
  SafeUser,
  ActivityAction,
} from '../models/types';
import { EpicRepository } from '../repositories/epicRepository';
import { FeatureRepository } from '../repositories/featureRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { SubtaskRepository } from '../repositories/subtaskRepository';
import { TraceabilityRepository } from '../repositories/traceabilityRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { NotificationRepository } from '../repositories/notificationRepository';

export const DeliveryService = {
  // ==========================================
  // PROGRESS ROLLUP ENGINE
  // ==========================================
  async rollupFromSubtask(taskId: string) {
    if (!taskId) return;
    await TaskRepository.recalculateProgress(taskId);
    const task = await TaskRepository.findById(taskId);
    if (task?.storyId) {
      await this.rollupFromTask(task.storyId);
    }
  },

  async rollupFromTask(storyId: string) {
    if (!storyId) return;
    await StoryRepository.recalculateProgress(storyId);
    const story = await StoryRepository.findById(storyId);
    if (story?.featureId) {
      await this.rollupFromStory(story.featureId);
    } else if (story?.epicId) {
      await EpicRepository.recalculateProgress(story.epicId);
    }
  },

  async rollupFromStory(featureId: string) {
    if (!featureId) return;
    await FeatureRepository.recalculateProgress(featureId);
    const feature = await FeatureRepository.findById(featureId);
    if (feature?.epicId) {
      await EpicRepository.recalculateProgress(feature.epicId);
    }
  },

  // ==========================================
  // EPICS
  // ==========================================
  async getAllEpics(filter?: any): Promise<Epic[]> {
    return EpicRepository.findAll(filter);
  },

  async getEpicById(id: string): Promise<Epic | null> {
    return EpicRepository.findById(id);
  },

  async createEpic(data: Partial<Epic>, actor: SafeUser): Promise<Epic> {
    const id = data.id || `epic_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const code = data.code || `EPC-${Math.floor(100 + Math.random() * 900)}`;

    const epic: Epic = {
      id,
      code,
      name: data.name || 'Untitled Epic',
      description: data.description || '',
      projectId: data.projectId!,
      productId: data.productId,
      portfolioId: data.portfolioId,
      ownerId: data.ownerId || actor.id,
      teamId: data.teamId,
      status: data.status || 'backlog',
      priority: data.priority || 'medium',
      health: data.health || 'on-track',
      progress: data.progress || 0,
      startDate: data.startDate,
      targetDate: data.targetDate,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await EpicRepository.create(epic);

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'epic',
      entityId: created.id,
      action: 'create',
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { code: created.code, name: created.name, projectId: created.projectId },
      createdAt: new Date().toISOString(),
    });

    if (created.ownerId && created.ownerId !== actor.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: created.ownerId,
        title: 'Epic Ownership Assigned',
        message: `You have been assigned as owner of Epic "${created.name}" (${created.code}).`,
        type: 'ownership_change',
        isRead: false,
        link: `/PM-Portal/index.html#delivery?view=epics&id=${created.id}`,
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updateEpic(id: string, updates: Partial<Epic>, actor: SafeUser): Promise<Epic | null> {
    const existing = await EpicRepository.findById(id);
    if (!existing) return null;

    const updated = await EpicRepository.update(id, updates);
    if (!updated) return null;

    let action: ActivityAction = 'update';
    if (updates.status && updates.status !== existing.status) {
      action = updates.status === 'done' ? 'complete' : updates.status === 'blocked' ? 'block' : 'status_change';
    } else if (updates.ownerId && updates.ownerId !== existing.ownerId) {
      action = 'owner_change';
    }

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'epic',
      entityId: id,
      action,
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { code: updated.code, previousStatus: existing.status, ...updates },
      createdAt: new Date().toISOString(),
    });

    if (updates.status && updates.status !== existing.status && updated.ownerId && updated.ownerId !== actor.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: updated.ownerId,
        title: `Epic Status Changed: ${updated.code}`,
        message: `Epic "${updated.name}" status updated from ${existing.status} to ${updated.status}.`,
        type: updated.status === 'done' ? 'work_completed' : updated.status === 'blocked' ? 'work_blocked' : 'status_change',
        isRead: false,
        link: `/PM-Portal/index.html#delivery?view=epics&id=${updated.id}`,
        createdAt: new Date().toISOString(),
      });
    }

    return updated;
  },

  async deleteEpic(id: string, actor: SafeUser): Promise<boolean> {
    const existing = await EpicRepository.findById(id);
    if (!existing) return false;

    const deleted = await EpicRepository.delete(id);
    if (deleted) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'epic',
        entityId: id,
        action: 'delete',
        actorId: actor.id,
        actorName: `${actor.firstName} ${actor.lastName}`,
        details: { code: existing.code, name: existing.name },
        createdAt: new Date().toISOString(),
      });
    }
    return deleted;
  },

  // ==========================================
  // FEATURES
  // ==========================================
  async getAllFeatures(filter?: any): Promise<Feature[]> {
    return FeatureRepository.findAll(filter);
  },

  async getFeatureById(id: string): Promise<Feature | null> {
    return FeatureRepository.findById(id);
  },

  async createFeature(data: Partial<Feature>, actor: SafeUser): Promise<Feature> {
    const id = data.id || `feat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const code = data.code || `FEAT-${Math.floor(100 + Math.random() * 900)}`;

    const feature: Feature = {
      id,
      code,
      name: data.name || 'Untitled Feature',
      description: data.description || '',
      epicId: data.epicId,
      projectId: data.projectId!,
      productId: data.productId,
      ownerId: data.ownerId || actor.id,
      teamId: data.teamId,
      status: data.status || 'backlog',
      priority: data.priority || 'medium',
      targetRelease: data.targetRelease,
      startDate: data.startDate,
      targetDate: data.targetDate,
      progress: data.progress || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await FeatureRepository.create(feature);

    if (created.epicId) {
      await EpicRepository.recalculateProgress(created.epicId);
    }

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'feature',
      entityId: created.id,
      action: 'create',
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { code: created.code, name: created.name, epicId: created.epicId },
      createdAt: new Date().toISOString(),
    });

    if (created.ownerId && created.ownerId !== actor.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: created.ownerId,
        title: 'Feature Assignment',
        message: `You are assigned to Feature "${created.name}" (${created.code}).`,
        type: 'work_assigned',
        isRead: false,
        link: `/PM-Portal/index.html#delivery?view=features&id=${created.id}`,
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updateFeature(id: string, updates: Partial<Feature>, actor: SafeUser): Promise<Feature | null> {
    const existing = await FeatureRepository.findById(id);
    if (!existing) return null;

    const updated = await FeatureRepository.update(id, updates);
    if (!updated) return null;

    if (updated.epicId) {
      await EpicRepository.recalculateProgress(updated.epicId);
    }

    let action: ActivityAction = 'update';
    if (updates.status && updates.status !== existing.status) {
      action = updates.status === 'done' ? 'complete' : updates.status === 'blocked' ? 'block' : 'status_change';
    } else if (updates.ownerId && updates.ownerId !== existing.ownerId) {
      action = 'owner_change';
    }

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'feature',
      entityId: id,
      action,
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { code: updated.code, previousStatus: existing.status, ...updates },
      createdAt: new Date().toISOString(),
    });

    if (updates.status && updates.status !== existing.status && updated.ownerId && updated.ownerId !== actor.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: updated.ownerId,
        title: `Feature Status: ${updated.code}`,
        message: `Feature "${updated.name}" is now marked as ${updated.status}.`,
        type: updated.status === 'done' ? 'work_completed' : updated.status === 'blocked' ? 'work_blocked' : 'status_change',
        isRead: false,
        link: `/PM-Portal/index.html#delivery?view=features&id=${updated.id}`,
        createdAt: new Date().toISOString(),
      });
    }

    return updated;
  },

  async deleteFeature(id: string, actor: SafeUser): Promise<boolean> {
    const existing = await FeatureRepository.findById(id);
    if (!existing) return false;

    const deleted = await FeatureRepository.delete(id);
    if (deleted) {
      if (existing.epicId) {
        await EpicRepository.recalculateProgress(existing.epicId);
      }
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'feature',
        entityId: id,
        action: 'delete',
        actorId: actor.id,
        actorName: `${actor.firstName} ${actor.lastName}`,
        details: { code: existing.code, name: existing.name },
        createdAt: new Date().toISOString(),
      });
    }
    return deleted;
  },

  // ==========================================
  // STORIES
  // ==========================================
  async getAllStories(filter?: any): Promise<UserStory[]> {
    return StoryRepository.findAll(filter);
  },

  async getStoryById(id: string): Promise<UserStory | null> {
    return StoryRepository.findById(id);
  },

  async createStory(data: Partial<UserStory>, actor: SafeUser): Promise<UserStory> {
    const id = data.id || `story_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const code = data.code || `STR-${Math.floor(100 + Math.random() * 900)}`;

    const story: UserStory = {
      id,
      code,
      title: data.title || 'Untitled User Story',
      description: data.description || '',
      userStory: data.userStory || { asA: '', iWant: '', soThat: '' },
      acceptanceCriteria: data.acceptanceCriteria || [],
      featureId: data.featureId,
      epicId: data.epicId,
      projectId: data.projectId!,
      productId: data.productId,
      storyPoints: data.storyPoints || 3,
      priority: data.priority || 'medium',
      status: data.status || 'backlog',
      assigneeId: data.assigneeId,
      teamId: data.teamId,
      reporterId: data.reporterId || actor.id,
      sprint: data.sprint,
      targetRelease: data.targetRelease,
      dueDate: data.dueDate,
      progress: data.progress || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await StoryRepository.create(story);

    if (created.featureId) {
      await this.rollupFromStory(created.featureId);
    } else if (created.epicId) {
      await EpicRepository.recalculateProgress(created.epicId);
    }

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'story',
      entityId: created.id,
      action: 'create',
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { code: created.code, title: created.title, storyPoints: created.storyPoints },
      createdAt: new Date().toISOString(),
    });

    if (created.assigneeId && created.assigneeId !== actor.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: created.assigneeId,
        title: 'Story Assigned',
        message: `You have been assigned to Story "${created.title}" (${created.code}).`,
        type: 'work_assigned',
        isRead: false,
        link: `/PM-Portal/index.html#delivery?view=stories&id=${created.id}`,
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updateStory(id: string, updates: Partial<UserStory>, actor: SafeUser): Promise<UserStory | null> {
    const existing = await StoryRepository.findById(id);
    if (!existing) return null;

    const updated = await StoryRepository.update(id, updates);
    if (!updated) return null;

    if (updated.featureId) {
      await this.rollupFromStory(updated.featureId);
    } else if (updated.epicId) {
      await EpicRepository.recalculateProgress(updated.epicId);
    }

    let action: ActivityAction = 'update';
    if (updates.status && updates.status !== existing.status) {
      action = updates.status === 'done' ? 'complete' : updates.status === 'blocked' ? 'block' : 'status_change';
    } else if (updates.assigneeId && updates.assigneeId !== existing.assigneeId) {
      action = 'reassign';
    }

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'story',
      entityId: id,
      action,
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { code: updated.code, previousStatus: existing.status, ...updates },
      createdAt: new Date().toISOString(),
    });

    if (updates.assigneeId && updates.assigneeId !== existing.assigneeId && updates.assigneeId !== actor.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: updates.assigneeId,
        title: 'Story Reassigned',
        message: `Story "${updated.title}" (${updated.code}) was assigned to you.`,
        type: 'work_reassigned',
        isRead: false,
        link: `/PM-Portal/index.html#delivery?view=stories&id=${updated.id}`,
        createdAt: new Date().toISOString(),
      });
    }

    return updated;
  },

  async deleteStory(id: string, actor: SafeUser): Promise<boolean> {
    const existing = await StoryRepository.findById(id);
    if (!existing) return false;

    const deleted = await StoryRepository.delete(id);
    if (deleted) {
      if (existing.featureId) {
        await this.rollupFromStory(existing.featureId);
      } else if (existing.epicId) {
        await EpicRepository.recalculateProgress(existing.epicId);
      }
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'story',
        entityId: id,
        action: 'delete',
        actorId: actor.id,
        actorName: `${actor.firstName} ${actor.lastName}`,
        details: { code: existing.code, title: existing.title },
        createdAt: new Date().toISOString(),
      });
    }
    return deleted;
  },

  // ==========================================
  // TASKS
  // ==========================================
  async getAllTasks(filter?: any): Promise<Task[]> {
    return TaskRepository.findAll(filter);
  },

  async getTaskById(id: string): Promise<Task | null> {
    return TaskRepository.findById(id);
  },

  async createTask(data: Partial<Task>, actor: SafeUser): Promise<Task> {
    const id = data.id || `task_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const code = data.code || `TSK-${Math.floor(100 + Math.random() * 900)}`;

    const task: Task = {
      id,
      code,
      title: data.title || 'Untitled Task',
      description: data.description || '',
      storyId: data.storyId,
      featureId: data.featureId,
      epicId: data.epicId,
      projectId: data.projectId!,
      assigneeId: data.assigneeId,
      teamId: data.teamId,
      status: data.status || 'backlog',
      priority: data.priority || 'medium',
      dueDate: data.dueDate,
      estimatedEffortHrs: data.estimatedEffortHrs || 0,
      actualEffortHrs: data.actualEffortHrs || 0,
      startDate: data.startDate,
      completionDate: data.completionDate,
      sprint: data.sprint,
      progress: data.progress || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await TaskRepository.create(task);

    if (created.storyId) {
      await this.rollupFromTask(created.storyId);
    }

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'task',
      entityId: created.id,
      action: 'create',
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { code: created.code, title: created.title, projectId: created.projectId },
      createdAt: new Date().toISOString(),
    });

    if (created.assigneeId && created.assigneeId !== actor.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: created.assigneeId,
        title: 'Task Assigned',
        message: `You were assigned Task "${created.title}" (${created.code}).`,
        type: 'work_assigned',
        isRead: false,
        link: `/PM-Portal/index.html#delivery?view=tasks&id=${created.id}`,
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updateTask(id: string, updates: Partial<Task>, actor: SafeUser): Promise<Task | null> {
    const existing = await TaskRepository.findById(id);
    if (!existing) return null;

    const updated = await TaskRepository.update(id, updates);
    if (!updated) return null;

    if (updated.storyId) {
      await this.rollupFromTask(updated.storyId);
    }

    let action: ActivityAction = 'update';
    if (updates.status && updates.status !== existing.status) {
      action = updates.status === 'done' ? 'complete' : updates.status === 'blocked' ? 'block' : 'status_change';
    } else if (updates.assigneeId && updates.assigneeId !== existing.assigneeId) {
      action = 'reassign';
    }

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'task',
      entityId: id,
      action,
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { code: updated.code, previousStatus: existing.status, ...updates },
      createdAt: new Date().toISOString(),
    });

    if (updates.assigneeId && updates.assigneeId !== existing.assigneeId && updates.assigneeId !== actor.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: updates.assigneeId,
        title: 'Task Reassigned',
        message: `Task "${updated.title}" (${updated.code}) has been reassigned to you.`,
        type: 'work_reassigned',
        isRead: false,
        link: `/PM-Portal/index.html#delivery?view=tasks&id=${updated.id}`,
        createdAt: new Date().toISOString(),
      });
    }

    return updated;
  },

  async deleteTask(id: string, actor: SafeUser): Promise<boolean> {
    const existing = await TaskRepository.findById(id);
    if (!existing) return false;

    const deleted = await TaskRepository.delete(id);
    if (deleted) {
      if (existing.storyId) {
        await this.rollupFromTask(existing.storyId);
      }
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'task',
        entityId: id,
        action: 'delete',
        actorId: actor.id,
        actorName: `${actor.firstName} ${actor.lastName}`,
        details: { code: existing.code, title: existing.title },
        createdAt: new Date().toISOString(),
      });
    }
    return deleted;
  },

  // ==========================================
  // SUBTASKS
  // ==========================================
  async getAllSubtasks(filter?: any): Promise<Subtask[]> {
    return SubtaskRepository.findAll(filter);
  },

  async getSubtaskById(id: string): Promise<Subtask | null> {
    return SubtaskRepository.findById(id);
  },

  async createSubtask(data: Partial<Subtask>, actor: SafeUser): Promise<Subtask> {
    const id = data.id || `sub_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const subtask: Subtask = {
      id,
      taskId: data.taskId!,
      title: data.title || 'Untitled Subtask',
      assigneeId: data.assigneeId,
      status: data.status || 'backlog',
      priority: data.priority || 'medium',
      estimateHrs: data.estimateHrs || 0,
      dueDate: data.dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await SubtaskRepository.create(subtask);
    await this.rollupFromSubtask(created.taskId);

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'subtask',
      entityId: created.id,
      action: 'create',
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { taskId: created.taskId, title: created.title },
      createdAt: new Date().toISOString(),
    });

    if (created.assigneeId && created.assigneeId !== actor.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: created.assigneeId,
        title: 'Subtask Assigned',
        message: `You were assigned Subtask "${created.title}".`,
        type: 'work_assigned',
        isRead: false,
        link: `/PM-Portal/index.html#delivery?view=tasks&id=${created.taskId}`,
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updateSubtask(id: string, updates: Partial<Subtask>, actor: SafeUser): Promise<Subtask | null> {
    const existing = await SubtaskRepository.findById(id);
    if (!existing) return null;

    const updated = await SubtaskRepository.update(id, updates);
    if (!updated) return null;

    await this.rollupFromSubtask(updated.taskId);

    let action: ActivityAction = 'update';
    if (updates.status && updates.status !== existing.status) {
      action = updates.status === 'done' ? 'complete' : updates.status === 'blocked' ? 'block' : 'status_change';
    }

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'subtask',
      entityId: id,
      action,
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      details: { taskId: updated.taskId, previousStatus: existing.status, ...updates },
      createdAt: new Date().toISOString(),
    });

    return updated;
  },

  async deleteSubtask(id: string, actor: SafeUser): Promise<boolean> {
    const existing = await SubtaskRepository.findById(id);
    if (!existing) return false;

    const deleted = await SubtaskRepository.delete(id);
    if (deleted) {
      await this.rollupFromSubtask(existing.taskId);
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'subtask',
        entityId: id,
        action: 'delete',
        actorId: actor.id,
        actorName: `${actor.firstName} ${actor.lastName}`,
        details: { taskId: existing.taskId, title: existing.title },
        createdAt: new Date().toISOString(),
      });
    }
    return deleted;
  },

  // ==========================================
  // TRACEABILITY
  // ==========================================
  async getTrace(entityType: any, id: string) {
    return TraceabilityRepository.getTraceabilityChain(entityType, id);
  },

  // ==========================================
  // DELIVERY METRICS / SUMMARY
  // ==========================================
  async getDeliverySummary() {
    const [epics, features, stories, tasks, subtasks] = await Promise.all([
      EpicRepository.findAll({}),
      FeatureRepository.findAll({}),
      StoryRepository.findAll({}),
      TaskRepository.findAll({}),
      SubtaskRepository.findAll({}),
    ]);

    const totalWorkItems = epics.length + features.length + stories.length + tasks.length + subtasks.length;
    const completedWorkItems =
      epics.filter((e) => e.status === 'done').length +
      features.filter((f) => f.status === 'done').length +
      stories.filter((s) => s.status === 'done').length +
      tasks.filter((t) => t.status === 'done').length +
      subtasks.filter((s) => s.status === 'done').length;

    const blockedWorkItems =
      epics.filter((e) => e.status === 'blocked').length +
      features.filter((f) => f.status === 'blocked').length +
      stories.filter((s) => s.status === 'blocked').length +
      tasks.filter((t) => t.status === 'blocked').length +
      subtasks.filter((s) => s.status === 'blocked').length;

    const inProgressWorkItems =
      epics.filter((e) => e.status === 'in-progress' || e.status === 'testing' || e.status === 'in-review').length +
      features.filter((f) => f.status === 'in-progress' || f.status === 'testing' || f.status === 'in-review').length +
      stories.filter((s) => s.status === 'in-progress' || s.status === 'testing' || s.status === 'in-review').length +
      tasks.filter((t) => t.status === 'in-progress' || t.status === 'testing' || t.status === 'in-review').length +
      subtasks.filter((s) => s.status === 'in-progress').length;

    const overallProgress = totalWorkItems > 0 ? Math.round((completedWorkItems / totalWorkItems) * 100) : 0;

    return {
      totals: {
        epics: epics.length,
        features: features.length,
        stories: stories.length,
        tasks: tasks.length,
        subtasks: subtasks.length,
        allItems: totalWorkItems,
      },
      statusDistribution: {
        done: completedWorkItems,
        inProgress: inProgressWorkItems,
        blocked: blockedWorkItems,
        backlog: totalWorkItems - completedWorkItems - inProgressWorkItems - blockedWorkItems,
      },
      overallProgress,
      activeSprints: Array.from(
        new Set(
          [...stories.map((s) => s.sprint), ...tasks.map((t) => t.sprint)].filter(Boolean)
        )
      ),
    };
  },
};
