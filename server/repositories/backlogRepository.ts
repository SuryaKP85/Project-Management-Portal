import { BacklogItem, BacklogItemType } from '../models/types';
import { StoryRepository } from './storyRepository';
import { TaskRepository } from './taskRepository';
import { FeatureRepository } from './featureRepository';
import { EpicRepository } from './epicRepository';
import { SprintRepository } from './sprintRepository';

export const BacklogRepository = {
  async getBacklogItems(filter?: {
    projectId?: string;
    type?: string;
    status?: string;
    priority?: string;
    assigneeId?: string;
    search?: string;
    includeSprintItems?: boolean;
  }): Promise<BacklogItem[]> {
    const items: BacklogItem[] = [];
    const includeSprint = filter?.includeSprintItems ?? false;

    // 1. Stories (Primary Planning Unit)
    if (!filter?.type || filter.type === 'story') {
      const stories = await StoryRepository.findAll({
        projectId: filter?.projectId,
        status: filter?.status,
        priority: filter?.priority,
        assigneeId: filter?.assigneeId,
      });

      for (const s of stories) {
        // If not including sprint items, filter out stories already assigned to an active sprint
        if (!includeSprint && s.sprintId && s.status !== 'backlog') {
          continue;
        }

        items.push({
          id: s.id,
          type: 'story',
          code: s.code,
          title: s.title,
          description: s.description,
          status: s.status,
          priority: s.priority,
          backlogOrder: s.backlogOrder ?? 100,
          storyPoints: s.storyPoints,
          projectId: s.projectId,
          projectName: s.projectName,
          productId: s.productId,
          productName: s.productName,
          epicId: s.epicId,
          epicName: s.epicName,
          featureId: s.featureId,
          featureName: s.featureName,
          assigneeId: s.assigneeId,
          assigneeName: s.assigneeName,
          sprintId: s.sprintId,
          sprintName: s.sprint,
          targetRelease: s.targetRelease,
          dueDate: s.dueDate,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        });
      }
    }

    // 2. Tasks (standalone or backlog tasks)
    if (!filter?.type || filter.type === 'task') {
      const tasks = await TaskRepository.findAll({
        projectId: filter?.projectId,
        status: filter?.status,
        priority: filter?.priority,
        assigneeId: filter?.assigneeId,
      });

      for (const t of tasks) {
        if (!includeSprint && t.sprintId && t.status !== 'backlog') {
          continue;
        }

        items.push({
          id: t.id,
          type: 'task',
          code: t.code,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          backlogOrder: t.backlogOrder ?? 200,
          estimatedEffortHrs: t.estimatedEffortHrs,
          actualEffortHrs: t.actualEffortHrs,
          projectId: t.projectId,
          projectName: t.projectName,
          epicId: t.epicId,
          epicName: t.epicName,
          featureId: t.featureId,
          featureName: t.featureName,
          assigneeId: t.assigneeId,
          assigneeName: t.assigneeName,
          sprintId: t.sprintId,
          sprintName: t.sprint,
          dueDate: t.dueDate,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        });
      }
    }

    // 3. Features
    if (filter?.type === 'feature') {
      const features = await FeatureRepository.findAll({
        projectId: filter?.projectId,
        status: filter?.status,
        priority: filter?.priority,
      });

      for (const f of features) {
        items.push({
          id: f.id,
          type: 'feature',
          code: f.code,
          title: f.name,
          description: f.description,
          status: f.status,
          priority: f.priority,
          backlogOrder: f.backlogOrder ?? 300,
          projectId: f.projectId,
          projectName: f.projectName,
          productId: f.productId,
          productName: f.productName,
          epicId: f.epicId,
          epicName: f.epicName,
          targetRelease: f.targetRelease,
          dueDate: f.targetDate,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        });
      }
    }

    // 4. Epics
    if (filter?.type === 'epic') {
      const epics = await EpicRepository.findAll({
        projectId: filter?.projectId,
        status: filter?.status,
        priority: filter?.priority,
      });

      for (const e of epics) {
        items.push({
          id: e.id,
          type: 'epic',
          code: e.code,
          title: e.name,
          description: e.description,
          status: e.status,
          priority: e.priority,
          backlogOrder: e.backlogOrder ?? 400,
          projectId: e.projectId,
          projectName: e.projectName,
          productId: e.productId,
          productName: e.productName,
          dueDate: e.targetDate,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        });
      }
    }

    // Search query filter
    let results = items;
    if (filter?.search) {
      const sLower = filter.search.toLowerCase();
      results = results.filter(
        (i) =>
          i.title.toLowerCase().includes(sLower) ||
          i.code.toLowerCase().includes(sLower) ||
          (i.description && i.description.toLowerCase().includes(sLower)) ||
          (i.assigneeName && i.assigneeName.toLowerCase().includes(sLower))
      );
    }

    // Sort by backlogOrder ASC, then createdAt ASC
    return results.sort((a, b) => {
      if (a.backlogOrder !== b.backlogOrder) {
        return a.backlogOrder - b.backlogOrder;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  },

  async reorder(items: Array<{ id: string; type: BacklogItemType; backlogOrder: number }>): Promise<boolean> {
    for (const item of items) {
      if (item.type === 'story') {
        await StoryRepository.update(item.id, { backlogOrder: item.backlogOrder });
      } else if (item.type === 'task') {
        await TaskRepository.update(item.id, { backlogOrder: item.backlogOrder });
      } else if (item.type === 'feature') {
        await FeatureRepository.update(item.id, { backlogOrder: item.backlogOrder });
      } else if (item.type === 'epic') {
        await EpicRepository.update(item.id, { backlogOrder: item.backlogOrder });
      }
    }
    return true;
  },

  async assignToSprint(
    itemId: string,
    itemType: BacklogItemType,
    sprintId: string | null
  ): Promise<{ success: boolean; item?: any }> {
    let sprintName: string | undefined = undefined;
    if (sprintId) {
      const sprint = await SprintRepository.findById(sprintId);
      if (!sprint) throw new Error(`Sprint with ID ${sprintId} not found`);
      sprintName = sprint.name;
    }

    if (itemType === 'story') {
      const updated = await StoryRepository.update(itemId, {
        sprintId: sprintId || undefined,
        sprint: sprintName || undefined,
        status: sprintId ? 'ready' : 'backlog',
      });
      return { success: !!updated, item: updated };
    } else if (itemType === 'task') {
      const updated = await TaskRepository.update(itemId, {
        sprintId: sprintId || undefined,
        sprint: sprintName || undefined,
        status: sprintId ? 'ready' : 'backlog',
      });
      return { success: !!updated, item: updated };
    }

    return { success: false };
  },
};
