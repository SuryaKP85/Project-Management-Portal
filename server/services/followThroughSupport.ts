import { FollowThroughRelatedType, NotificationType, Project, SafeUser, UserRole, ActivityAction, ActivityEntityType } from '../models/types';
import { ProjectRepository } from '../repositories/projectRepository';
import { UserRepository } from '../repositories/userRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { IssueRepository } from '../repositories/issueRepository';
import { RiskRepository } from '../repositories/riskRepository';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { MeetingRepository } from '../repositories/meetingRepository';
import { ActionItemRepository } from '../repositories/actionItemRepository';
import { WaitingForRepository } from '../repositories/waitingForRepository';
import { ActivityService } from './activityService';
import { NotificationService } from './notificationService';

/**
 * Sprint 14 — shared rules for Meetings, Action Items, Waiting For and
 * Follow-ups: project access, field validation, pagination, activity and
 * notification helpers. The server is the authority on every one of these;
 * nothing a client sends about scope, identity or ownership is trusted.
 */

/** The authenticated caller, taken from the verified JWT. */
export interface FollowThroughActor {
  userId: string;
  role: UserRole;
  name: string;
  ipAddress?: string;
}

/** Create and edit: the existing governance write roles (as for risks and issues). */
export const FOLLOW_THROUGH_WRITE_ROLES: UserRole[] = ['admin', 'project-manager', 'product-manager'];
/**
 * Delete: the same roles. requireRoles is hierarchical (product-manager and
 * project-manager share level 80), so this is also what risk deletion allows in
 * practice; keeping the lists equal means the route and the service agree.
 */
export const FOLLOW_THROUGH_DELETE_ROLES: UserRole[] = [...FOLLOW_THROUGH_WRITE_ROLES];
/**
 * Status changes: the write roles, plus a team member for a record they own —
 * the same idea as /my-work/status for assigned stories and tasks. Viewers
 * never change anything.
 */
export const FOLLOW_THROUGH_STATUS_ROLES: UserRole[] = ['admin', 'project-manager', 'product-manager', 'team-member'];

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/** Typed error the global errorHandler maps to its status and code. */
export function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}

export const validationError = (message: string) => httpError(400, 'VALIDATION_ERROR', message);
export const forbidden = (message: string) => httpError(403, 'FORBIDDEN', message);
/** One answer for "missing" and "outside your projects", so existence cannot be probed. */
export const notAvailable = (kind: string) => httpError(404, 'NOT_FOUND', `${kind} not found or not available to you.`);

/**
 * Sprint 24 — the owner (or lead) of a new record: the chosen user, or the
 * caller when none is chosen. Either way an existing, active user: a fresh
 * PostgreSQL database holds only its bootstrap administrator, so no demo user
 * is ever assumed. Returns undefined only when there is neither.
 */
export async function ownerOrCaller(chosen: unknown, callerId: string | undefined, field = 'ownerId'): Promise<{ id: string; name: string } | undefined> {
  const id = chosen === undefined || chosen === null || chosen === '' ? callerId : chosen;
  if (id === undefined || id === null || id === '') return undefined;
  if (typeof id !== 'string') throw validationError(`Field '${field}' must be a user id.`);
  const user = await UserRepository.findById(id);
  if (!user) throw validationError(`Field '${field}' does not match a user.`);
  if (!user.isActive) throw validationError(`Field '${field}' refers to a deactivated user.`);
  return { id: user.id, name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email };
}

/**
 * Sprint 24 — the authenticated caller a write is recorded against (createdBy,
 * updatedBy, activity). Every such route authenticates first, so a missing
 * caller is a 401 — never a placeholder user.
 */
export function requireActor<T extends { id: string; name: string }>(actor: T | null | undefined): T {
  if (!actor || typeof actor.id !== 'string' || actor.id === '') throw httpError(401, 'UNAUTHORIZED', 'Not authenticated');
  return actor;
}

/** Sprint 24 — a notification goes only to an existing, active user; otherwise it is skipped (never sent to a placeholder). */
export async function notifiableUser(userId: string | undefined | null): Promise<string | undefined> {
  if (!userId) return undefined;
  const user = await UserRepository.findById(userId);
  return user && user.isActive ? user.id : undefined;
}

export function canWrite(actor: FollowThroughActor): boolean {
  return FOLLOW_THROUGH_WRITE_ROLES.includes(actor.role);
}

export function assertCanWrite(actor: FollowThroughActor): void {
  if (!canWrite(actor)) throw forbidden('Your role cannot create or edit these records.');
}

/**
 * Sprint 25 — creating, editing or deleting follow-through needs write access to the
 * project (admin, its manager, or a listed member), not only read access (which assigned
 * work also grants). Status changes keep their owner rule (assertCanChangeStatus).
 */
export function assertProjectWrite(actor: FollowThroughActor, project: Project | null | undefined): void {
  if (actor.role === 'admin') return;
  const writer = !!project && ((project.managerId && project.managerId === actor.userId) || (project.members || []).some((m) => m && m.userId === actor.userId));
  if (!writer) throw forbidden('You can only change records in projects you manage or are a member of.');
}

export function assertCanDelete(actor: FollowThroughActor): void {
  if (!FOLLOW_THROUGH_DELETE_ROLES.includes(actor.role)) throw forbidden('Your role cannot delete these records.');
}

/**
 * Status change: a writer, or a team member who owns the record. Called only
 * after the record's project has been confirmed accessible.
 */
export function assertCanChangeStatus(actor: FollowThroughActor, ownerId: string | undefined): void {
  if (canWrite(actor)) return;
  if (FOLLOW_THROUGH_STATUS_ROLES.includes(actor.role) && ownerId && ownerId === actor.userId) return;
  throw forbidden('Only the owner or a project manager can change the status of this record.');
}

// --------------------------------------------------------------------
// Project access — the same rule the AI context uses (AiContextService):
// admins reach every project; everyone else reaches the projects they manage,
// are a member of, or have assigned stories or tasks in.
// --------------------------------------------------------------------

function isAssociated(project: Project, userId: string): boolean {
  if (project.managerId && project.managerId === userId) return true;
  return (project.members || []).some((m) => m.userId === userId);
}

async function projectIdsFromAssignedWork(userId: string): Promise<Set<string>> {
  const [stories, tasks] = await Promise.all([StoryRepository.findAll(), TaskRepository.findAll()]);
  return new Set(
    [...stories, ...tasks]
      .filter((item: any) => item.assigneeId === userId)
      .map((item: any) => item.projectId)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
  );
}

export const ProjectAccessService = {
  /** Ids of every project the user may see. */
  async accessibleProjectIds(user: { userId: string; role: UserRole }): Promise<string[]> {
    const projects = await ProjectRepository.findAll();
    if (user.role === 'admin') return projects.map((p) => p.id);
    const fromWork = await projectIdsFromAssignedWork(user.userId);
    return projects.filter((p) => isAssociated(p, user.userId) || fromWork.has(p.id)).map((p) => p.id);
  },

  /** The project, when it exists and the user may see it; otherwise null. */
  async resolveAccessibleProject(user: { userId: string; role: UserRole }, projectId: unknown): Promise<Project | null> {
    if (typeof projectId !== 'string' || !projectId.trim()) return null;
    const project = await ProjectRepository.findById(projectId.trim());
    if (!project) return null;
    if (user.role === 'admin' || isAssociated(project, user.userId)) return project;
    const fromWork = await projectIdsFromAssignedWork(user.userId);
    return fromWork.has(project.id) ? project : null;
  },

  async canAccess(user: { userId: string; role: UserRole }, projectId: string): Promise<boolean> {
    return (await this.resolveAccessibleProject(user, projectId)) !== null;
  },
};

/**
 * A person named on a record (owner, organizer, participant, waiting-on user)
 * must be an active portal user who can see the project — otherwise they
 * could be assigned work they can never open.
 */
export async function requireProjectUser(userId: unknown, project: Project, field: string): Promise<SafeUser> {
  if (typeof userId !== 'string' || !userId.trim()) throw validationError(`Field '${field}' must be a user id.`);
  const user = await UserRepository.findById(userId.trim());
  if (!user) throw validationError(`Field '${field}' does not match a user.`);
  if (!user.isActive) throw validationError(`Field '${field}' refers to a deactivated user.`);
  if (!(await ProjectAccessService.canAccess({ userId: user.id, role: user.role }, project.id))) {
    throw validationError(`Field '${field}' refers to a user who is not part of this project.`);
  }
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}

// --------------------------------------------------------------------
// Field validation. undefined = not supplied; '' or null clears an optional
// field on update.
// --------------------------------------------------------------------

export function cleanRequiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw validationError(`Field '${field}' is required.`);
  const text = value.trim();
  if (text.length > maxLength) throw validationError(`Field '${field}' must be at most ${maxLength} characters.`);
  return text;
}

export function cleanOptionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw validationError(`Field '${field}' must be a string.`);
  const text = value.trim();
  if (text.length > maxLength) throw validationError(`Field '${field}' must be at most ${maxLength} characters.`);
  return text || undefined;
}

/** A real calendar date as YYYY-MM-DD. */
export function cleanOptionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`Field '${field}' must be a date in YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw validationError(`Field '${field}' is not a valid date.`);
  }
  return value;
}

/** An ISO 8601 date-time, normalised to UTC. */
export function cleanRequiredDateTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    throw validationError(`Field '${field}' must be an ISO 8601 date-time.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw validationError(`Field '${field}' is not a valid date-time.`);
  return parsed.toISOString();
}

export function cleanEnum<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw validationError(`Field '${field}' must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

/** Rejects an attempt to move a record to another project. */
export function assertSameProject(body: Record<string, unknown>, projectId: string): void {
  if (body.projectId !== undefined && body.projectId !== projectId) {
    throw validationError('A record cannot be moved to another project.');
  }
}

// --------------------------------------------------------------------
// Related-record reference (Waiting For, Follow-ups).
// --------------------------------------------------------------------

async function relatedProjectId(type: FollowThroughRelatedType, id: string): Promise<string | undefined> {
  switch (type) {
    case 'meeting': return (await MeetingRepository.findById(id))?.projectId;
    case 'action_item': return (await ActionItemRepository.findById(id))?.projectId;
    case 'waiting_for': return (await WaitingForRepository.findById(id))?.projectId;
    case 'issue': return (await IssueRepository.findById(id))?.projectId;
    case 'risk': return (await RiskRepository.findById(id))?.projectId;
    case 'dependency': return (await DependencyRepository.findById(id))?.projectId;
    default: return undefined;
  }
}

/**
 * Validates an optional (relatedType, relatedId) pair: both or neither, an
 * allowed type, and a record that exists in the same project. A record in
 * another project is reported exactly like a missing one.
 */
export async function cleanRelated(
  relatedType: unknown,
  relatedId: unknown,
  allowed: readonly FollowThroughRelatedType[],
  projectId: string
): Promise<{ relatedType?: FollowThroughRelatedType; relatedId?: string }> {
  const noType = relatedType === undefined || relatedType === null || relatedType === '';
  const noId = relatedId === undefined || relatedId === null || relatedId === '';
  if (noType && noId) return { relatedType: undefined, relatedId: undefined };
  if (noType || noId) throw validationError("Fields 'relatedType' and 'relatedId' must be supplied together.");
  const type = cleanEnum(relatedType, allowed, 'relatedType');
  if (typeof relatedId !== 'string') throw validationError("Field 'relatedId' must be a string.");
  if ((await relatedProjectId(type, relatedId)) !== projectId) {
    throw validationError(`The related ${type.replace('_', ' ')} was not found in this project.`);
  }
  return { relatedType: type, relatedId };
}

// --------------------------------------------------------------------
// Listing.
// --------------------------------------------------------------------

export function parsePaging(queryParams: Record<string, unknown>): { page: number; limit: number } {
  const page = Math.max(1, Math.floor(Number(queryParams.page) || 1));
  const rawLimit = Math.floor(Number(queryParams.limit) || DEFAULT_PAGE_SIZE);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, rawLimit));
  return { page, limit };
}

export function paginate<T>(items: T[], page: number, limit: number): { items: T[]; total: number; page: number; limit: number } {
  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), total: items.length, page, limit };
}

export function queryText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function queryFlag(value: unknown): boolean {
  return String(value ?? '').toLowerCase() === 'true';
}

/**
 * The project ids a listing may cover. An explicit projectId must be one the
 * caller can see (404 otherwise, as for a single record).
 */
export async function listingScope(actor: FollowThroughActor, projectId: unknown): Promise<string[]> {
  if (projectId !== undefined && projectId !== '') {
    const project = await ProjectAccessService.resolveAccessibleProject(actor, projectId);
    if (!project) throw notAvailable('Project');
    return [project.id];
  }
  return ProjectAccessService.accessibleProjectIds(actor);
}

// --------------------------------------------------------------------
// Activity and notifications (existing infrastructure).
// --------------------------------------------------------------------

export async function logFollowThroughActivity(
  actor: FollowThroughActor,
  entityType: ActivityEntityType,
  entityId: string,
  action: ActivityAction,
  details: Record<string, unknown>
): Promise<void> {
  await ActivityService.logActivity({
    entityType,
    entityId,
    action,
    actorId: actor.userId,
    actorName: actor.name,
    details,
    ipAddress: actor.ipAddress,
  });
}

/** Notifies someone other than the actor; nobody is notified about their own change. */
export async function notifyUser(
  actor: FollowThroughActor,
  userId: string | undefined,
  type: NotificationType,
  title: string,
  message: string,
  tab: string
): Promise<void> {
  if (!userId || userId === actor.userId) return;
  await NotificationService.sendNotification({
    userId,
    title,
    message,
    type,
    link: `/PM-Portal/index.html?page=meetings&tab=${tab}`,
    isRead: false,
  });
}
