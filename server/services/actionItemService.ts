import { ActionItem, ActionItemPriority, ActionItemStatus, Project } from '../models/types';
import { ActionItemRepository } from '../repositories/actionItemRepository';
import { MeetingRepository } from '../repositories/meetingRepository';
import { WaitingForRepository } from '../repositories/waitingForRepository';
import { FollowUpRepository } from '../repositories/followUpRepository';
import {
  FollowThroughActor, ProjectAccessService, assertCanChangeStatus, assertCanDelete, assertCanWrite,
  assertSameProject, cleanEnum, cleanOptionalDate, cleanOptionalText, cleanRequiredText, listingScope,
  logFollowThroughActivity, notAvailable, notifyUser, paginate, parsePaging, queryFlag, queryText,
  requireProjectUser, validationError,
} from './followThroughSupport';

/**
 * Sprint 14 — Action Items: commitments captured in (or outside) meetings.
 * They are follow-through records, not delivery Tasks, and never appear in
 * the Epic → Feature → Story → Task hierarchy.
 */

export const ACTION_ITEM_STATUSES: readonly ActionItemStatus[] = ['Open', 'In Progress', 'Blocked', 'Completed', 'Cancelled'];
export const ACTION_ITEM_PRIORITIES: readonly ActionItemPriority[] = ['Urgent', 'High', 'Medium', 'Low'];

/** A meeting link must name a meeting in the same project (missing and foreign look the same). */
async function cleanMeetingId(value: unknown, projectId: string): Promise<string | undefined> {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw validationError("Field 'meetingId' must be a string.");
  const meeting = await MeetingRepository.findById(value);
  if (!meeting || meeting.projectId !== projectId) throw validationError('The meeting was not found in this project.');
  return meeting.id;
}

async function loadAccessible(actor: FollowThroughActor, id: string): Promise<{ item: ActionItem; project: Project }> {
  const item = await ActionItemRepository.findById(id);
  if (!item) throw notAvailable('Action item');
  const project = await ProjectAccessService.resolveAccessibleProject(actor, item.projectId);
  if (!project) throw notAvailable('Action item');
  return { item, project };
}

/** completedAt follows the status: set on completion, cleared when reopened. */
function completionFor(status: ActionItemStatus, current?: ActionItem): string | undefined {
  if (status !== 'Completed') return undefined;
  return current?.status === 'Completed' && current.completedAt ? current.completedAt : new Date().toISOString();
}

async function afterStatusChange(actor: FollowThroughActor, before: ActionItem, after: ActionItem): Promise<void> {
  const action = after.status === 'Completed' ? 'complete' : after.status === 'Blocked' ? 'block' : 'status_change';
  await logFollowThroughActivity(actor, 'action_item', after.id, action, {
    projectId: after.projectId,
    from: before.status,
    to: after.status,
  });
  // The person who raised the item hears about the two outcomes that need them.
  if (after.status === 'Blocked') {
    await notifyUser(actor, after.createdBy, 'work_blocked', 'Action item blocked',
      `"${after.title}" is blocked and may need your help.`, 'action-items');
  } else if (after.status === 'Completed') {
    await notifyUser(actor, after.createdBy, 'work_completed', 'Action item completed',
      `"${after.title}" has been completed.`, 'action-items');
  }
}

export const ActionItemService = {
  async list(actor: FollowThroughActor, params: Record<string, unknown>) {
    const projectIds = await listingScope(actor, params.projectId);
    const all = await ActionItemRepository.findAll({
      projectIds,
      meetingId: queryText(params.meetingId),
      ownerId: queryText(params.ownerId),
      status: queryText(params.status),
      priority: queryText(params.priority),
      overdue: queryFlag(params.overdue),
      search: queryText(params.search),
    });
    const { page, limit } = parsePaging(params);
    const result = paginate(all, page, limit);
    return { actionItems: result.items, total: result.total, page: result.page, limit: result.limit };
  },

  async get(actor: FollowThroughActor, id: string): Promise<ActionItem> {
    return (await loadAccessible(actor, id)).item;
  },

  async create(actor: FollowThroughActor, body: Record<string, unknown>): Promise<ActionItem> {
    assertCanWrite(actor);
    const project = await ProjectAccessService.resolveAccessibleProject(actor, body.projectId);
    if (!project) throw notAvailable('Project');

    const ownerId = body.ownerId === undefined || body.ownerId === '' ? actor.userId : body.ownerId;
    await requireProjectUser(ownerId, project, 'ownerId');
    const status = cleanEnum(body.status, ACTION_ITEM_STATUSES, 'status', 'Open');

    const item = await ActionItemRepository.create({
      projectId: project.id,
      meetingId: await cleanMeetingId(body.meetingId, project.id),
      title: cleanRequiredText(body.title, 'title', 255),
      description: cleanOptionalText(body.description, 'description', 10000),
      ownerId: ownerId as string,
      dueDate: cleanOptionalDate(body.dueDate, 'dueDate'),
      status,
      priority: cleanEnum(body.priority, ACTION_ITEM_PRIORITIES, 'priority', 'Medium'),
      completedAt: completionFor(status),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    await logFollowThroughActivity(actor, 'action_item', item.id, 'create', {
      projectId: item.projectId,
      meetingId: item.meetingId,
      title: item.title,
      ownerId: item.ownerId,
      status: item.status,
    });
    await notifyUser(actor, item.ownerId, 'work_assigned', 'Action item assigned to you',
      `You own "${item.title}"${item.dueDate ? `, due ${item.dueDate}` : ''}.`, 'action-items');
    return item;
  },

  async update(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<ActionItem> {
    assertCanWrite(actor);
    const { item: current, project } = await loadAccessible(actor, id);
    assertSameProject(body, current.projectId);

    const updates: Partial<ActionItem> = { updatedBy: actor.userId };
    if (body.title !== undefined) updates.title = cleanRequiredText(body.title, 'title', 255);
    if (body.description !== undefined) updates.description = cleanOptionalText(body.description, 'description', 10000);
    if (body.dueDate !== undefined) updates.dueDate = cleanOptionalDate(body.dueDate, 'dueDate');
    if (body.priority !== undefined) updates.priority = cleanEnum(body.priority, ACTION_ITEM_PRIORITIES, 'priority');
    if (body.meetingId !== undefined) updates.meetingId = await cleanMeetingId(body.meetingId, current.projectId);
    if (body.ownerId !== undefined) {
      await requireProjectUser(body.ownerId, project, 'ownerId');
      updates.ownerId = body.ownerId as string;
    }
    if (body.status !== undefined) {
      updates.status = cleanEnum(body.status, ACTION_ITEM_STATUSES, 'status');
      updates.completedAt = completionFor(updates.status, current);
    }

    const updated = (await ActionItemRepository.update(id, updates)) as ActionItem;

    if (updates.ownerId !== undefined && updates.ownerId !== current.ownerId) {
      await logFollowThroughActivity(actor, 'action_item', id, 'reassign', {
        projectId: updated.projectId,
        from: current.ownerId,
        to: updated.ownerId,
      });
      await notifyUser(actor, updated.ownerId, 'work_reassigned', 'Action item assigned to you',
        `You now own "${updated.title}"${updated.dueDate ? `, due ${updated.dueDate}` : ''}.`, 'action-items');
    }
    if (updates.status !== undefined && updates.status !== current.status) {
      await afterStatusChange(actor, current, updated);
    }
    const changed = (['title', 'description', 'dueDate', 'priority', 'meetingId'] as const).filter(
      (k) => k in updates && updated[k] !== current[k]
    );
    if (changed.length > 0) {
      await logFollowThroughActivity(actor, 'action_item', id, 'update', { projectId: updated.projectId, fields: changed });
    }
    return updated;
  },

  /** Status only: open to the item's owner as well as the write roles. */
  async updateStatus(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<ActionItem> {
    const { item: current } = await loadAccessible(actor, id);
    assertCanChangeStatus(actor, current.ownerId);
    const status = cleanEnum(body.status, ACTION_ITEM_STATUSES, 'status');
    if (status === current.status) return current;
    const updated = (await ActionItemRepository.update(id, {
      status,
      completedAt: completionFor(status, current),
      updatedBy: actor.userId,
    })) as ActionItem;
    await afterStatusChange(actor, current, updated);
    return updated;
  },

  async remove(actor: FollowThroughActor, id: string): Promise<void> {
    assertCanDelete(actor);
    const { item } = await loadAccessible(actor, id);
    await WaitingForRepository.clearRelated('action_item', id);
    await FollowUpRepository.clearRelated('action_item', id);
    await ActionItemRepository.delete(id);
    await logFollowThroughActivity(actor, 'action_item', id, 'delete', { projectId: item.projectId, title: item.title });
  },
};
