import { FollowThroughRelatedType, Project, WaitingForItem, WaitingForStatus } from '../models/types';
import { WaitingForRepository } from '../repositories/waitingForRepository';
import { FollowUpRepository } from '../repositories/followUpRepository';
import { TeamRepository } from '../repositories/teamRepository';
import {
  FollowThroughActor, ProjectAccessService, assertCanChangeStatus, assertCanDelete, assertCanWrite,
  assertSameProject, cleanEnum, cleanOptionalDate, cleanOptionalText, cleanRelated, cleanRequiredText,
  listingScope, logFollowThroughActivity, notAvailable, notifyUser, paginate, parsePaging, queryFlag, queryText,
  requireProjectUser, validationError,
} from './followThroughSupport';

/**
 * Sprint 14 — Waiting For: a project is blocked until a person, a team or an
 * external party responds, delivers, approves or acts. A first-class record,
 * owned by the person tracking it.
 */

export const WAITING_FOR_STATUSES: readonly WaitingForStatus[] = ['Waiting', 'Follow-up Needed', 'Resolved', 'Cancelled'];
export const WAITING_FOR_RELATED_TYPES: readonly FollowThroughRelatedType[] = ['meeting', 'action_item', 'issue', 'risk', 'dependency'];

async function cleanTeamId(value: unknown): Promise<string | undefined> {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw validationError("Field 'waitingOnTeamId' must be a string.");
  const team = await TeamRepository.findById(value);
  if (!team) throw validationError("Field 'waitingOnTeamId' does not match a team.");
  return team.id;
}

async function cleanWaitingOnUser(value: unknown, project: Project): Promise<string | undefined> {
  if (value === undefined || value === null || value === '') return undefined;
  return (await requireProjectUser(value, project, 'waitingOnUserId')).id;
}

async function loadAccessible(actor: FollowThroughActor, id: string): Promise<{ item: WaitingForItem; project: Project }> {
  const item = await WaitingForRepository.findById(id);
  if (!item) throw notAvailable('Waiting-for item');
  const project = await ProjectAccessService.resolveAccessibleProject(actor, item.projectId);
  if (!project) throw notAvailable('Waiting-for item');
  return { item, project };
}

function resolutionFor(status: WaitingForStatus, current?: WaitingForItem): string | undefined {
  if (status !== 'Resolved') return undefined;
  return current?.status === 'Resolved' && current.resolvedAt ? current.resolvedAt : new Date().toISOString();
}

function assertSomeoneToWaitOn(item: Pick<WaitingForItem, 'waitingOnUserId' | 'waitingOnTeamId' | 'waitingOnName'>): void {
  if (!item.waitingOnUserId && !item.waitingOnTeamId && !item.waitingOnName) {
    throw validationError('Say who you are waiting on: a user, a team or a name.');
  }
}

async function afterStatusChange(actor: FollowThroughActor, before: WaitingForItem, after: WaitingForItem): Promise<void> {
  await logFollowThroughActivity(actor, 'waiting_for', after.id, after.status === 'Resolved' ? 'resolve' : 'status_change', {
    projectId: after.projectId,
    from: before.status,
    to: after.status,
  });
  if (after.status === 'Resolved') {
    await notifyUser(actor, after.ownerId, 'work_completed', 'Waiting-for item resolved',
      `"${after.title}" has been resolved.`, 'waiting-for');
  }
}

export const WaitingForService = {
  async list(actor: FollowThroughActor, params: Record<string, unknown>) {
    const projectIds = await listingScope(actor, params.projectId);
    const all = await WaitingForRepository.findAll({
      projectIds,
      ownerId: queryText(params.ownerId),
      waitingOnUserId: queryText(params.waitingOnUserId),
      status: queryText(params.status),
      open: queryFlag(params.open),
      relatedType: queryText(params.relatedType),
      relatedId: queryText(params.relatedId),
      search: queryText(params.search),
    });
    const { page, limit } = parsePaging(params);
    const result = paginate(all, page, limit);
    return { waitingFor: result.items, total: result.total, page: result.page, limit: result.limit };
  },

  async get(actor: FollowThroughActor, id: string): Promise<WaitingForItem> {
    return (await loadAccessible(actor, id)).item;
  },

  async create(actor: FollowThroughActor, body: Record<string, unknown>): Promise<WaitingForItem> {
    assertCanWrite(actor);
    const project = await ProjectAccessService.resolveAccessibleProject(actor, body.projectId);
    if (!project) throw notAvailable('Project');

    const ownerId = body.ownerId === undefined || body.ownerId === '' ? actor.userId : body.ownerId;
    await requireProjectUser(ownerId, project, 'ownerId');
    const status = cleanEnum(body.status, WAITING_FOR_STATUSES, 'status', 'Waiting');
    const waitingOn = {
      waitingOnUserId: await cleanWaitingOnUser(body.waitingOnUserId, project),
      waitingOnTeamId: await cleanTeamId(body.waitingOnTeamId),
      waitingOnName: cleanOptionalText(body.waitingOnName, 'waitingOnName', 255),
    };
    assertSomeoneToWaitOn(waitingOn);

    const item = await WaitingForRepository.create({
      projectId: project.id,
      title: cleanRequiredText(body.title, 'title', 255),
      description: cleanOptionalText(body.description, 'description', 10000),
      ownerId: ownerId as string,
      ...waitingOn,
      expectedDate: cleanOptionalDate(body.expectedDate, 'expectedDate'),
      status,
      ...(await cleanRelated(body.relatedType, body.relatedId, WAITING_FOR_RELATED_TYPES, project.id)),
      resolvedAt: resolutionFor(status),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    await logFollowThroughActivity(actor, 'waiting_for', item.id, 'create', {
      projectId: item.projectId,
      title: item.title,
      ownerId: item.ownerId,
      waitingOnUserId: item.waitingOnUserId,
      waitingOnTeamId: item.waitingOnTeamId,
      status: item.status,
    });
    await notifyUser(actor, item.ownerId, 'work_assigned', 'Waiting-for item assigned to you',
      `You are tracking "${item.title}".`, 'waiting-for');
    await notifyUser(actor, item.waitingOnUserId, 'approval_request', 'A project is waiting on you',
      `"${item.title}" is waiting on you${item.expectedDate ? ` (expected ${item.expectedDate})` : ''}.`, 'waiting-for');
    return item;
  },

  async update(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<WaitingForItem> {
    assertCanWrite(actor);
    const { item: current, project } = await loadAccessible(actor, id);
    assertSameProject(body, current.projectId);

    const updates: Partial<WaitingForItem> = { updatedBy: actor.userId };
    if (body.title !== undefined) updates.title = cleanRequiredText(body.title, 'title', 255);
    if (body.description !== undefined) updates.description = cleanOptionalText(body.description, 'description', 10000);
    if (body.expectedDate !== undefined) updates.expectedDate = cleanOptionalDate(body.expectedDate, 'expectedDate');
    if (body.ownerId !== undefined) {
      await requireProjectUser(body.ownerId, project, 'ownerId');
      updates.ownerId = body.ownerId as string;
    }
    if (body.waitingOnUserId !== undefined) updates.waitingOnUserId = await cleanWaitingOnUser(body.waitingOnUserId, project);
    if (body.waitingOnTeamId !== undefined) updates.waitingOnTeamId = await cleanTeamId(body.waitingOnTeamId);
    if (body.waitingOnName !== undefined) updates.waitingOnName = cleanOptionalText(body.waitingOnName, 'waitingOnName', 255);
    if (body.relatedType !== undefined || body.relatedId !== undefined) {
      Object.assign(updates, await cleanRelated(body.relatedType, body.relatedId, WAITING_FOR_RELATED_TYPES, current.projectId));
    }
    if (body.status !== undefined) {
      updates.status = cleanEnum(body.status, WAITING_FOR_STATUSES, 'status');
      updates.resolvedAt = resolutionFor(updates.status, current);
    }
    assertSomeoneToWaitOn({ ...current, ...updates });

    const updated = (await WaitingForRepository.update(id, updates)) as WaitingForItem;

    if (updates.ownerId !== undefined && updates.ownerId !== current.ownerId) {
      await logFollowThroughActivity(actor, 'waiting_for', id, 'reassign', { projectId: updated.projectId, from: current.ownerId, to: updated.ownerId });
      await notifyUser(actor, updated.ownerId, 'work_reassigned', 'Waiting-for item assigned to you',
        `You are now tracking "${updated.title}".`, 'waiting-for');
    }
    if (updates.waitingOnUserId !== undefined && updates.waitingOnUserId !== current.waitingOnUserId) {
      await notifyUser(actor, updated.waitingOnUserId, 'approval_request', 'A project is waiting on you',
        `"${updated.title}" is waiting on you${updated.expectedDate ? ` (expected ${updated.expectedDate})` : ''}.`, 'waiting-for');
    }
    if (updates.status !== undefined && updates.status !== current.status) {
      await afterStatusChange(actor, current, updated);
    }
    const changed = (['title', 'description', 'expectedDate', 'waitingOnUserId', 'waitingOnTeamId', 'waitingOnName', 'relatedType', 'relatedId'] as const).filter(
      (k) => k in updates && updated[k] !== current[k]
    );
    if (changed.length > 0) {
      await logFollowThroughActivity(actor, 'waiting_for', id, 'update', { projectId: updated.projectId, fields: changed });
    }
    return updated;
  },

  /** Status only (resolve, needs follow-up, cancel): open to the owner as well as the write roles. */
  async updateStatus(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<WaitingForItem> {
    const { item: current } = await loadAccessible(actor, id);
    assertCanChangeStatus(actor, current.ownerId);
    const status = cleanEnum(body.status, WAITING_FOR_STATUSES, 'status');
    if (status === current.status) return current;
    const updated = (await WaitingForRepository.update(id, {
      status,
      resolvedAt: resolutionFor(status, current),
      updatedBy: actor.userId,
    })) as WaitingForItem;
    await afterStatusChange(actor, current, updated);
    return updated;
  },

  async remove(actor: FollowThroughActor, id: string): Promise<void> {
    assertCanDelete(actor);
    const { item } = await loadAccessible(actor, id);
    await FollowUpRepository.clearRelated('waiting_for', id);
    await WaitingForRepository.delete(id);
    await logFollowThroughActivity(actor, 'waiting_for', id, 'delete', { projectId: item.projectId, title: item.title });
  },
};
