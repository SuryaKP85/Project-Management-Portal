import { Request } from 'express';
import { GovernanceLinkSourceType, Project, TraceabilityChain, TraceabilityNode, UserRole } from '../models/types';
import { GovernanceLinkRepository } from '../repositories/governanceLinkRepository';
import { ProjectRepository } from '../repositories/projectRepository';
import { RequirementRepository } from '../repositories/requirementRepository';
import { MeetingRepository } from '../repositories/meetingRepository';
import { ActionItemRepository } from '../repositories/actionItemRepository';
import { WaitingForRepository } from '../repositories/waitingForRepository';
import { FollowUpRepository } from '../repositories/followUpRepository';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { ProjectAccessService, forbidden, httpError, notAvailable } from './followThroughSupport';
import { canWriteProject } from './deliveryGuards';
import { resolveEntity } from './dependencyService';
import { EXECUTIVE_COMMERCIAL_ROLES } from './executiveDashboardService';

/**
 * Sprint 22A — the project boundary for every project-scoped V2 endpoint.
 *
 * One rule, the one Home and the follow-through modules already use
 * (ProjectAccessService): administrators reach every project; everyone else
 * reaches the projects they manage, belong to, or have work assigned in.
 * - Reads: lists keep only records of accessible projects; a single record
 *   outside them is a 404 that does not reveal it exists. A record whose
 *   project cannot be resolved is hidden from non-administrators (fail closed).
 * - Writes: read access first (404), then canWriteProject (403). A move needs
 *   write access to both the source and the destination project.
 * - Identity and role come from the verified request (authenticateToken loads
 *   the current account); client values only ever narrow a query.
 */

export interface ScopeActor {
  userId: string;
  role: UserRole;
}

/** The verified caller. */
export function scopeActor(req: Request): ScopeActor {
  if (!req.user) throw httpError(401, 'UNAUTHORIZED', 'Not authenticated');
  return { userId: req.user.userId, role: req.user.role };
}

/** Org-level records (strategy and structure): not owned by one project. */
const ORG_LEVEL_TYPES = new Set(['portfolio', 'product', 'goal', 'roadmap', 'team']);

/** Fields only roles with commercial visibility (as in the Executive Overview) may read. */
const COMMERCIAL_FIELDS = ['budget', 'client'] as const;

export const ProjectScope = {
  /** null means every project (administrators); otherwise the accessible project ids. */
  async ids(actor: ScopeActor): Promise<Set<string> | null> {
    if (actor.role === 'admin') return null;
    return new Set(await ProjectAccessService.accessibleProjectIds(actor));
  },

  /** Keeps the items whose project the actor can see. */
  async filter<T>(actor: ScopeActor, items: T[], projectOf: (item: T) => string | null | undefined): Promise<T[]> {
    const ids = await this.ids(actor);
    if (!ids) return items;
    return items.filter((item) => {
      const projectId = projectOf(item);
      return !!projectId && ids.has(projectId);
    });
  },

  async canRead(actor: ScopeActor, projectId: string | null | undefined): Promise<boolean> {
    if (actor.role === 'admin') return true;
    if (typeof projectId !== 'string' || !projectId) return false;
    return ProjectAccessService.canAccess(actor, projectId);
  },

  /** 404 (as for a missing record) unless the actor can see the project. */
  async assertRead(actor: ScopeActor, projectId: string | null | undefined, kind: string): Promise<void> {
    if (!(await this.canRead(actor, projectId))) throw notAvailable(kind);
  },

  /**
   * Write access to a project: 404 when the actor cannot see it, 403 when they
   * can see but not change it. Administrators keep their global access.
   */
  async assertWrite(actor: ScopeActor, projectId: string | null | undefined, kind: string): Promise<Project | null> {
    const project = typeof projectId === 'string' && projectId ? await ProjectRepository.findById(projectId) : null;
    if (actor.role === 'admin') return project;
    if (!project || !(await ProjectAccessService.canAccess(actor, project.id))) throw notAvailable(kind);
    if (!canWriteProject({ id: actor.userId, role: actor.role }, project)) {
      throw forbidden('You can only change records in projects you manage or are a member of.');
    }
    return project;
  },

  /**
   * For record types whose project is optional by design (product-level
   * releases; dependencies between org-level records): a record without a
   * project stays org-level, as before; one with a project gets the boundary.
   */
  async filterOptional<T>(actor: ScopeActor, items: T[], projectOf: (item: T) => string | null | undefined): Promise<T[]> {
    const ids = await this.ids(actor);
    if (!ids) return items;
    return items.filter((item) => {
      const projectId = projectOf(item);
      return !projectId || ids.has(projectId);
    });
  },

  async canReadOptional(actor: ScopeActor, projectId: string | null | undefined): Promise<boolean> {
    return !projectId || this.canRead(actor, projectId);
  },

  async assertWriteOptional(actor: ScopeActor, projectId: string | null | undefined, kind: string): Promise<void> {
    if (projectId) await this.assertWrite(actor, projectId, kind);
  },

  /** A change of project needs write access to the current and the new project. */
  async assertMove(actor: ScopeActor, fromProjectId: string | undefined, toProjectId: unknown, kind: string): Promise<void> {
    await this.assertWrite(actor, fromProjectId, kind);
    if (toProjectId !== undefined && toProjectId !== null && toProjectId !== '' && toProjectId !== fromProjectId) {
      await this.assertWrite(actor, typeof toProjectId === 'string' ? toProjectId : undefined, 'Project');
    }
  },

  /**
   * The project an entity belongs to (a subtask through its task). 'org' for
   * org-level records (portfolio, product, goal, roadmap, team); undefined
   * when it cannot be resolved.
   */
  async projectOfEntity(type: unknown, id: unknown): Promise<string | 'org' | undefined> {
    if (typeof type !== 'string' || typeof id !== 'string' || !id) return undefined;
    const kind = type.toLowerCase().replace(/-/g, '_');
    if (ORG_LEVEL_TYPES.has(kind)) return 'org';
    const byRepo: Record<string, (id: string) => Promise<{ projectId?: string } | null>> = {
      requirement: (x) => RequirementRepository.findById(x),
      meeting: (x) => MeetingRepository.findById(x),
      action_item: (x) => ActionItemRepository.findById(x),
      waiting_for: (x) => WaitingForRepository.findById(x),
      follow_up: (x) => FollowUpRepository.findById(x),
      dependency: (x) => DependencyRepository.findById(x),
    };
    if (byRepo[kind]) return (await byRepo[kind](id))?.projectId || undefined;
    if (kind === 'project') return (await ProjectRepository.findById(id)) ? id : undefined;
    const known = ['epic', 'feature', 'story', 'task', 'subtask', 'sprint', 'risk', 'issue', 'milestone', 'release'];
    if (!known.includes(kind)) return undefined;
    const resolved = await resolveEntity(kind, id);
    return resolved.exists ? resolved.projectId : undefined;
  },

  /** Whether the actor may see the entity (org-level records are visible to every signed-in user). */
  async canReadEntity(actor: ScopeActor, type: unknown, id: unknown): Promise<boolean> {
    if (actor.role === 'admin') return true;
    const projectId = await this.projectOfEntity(type, id);
    if (projectId === 'org') return true;
    return this.canRead(actor, projectId);
  },

  /** A governance link may only point at a record the actor can see. */
  async assertLinkTarget(actor: ScopeActor, targetType: unknown, targetId: unknown): Promise<void> {
    if (!(await this.canReadEntity(actor, targetType, targetId))) throw notAvailable('Link target');
  },

  /** Removes a link only when it belongs to that parent record (never by link id alone). */
  async removeOwnLink(governanceType: GovernanceLinkSourceType, governanceId: string, linkId: string): Promise<boolean> {
    const links = await GovernanceLinkRepository.getLinksFor(governanceType, governanceId);
    if (!links.some((l) => l.id === linkId)) throw notAvailable('Link');
    return GovernanceLinkRepository.removeLink(linkId);
  },

  /**
   * A traceability chain for the caller: null (404) when they cannot see its
   * root; otherwise the chain with every node from a project they cannot see
   * removed (org-level nodes such as a product's child projects included).
   */
  async scopeTrace(actor: ScopeActor, chain: TraceabilityChain | null): Promise<TraceabilityChain | null> {
    if (!chain || actor.role === 'admin') return chain;
    if (!(await this.canReadEntity(actor, chain.entity.type, chain.entity.id))) return null;
    const keep = async (nodes: TraceabilityNode[] = []) => {
      const visible: TraceabilityNode[] = [];
      for (const node of nodes) if (await this.canReadEntity(actor, node.type, node.id)) visible.push(node);
      return visible;
    };
    const scoped: TraceabilityChain = { ...chain, ancestors: await keep(chain.ancestors) };
    if (chain.children) scoped.children = await keep(chain.children);
    if (chain.governance) {
      scoped.governance = {};
      for (const [key, nodes] of Object.entries(chain.governance)) {
        (scoped.governance as Record<string, TraceabilityNode[]>)[key] = await keep(nodes);
      }
    }
    return scoped;
  },

  /** Commercial fields are removed for roles without commercial visibility. */
  stripCommercial<T extends Record<string, any>>(actor: ScopeActor, record: T): T {
    if (EXECUTIVE_COMMERCIAL_ROLES.includes(actor.role) || !record || typeof record !== 'object') return record;
    const copy: Record<string, any> = { ...record };
    for (const field of COMMERCIAL_FIELDS) delete copy[field];
    return copy as T;
  },

  /** A page of an already-scoped list (page 1 and 25 per page by default, as the services use). */
  page<T>(items: T[], page: unknown, limit: unknown): { items: T[]; total: number; page: number; limit: number } {
    const p = Number(page) > 0 ? Math.floor(Number(page)) : 1;
    const l = Number(limit) > 0 ? Math.floor(Number(limit)) : 25;
    return { items: items.slice((p - 1) * l, p * l), total: items.length, page: p, limit: l };
  },
};
