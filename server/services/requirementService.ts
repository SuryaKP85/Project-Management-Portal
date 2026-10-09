import { Project, Requirement, RequirementPriority, RequirementStatus, RequirementType, UserRole } from '../models/types';
import { RequirementRepository } from '../repositories/requirementRepository';
import { canWriteProject } from './deliveryGuards';
import { ProjectGuards } from './projectGuards';
import { NotificationService } from './notificationService';
import {
  FollowThroughActor, ProjectAccessService, cleanEnum, cleanOptionalDate, cleanOptionalText, cleanRequiredText,
  forbidden, httpError, listingScope, logFollowThroughActivity, notAvailable, paginate, parsePaging, queryText,
  requireProjectUser, validationError,
} from './followThroughSupport';

/**
 * Sprint 17 — Requirements Studio foundation.
 *
 * A requirement belongs to one project for its whole life. The rules live
 * here, not only in the routes (requireRoles is hierarchical, so a route role
 * list cannot express them):
 *
 * - Read: the caller's existing project access (ProjectAccessService).
 *   Anything else is a 404, exactly like a missing record.
 * - Create / edit: administrators; project and product managers who can see
 *   the project; and team members listed on it (or managing it) — the Sprint 16
 *   delivery write rule. Viewers never write. Owning a requirement grants
 *   nothing: access always comes from the project.
 * - Status follows one lifecycle (REQUIREMENT_TRANSITIONS): draft -> in-review;
 *   in-review -> approved | rejected | deferred. Anything else is a 400. Anyone
 *   who can edit may submit a draft for review; approving, rejecting and
 *   deferring belong to administrators and project/product managers. Every
 *   requirement is created as a draft, whatever the request says.
 * - Delete: administrators and the project's current manager; an approved
 *   requirement is never deleted.
 * - A substantive change (title, description, type, priority, rationale,
 *   source) to an approved requirement returns it to in-review. Owner and
 *   target date are metadata and leave the approval in place. This is the
 *   only way an approved requirement leaves approval; rejected and deferred
 *   are final in this foundation.
 *
 * - Sprint 18: every substantive change also increments the server-controlled
 *   revision (decomposition consumes one revision at most once).
 *
 * id, code, revision, projectId, createdBy/updatedBy and timestamps are never taken
 * from the client; only allowlisted fields are read from a request body.
 */

export const REQUIREMENT_TYPES: readonly RequirementType[] = ['business', 'functional', 'non-functional'];
export const REQUIREMENT_STATUSES: readonly RequirementStatus[] = ['draft', 'in-review', 'approved', 'rejected', 'deferred'];
export const REQUIREMENT_PRIORITIES: readonly RequirementPriority[] = ['critical', 'high', 'medium', 'low'];

/** Roles the routes admit for create/edit/status (team members are narrowed to project members here). */
export const REQUIREMENT_WRITE_ROLES: UserRole[] = ['admin', 'project-manager', 'product-manager', 'team-member'];
/** Roles the delete route admits; the service narrows it to the project's current manager. */
export const REQUIREMENT_DELETE_ROLES: UserRole[] = ['admin', 'project-manager', 'product-manager'];
/** Roles that may approve, reject or defer. */
export const REQUIREMENT_APPROVER_ROLES: UserRole[] = ['admin', 'project-manager', 'product-manager'];

/** Fields whose change reopens an approved requirement. */
export const REQUIREMENT_SUBSTANTIVE_FIELDS = ['title', 'description', 'type', 'priority', 'rationale', 'source'] as const;
/** Every field a client may set through create/PATCH. */
export const REQUIREMENT_EDITABLE_FIELDS = [...REQUIREMENT_SUBSTANTIVE_FIELDS, 'ownerId', 'targetDate'] as const;

/**
 * The status lifecycle: the only transitions PATCH /requirements/:id/status
 * accepts. approved -> in-review happens only through a substantive edit.
 */
export const REQUIREMENT_TRANSITIONS: Readonly<Record<RequirementStatus, readonly RequirementStatus[]>> = {
  draft: ['in-review'],
  'in-review': ['approved', 'rejected', 'deferred'],
  approved: [],
  rejected: [],
  deferred: [],
};

/** Transitions a project member (not an approver) may make. */
const MEMBER_TRANSITIONS: ReadonlyArray<[RequirementStatus, RequirementStatus]> = [['draft', 'in-review']];

const LIMITS = { title: 255, description: 10000, rationale: 5000, source: 500 };

const conflict = (message: string) => httpError(409, 'CONFLICT', message);

/**
 * Sprint 25: editing and approving need write access to the project (admin, its manager or a
 * listed member) for every role — read access alone (e.g. through one assigned story) never
 * lets anyone change, approve or reject a project's requirements.
 */
function canEdit(actor: FollowThroughActor, project: Project): boolean {
  return canWriteProject({ id: actor.userId, role: actor.role }, project);
}

function assertCanEdit(actor: FollowThroughActor, project: Project): void {
  if (!canEdit(actor, project)) throw forbidden('Only project members and managers can create or edit requirements.');
}

const isApprover = (actor: FollowThroughActor) => REQUIREMENT_APPROVER_ROLES.includes(actor.role);

/**
 * Status rule; called after project access is confirmed. The lifecycle is
 * checked first (400 for any transition it does not contain), then who may
 * make an allowed transition (403).
 */
function assertStatusChange(actor: FollowThroughActor, project: Project, from: RequirementStatus, to: RequirementStatus): void {
  assertCanEdit(actor, project);
  if (!REQUIREMENT_TRANSITIONS[from].includes(to)) {
    throw validationError(`A requirement cannot move from '${from}' to '${to}'.`);
  }
  if (isApprover(actor)) return;
  if (MEMBER_TRANSITIONS.some(([a, b]) => a === from && b === to)) return;
  throw forbidden('Only an administrator, project manager or product manager can approve, reject or defer a requirement.');
}

async function loadAccessible(actor: FollowThroughActor, id: string): Promise<{ requirement: Requirement; project: Project }> {
  const requirement = typeof id === 'string' && id ? await RequirementRepository.findById(id) : null;
  if (!requirement) throw notAvailable('Requirement');
  const project = await ProjectAccessService.resolveAccessibleProject(actor, requirement.projectId);
  if (!project) throw notAvailable('Requirement');
  return { requirement, project };
}

const supplied = (body: Record<string, unknown>, field: string) =>
  Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined;

async function cleanOwner(value: unknown, project: Project): Promise<string | undefined> {
  if (value === null || value === '') return undefined;
  return (await requireProjectUser(value, project, 'ownerId')).id;
}

/** Allowlisted, validated field values from a body (only the fields it supplies). */
async function cleanFields(body: Record<string, unknown>, project: Project): Promise<Partial<Requirement>> {
  const out: Partial<Requirement> = {};
  if (supplied(body, 'title')) out.title = cleanRequiredText(body.title, 'title', LIMITS.title);
  if (supplied(body, 'description')) out.description = cleanOptionalText(body.description, 'description', LIMITS.description);
  if (supplied(body, 'type')) out.type = cleanEnum(body.type, REQUIREMENT_TYPES, 'type');
  if (supplied(body, 'priority')) out.priority = cleanEnum(body.priority, REQUIREMENT_PRIORITIES, 'priority');
  if (supplied(body, 'rationale')) out.rationale = cleanOptionalText(body.rationale, 'rationale', LIMITS.rationale);
  if (supplied(body, 'source')) out.source = cleanOptionalText(body.source, 'source', LIMITS.source);
  if (supplied(body, 'ownerId')) out.ownerId = await cleanOwner(body.ownerId, project);
  if (supplied(body, 'targetDate')) out.targetDate = cleanOptionalDate(body.targetDate, 'targetDate');
  return out;
}

/** Tells a new owner about their requirement; nobody is notified about their own change. */
async function notifyOwner(actor: FollowThroughActor, requirement: Requirement, reassigned: boolean): Promise<void> {
  if (!requirement.ownerId || requirement.ownerId === actor.userId) return;
  await NotificationService.sendNotification({
    userId: requirement.ownerId,
    title: reassigned ? 'Requirement reassigned to you' : 'Requirement assigned to you',
    message: `${actor.name} made you the owner of ${requirement.code}: ${requirement.title}`,
    type: reassigned ? 'work_reassigned' : 'work_assigned',
    link: '/PM-Portal/index.html?page=requirements',
    isRead: false,
  });
}

// --------------------------------------------------------------------
// AI extension point. Not connected to the AI service in Sprint 17.
// --------------------------------------------------------------------

export interface RequirementContext {
  code: string;
  title: string;
  type: RequirementType;
  status: RequirementStatus;
  priority: RequirementPriority;
  description?: string;
  rationale?: string;
  source?: string;
  targetDate?: string;
  hasOwner: boolean;
}

export const REQUIREMENT_CONTEXT_LIMITS = { title: 200, description: 1000, rationale: 500, source: 200 };

function cap(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * A whitelisted, length-capped projection of a requirement for future AI
 * prompts. Pure: no lookups, no record ids, no user ids or names — only the
 * requirement's own content and whether it has an owner.
 */
export function toRequirementContext(requirement: Requirement): RequirementContext {
  const out: RequirementContext = {
    code: String(requirement.code || ''),
    title: cap(requirement.title, REQUIREMENT_CONTEXT_LIMITS.title) || '',
    type: requirement.type,
    status: requirement.status,
    priority: requirement.priority,
    hasOwner: !!requirement.ownerId,
  };
  const description = cap(requirement.description, REQUIREMENT_CONTEXT_LIMITS.description);
  const rationale = cap(requirement.rationale, REQUIREMENT_CONTEXT_LIMITS.rationale);
  const source = cap(requirement.source, REQUIREMENT_CONTEXT_LIMITS.source);
  if (description) out.description = description;
  if (rationale) out.rationale = rationale;
  if (source) out.source = source;
  if (typeof requirement.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requirement.targetDate)) out.targetDate = requirement.targetDate;
  return out;
}

export const RequirementService = {
  async list(actor: FollowThroughActor, params: Record<string, unknown>) {
    const projectIds = await listingScope(actor, params.projectId);
    const all = await RequirementRepository.findAll({
      projectIds,
      status: queryText(params.status),
      priority: queryText(params.priority),
      type: queryText(params.type),
      ownerId: queryText(params.ownerId),
      search: queryText(params.search),
    });
    const { page, limit } = parsePaging(params);
    const result = paginate(all, page, limit);
    return { requirements: result.items, total: result.total, page: result.page, limit: result.limit };
  },

  async get(actor: FollowThroughActor, id: string): Promise<Requirement> {
    return (await loadAccessible(actor, id)).requirement;
  },

  async create(actor: FollowThroughActor, body: Record<string, unknown>): Promise<Requirement> {
    const project = await ProjectAccessService.resolveAccessibleProject(actor, body.projectId);
    if (!project) throw notAvailable('Project');
    assertCanEdit(actor, project);

    const fields = await cleanFields(body, project);
    if (!fields.title) throw validationError("Field 'title' is required.");

    const requirement = await RequirementRepository.create({
      projectId: project.id,
      title: fields.title,
      description: fields.description,
      type: fields.type ?? 'functional',
      // Always a draft: a client-supplied status is ignored.
      status: 'draft',
      priority: fields.priority ?? 'medium',
      rationale: fields.rationale,
      source: fields.source,
      ownerId: fields.ownerId,
      targetDate: fields.targetDate,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    await logFollowThroughActivity(actor, 'requirement', requirement.id, 'create', {
      projectId: requirement.projectId,
      code: requirement.code,
      title: requirement.title,
      type: requirement.type,
      status: requirement.status,
      priority: requirement.priority,
    });
    await notifyOwner(actor, requirement, false);
    return requirement;
  },

  async update(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<Requirement> {
    const { requirement: current, project } = await loadAccessible(actor, id);
    assertCanEdit(actor, project);
    if (supplied(body, 'projectId') && body.projectId !== current.projectId) {
      throw validationError('A requirement cannot be moved to another project.');
    }
    if (supplied(body, 'status') && body.status !== current.status) {
      throw validationError('Change the status with PATCH /requirements/:id/status.');
    }

    const fields = await cleanFields(body, project);
    const changed = (Object.keys(fields) as Array<keyof Requirement>).filter((k) => (fields[k] ?? '') !== (current[k] ?? ''));
    if (changed.length === 0) return current;

    const updates: Partial<Requirement> = { updatedBy: actor.userId };
    for (const k of changed) (updates as any)[k] = fields[k];
    const substantive = changed.filter((k) => (REQUIREMENT_SUBSTANTIVE_FIELDS as readonly string[]).includes(k));
    const reopened = current.status === 'approved' && substantive.length > 0;
    // Sprint 25: an approved requirement's content changes only through an approver (the edit reopens it).
    if (reopened && !isApprover(actor)) {
      throw forbidden('An approved requirement can only be changed by an administrator, project manager or product manager on the project; the change reopens it for review.');
    }
    if (reopened) updates.status = 'in-review';
    // Sprint 18: a substantive change is a new revision (owner and target date are not).
    if (substantive.length > 0) updates.revision = (current.revision || 1) + 1;

    const updated = (await RequirementRepository.update(id, updates)) as Requirement;
    const base = { projectId: updated.projectId, code: updated.code };

    const contentFields = changed.filter((k) => k !== 'ownerId');
    if (contentFields.length > 0) {
      await logFollowThroughActivity(actor, 'requirement', id, 'update', { ...base, fields: contentFields });
    }
    if (reopened) {
      await logFollowThroughActivity(actor, 'requirement', id, 'status_change', {
        ...base, from: 'approved', to: 'in-review', reason: 'content-changed',
      });
    }
    if (changed.includes('ownerId')) {
      await logFollowThroughActivity(actor, 'requirement', id, 'owner_change', {
        ...base, from: current.ownerId || null, to: updated.ownerId || null,
      });
      await notifyOwner(actor, updated, !!current.ownerId);
    }
    return updated;
  },

  async updateStatus(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<Requirement> {
    const { requirement: current, project } = await loadAccessible(actor, id);
    const to = cleanEnum(body.status, REQUIREMENT_STATUSES, 'status');
    assertStatusChange(actor, project, current.status, to);

    const updated = (await RequirementRepository.update(id, { status: to, updatedBy: actor.userId })) as Requirement;
    await logFollowThroughActivity(actor, 'requirement', id, 'status_change', {
      projectId: updated.projectId, code: updated.code, from: current.status, to,
    });
    return updated;
  },

  async remove(actor: FollowThroughActor, id: string): Promise<void> {
    const { requirement, project } = await loadAccessible(actor, id);
    if (!ProjectGuards.canAdminister({ id: actor.userId, role: actor.role }, project)) {
      throw forbidden("Only an administrator or the project's manager can delete requirements.");
    }
    if (requirement.status === 'approved') throw conflict('An approved requirement cannot be deleted.');
    await RequirementRepository.delete(id);
    await logFollowThroughActivity(actor, 'requirement', id, 'delete', {
      projectId: requirement.projectId, code: requirement.code, title: requirement.title,
    });
  },
};
