import { DeliveryStatus, Subtask, Task, UserStory, Feature, Epic } from '../models/types';

/**
 * Enterprise Delivery Progress Calculation Engine
 * 
 * Rules:
 * 1. Subtasks -> Task:
 *    - If task has subtasks: progress = (completed subtasks / total subtasks) * 100
 *    - If task has no subtasks:
 *      'done' -> 100%
 *      'testing' -> 80%
 *      'in-review' -> 70%
 *      'in-progress' -> 50%
 *      'ready' -> 10%
 *      'blocked' -> preserves current or 25%
 *      'backlog' | 'planned' | 'cancelled' -> 0%
 * 
 * 2. Tasks -> Story:
 *    - If story is 'done' -> 100%
 *    - If story has child tasks: progress = average of child tasks' progress
 *    - If story has no child tasks: status-based baseline
 * 
 * 3. Stories -> Feature:
 *    - If feature is 'done' -> 100%
 *    - If feature has child stories: weighted by story points (or simple average if points == 0)
 *    - If feature has no child stories: status-based baseline
 * 
 * 4. Features -> Epic:
 *    - If epic is 'done' -> 100%
 *    - If epic has child features: average of child features' progress
 *    - If epic has no child features: status-based baseline
 */

export function calculateStatusBaseline(status: DeliveryStatus): number {
  switch (status) {
    case 'done':
      return 100;
    case 'testing':
      return 80;
    case 'in-review':
      return 70;
    case 'in-progress':
      return 50;
    case 'ready':
      return 10;
    case 'blocked':
      return 25;
    case 'backlog':
    case 'planned':
    case 'cancelled':
    default:
      return 0;
  }
}

export function calculateTaskProgress(taskStatus: DeliveryStatus, subtasks: Subtask[]): number {
  if (taskStatus === 'done') return 100;
  if (!subtasks || subtasks.length === 0) {
    return calculateStatusBaseline(taskStatus);
  }
  const completed = subtasks.filter((s) => s.status === 'done').length;
  return Math.round((completed / subtasks.length) * 100);
}

export function calculateStoryProgress(storyStatus: DeliveryStatus, tasks: Task[]): number {
  if (storyStatus === 'done') return 100;
  if (!tasks || tasks.length === 0) {
    return calculateStatusBaseline(storyStatus);
  }
  const totalProgress = tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
  return Math.round(totalProgress / tasks.length);
}

export function calculateFeatureProgress(featureStatus: DeliveryStatus, stories: UserStory[]): number {
  if (featureStatus === 'done') return 100;
  if (!stories || stories.length === 0) {
    return calculateStatusBaseline(featureStatus);
  }
  const totalPoints = stories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
  if (totalPoints > 0) {
    const weighted = stories.reduce((sum, s) => sum + (s.progress || 0) * (s.storyPoints || 1), 0);
    return Math.round(weighted / totalPoints);
  }
  const totalProgress = stories.reduce((sum, s) => sum + (s.progress || 0), 0);
  return Math.round(totalProgress / stories.length);
}

export function calculateEpicProgress(epicStatus: DeliveryStatus, features: Feature[]): number {
  if (epicStatus === 'done') return 100;
  if (!features || features.length === 0) {
    return calculateStatusBaseline(epicStatus);
  }
  const totalProgress = features.reduce((sum, f) => sum + (f.progress || 0), 0);
  return Math.round(totalProgress / features.length);
}
