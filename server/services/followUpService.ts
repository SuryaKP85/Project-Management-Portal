import { FollowThroughRelatedType, FollowUp, FollowUpStatus, Project } from '../models/types';
import { FollowUpRepository } from '../repositories/followUpRepository';
import {
  FollowThroughActor, ProjectAccessService, assertProjectWrite, assertCanChangeStatus, assertCanDelete, assertCanWrite,
  assertSameProject, cleanEnum, cleanOptionalDate, cleanOptionalText, cleanRelated, cleanRequiredText,
  listingScope, logFollowThroughActivity, notAvailable, notifyUser, paginate, parsePaging, queryFlag, queryText,
  requireProjectUser,
} from './followThroughSupport';

/**
 * Sprint 14 — Follow-ups: the next follow-up a PM owes on a project, about a
 * person, a meeting, an action item, a waiting-for item, an issue, a risk or a
 * dependency. The optional reference is one validated (type, id) pair.
 */

export const FOLLOW_UP_STATUSES: readonly FollowUpStatus[] = ['Open', 'Completed', 'Cancelled'];
export const FOLLOW_UP_RELATED_TYPES: readonly FollowThroughRelatedType[] = ['meeting', 'action_item', 'waiting_for', 'issue', 'risk', 'dependency'];

async function loadAccessible(actor: FollowThroughActor, id: string): Promise<{ item: FollowUp; project: Project }> {
  const item = await FollowUpRepository.findById(id);
  if (!item) throw notAvailable('Follow-up');
  const project = await ProjectAccessService.resolveAccessibleProject(actor, item.projectId);
  if (!project) throw notAvailable('Follow-up');
  return { item, project };
}

function completionFor(status: FollowUpStatus, current?: FollowUp): string | undefined {
  if (status !== 'Completed') return undefined;
  return current?.status === 'Completed' && current.completedAt ? current.completedAt : new Date().toISOString();
}

async function afterStatusChange(actor: FollowThroughActor, before: FollowUp, after: FollowUp): Promise<void> {
  await logFollowThroughActivity(actor, 'follow_up', after.id, after.status === 'Completed' ? 'complete' : 'status_change', {
    projectId: after.projectId,
    from: before.status,
    to: after.status,
  });
  if (after.status === 'Completed') {
    await notifyUser(actor, after.createdBy, 'work_completed', 'Follow-up completed',
      `"${after.title}" has been completed.`, 'follow-ups');
  }
}

export const FollowUpService = {
  async list(actor: FollowThroughActor, params: Record<string, unknown>) {
    const projectIds = await listingScope(actor, params.projectId);
    const all = await FollowUpRepository.findAll({
      projectIds,
      ownerId: queryText(params.ownerId),
      status: queryText(params.status),
      relatedType: queryText(params.relatedType),
      relatedId: queryText(params.relatedId),
      overdue: queryFlag(params.overdue),
      search: queryText(params.search),
    });
    const { page, limit } = parsePaging(params);
    const result = paginate(all, page, limit);
    return { followUps: result.items, total: result.total, page: result.page, limit: result.limit };
  },

  async get(actor: FollowThroughActor, id: string): Promise<FollowUp> {
    return (await loadAccessible(actor, id)).item;
  },

  async create(actor: FollowThroughActor, body: Record<string, unknown>): Promise<FollowUp> {
    assertCanWrite(actor);
    const project = await ProjectAccessService.resolveAccessibleProject(actor, body.projectId);
    if (!project) throw notAvailable('Project');
    assertProjectWrite(actor, project); // Sprint 25

    const ownerId = body.ownerId === undefined || body.ownerId === '' ? actor.userId : body.ownerId;
    await requireProjectUser(ownerId, project, 'ownerId');
    const status = cleanEnum(body.status, FOLLOW_UP_STATUSES, 'status', 'Open');

    const item = await FollowUpRepository.create({
      projectId: project.id,
      title: cleanRequiredText(body.title, 'title', 255),
      description: cleanOptionalText(body.description, 'description', 10000),
      ownerId: ownerId as string,
      dueDate: cleanOptionalDate(body.dueDate, 'dueDate'),
      status,
      ...(await cleanRelated(body.relatedType, body.relatedId, FOLLOW_UP_RELATED_TYPES, project.id)),
      completedAt: completionFor(status),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    await logFollowThroughActivity(actor, 'follow_up', item.id, 'create', {
      projectId: item.projectId,
      title: item.title,
      ownerId: item.ownerId,
      relatedType: item.relatedType,
      relatedId: item.relatedId,
    });
    await notifyUser(actor, item.ownerId, 'work_assigned', 'Follow-up assigned to you',
      `You own the follow-up "${item.title}"${item.dueDate ? `, due ${item.dueDate}` : ''}.`, 'follow-ups');
    return item;
  },

  async update(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<FollowUp> {
    assertCanWrite(actor);
    const { item: current, project } = await loadAccessible(actor, id);
    assertProjectWrite(actor, project); // Sprint 25
    assertSameProject(body, current.projectId);

    const updates: Partial<FollowUp> = { updatedBy: actor.userId };
    if (body.title !== undefined) updates.title = cleanRequiredText(body.title, 'title', 255);
    if (body.description !== undefined) updates.description = cleanOptionalText(body.description, 'description', 10000);
    if (body.dueDate !== undefined) updates.dueDate = cleanOptionalDate(body.dueDate, 'dueDate');
    if (body.ownerId !== undefined) {
      await requireProjectUser(body.ownerId, project, 'ownerId');
      updates.ownerId = body.ownerId as string;
    }
    if (body.relatedType !== undefined || body.relatedId !== undefined) {
      Object.assign(updates, await cleanRelated(body.relatedType, body.relatedId, FOLLOW_UP_RELATED_TYPES, current.projectId));
    }
    if (body.status !== undefined) {
      updates.status = cleanEnum(body.status, FOLLOW_UP_STATUSES, 'status');
      updates.completedAt = completionFor(updates.status, current);
    }

    const updated = (await FollowUpRepository.update(id, updates)) as FollowUp;

    if (updates.ownerId !== undefined && updates.ownerId !== current.ownerId) {
      await logFollowThroughActivity(actor, 'follow_up', id, 'reassign', { projectId: updated.projectId, from: current.ownerId, to: updated.ownerId });
      await notifyUser(actor, updated.ownerId, 'work_reassigned', 'Follow-up assigned to you',
        `You now own the follow-up "${updated.title}".`, 'follow-ups');
    }
    if (updates.status !== undefined && updates.status !== current.status) {
      await afterStatusChange(actor, current, updated);
    }
    const changed = (['title', 'description', 'dueDate', 'relatedType', 'relatedId'] as const).filter(
      (k) => k in updates && updated[k] !== current[k]
    );
    if (changed.length > 0) {
      await logFollowThroughActivity(actor, 'follow_up', id, 'update', { projectId: updated.projectId, fields: changed });
    }
    return updated;
  },

  /** Status only (complete, cancel, reopen): open to the owner as well as the write roles. */
  async updateStatus(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<FollowUp> {
    const { item: current } = await loadAccessible(actor, id);
    assertCanChangeStatus(actor, current.ownerId);
    const status = cleanEnum(body.status, FOLLOW_UP_STATUSES, 'status');
    if (status === current.status) return current;
    const updated = (await FollowUpRepository.update(id, {
      status,
      completedAt: completionFor(status, current),
      updatedBy: actor.userId,
    })) as FollowUp;
    await afterStatusChange(actor, current, updated);
    return updated;
  },

  async remove(actor: FollowThroughActor, id: string): Promise<void> {
    assertCanDelete(actor);
    const { item, project } = await loadAccessible(actor, id);
    assertProjectWrite(actor, project); // Sprint 25
    await FollowUpRepository.delete(id);
    await logFollowThroughActivity(actor, 'follow_up', id, 'delete', { projectId: item.projectId, title: item.title });
  },
};
