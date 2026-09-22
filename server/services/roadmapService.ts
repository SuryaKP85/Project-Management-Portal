import {
  RoadmapItem,
  RoadmapItemWithProgress,
  RoadmapStatus,
  DeliveryPriority,
} from '../models/types';
import { RoadmapRepository, RoadmapFilter } from '../repositories/roadmapRepository';
import { ProductRepository } from '../repositories/productRepository';
import { PortfolioRepository } from '../repositories/portfolioRepository';
import { ProjectRepository } from '../repositories/projectRepository';
import { UserRepository } from '../repositories/userRepository';
import { GoalRepository } from '../repositories/goalRepository';
import { GovernanceLinkRepository } from '../repositories/governanceLinkRepository';
import { ActivityService } from './activityService';

/**
 * Sprint 9.2 — roadmap domain service.
 *
 * Validation, CRUD, filtering and ordering for strategic initiatives.
 *
 * Progress is never stored. It is derived at read time from the linked
 * project's canonical `Project.progress` — the same value projectHealthService
 * consumes — and is null when no project is linked. That keeps a single
 * progress source of truth rather than introducing a second algorithm.
 */

export const VALID_ROADMAP_STATUSES: RoadmapStatus[] = [
  'proposed',
  'committed',
  'in-progress',
  'shipped',
  'deferred',
  'cancelled',
];

export const VALID_ROADMAP_PRIORITIES: DeliveryPriority[] = ['critical', 'high', 'medium', 'low'];

export interface RoadmapActor {
  id: string;
  name: string;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  fallback: T
): T {
  const resolved = value === undefined || value === null || value === '' ? fallback : (String(value) as T);
  if (!allowed.includes(resolved)) {
    throw new Error(`Invalid ${field} '${value}'. Allowed: ${allowed.join(', ')}`);
  }
  return resolved;
}

/** Dates are date-only, matching the issue/risk convention. */
function validateDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`${field} must be a valid date in YYYY-MM-DD format.`);
  }
  return text;
}

/** Resolves an optional association, rejecting ids that do not exist. */
async function resolveOptionalProduct(productId?: string) {
  if (!productId) return { id: undefined, name: undefined };
  let product = await ProductRepository.findById(productId);
  if (!product) {
    const all = await ProductRepository.findAll();
    product = all.find((p) => p.code === productId || p.id === productId) || null;
  }
  if (!product) throw new Error(`Invalid product: "${productId}" does not exist.`);
  return { id: product.id, name: product.name };
}

async function resolveOptionalPortfolio(portfolioId?: string) {
  if (!portfolioId) return { id: undefined, name: undefined };
  let portfolio = await PortfolioRepository.findById(portfolioId);
  if (!portfolio) {
    const all = await PortfolioRepository.findAll();
    portfolio = all.find((p) => p.code === portfolioId || p.id === portfolioId) || null;
  }
  if (!portfolio) throw new Error(`Invalid portfolio: "${portfolioId}" does not exist.`);
  return { id: portfolio.id, name: portfolio.name };
}

async function resolveOptionalProject(projectId?: string) {
  if (!projectId) return { id: undefined, name: undefined };
  let project = await ProjectRepository.findById(projectId);
  if (!project) {
    const all = await ProjectRepository.findAll();
    project = all.find((p) => p.code === projectId || p.id === projectId) || null;
  }
  if (!project) throw new Error(`Invalid project: "${projectId}" does not exist.`);
  return { id: project.id, name: project.name };
}

async function resolveOptionalOwner(ownerId?: string) {
  if (!ownerId) return { id: undefined, name: undefined };
  const user = await UserRepository.findById(ownerId);
  if (!user) throw new Error(`Invalid owner: user "${ownerId}" does not exist.`);
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  return { id: user.id, name };
}

/** Goal alignment carried on a read, never persisted on the RoadmapItem. */
export interface RoadmapLinkedGoal {
  linkId: string;
  goalId: string;
  /** Goals have no code; they are identified by goalId and labelled by name. */
  name?: string;
  status?: string;
  progress?: number;
}

/** Fixed link direction: a roadmap item is always the source, a goal the target. */
const LINK_SOURCE = 'roadmap' as const;
const LINK_TARGET = 'goal' as const;

export const RoadmapService = {
  /**
   * Attaches derived progress. Reuses the linked project's canonical progress
   * value; no project means progress is unavailable, never zero.
   */
  async withDerivedProgress(item: RoadmapItem): Promise<RoadmapItemWithProgress> {
    if (!item.projectId) {
      return { ...item, progress: null, progressSource: 'unavailable' };
    }

    const project = await ProjectRepository.findById(item.projectId);
    if (!project || typeof project.progress !== 'number') {
      return { ...item, progress: null, progressSource: 'unavailable' };
    }

    return { ...item, progress: project.progress, progressSource: 'linked-project' };
  },

  async getAllItems(
    filter?: RoadmapFilter & { goalId?: string }
  ): Promise<RoadmapItemWithProgress[]> {
    const { goalId, ...repositoryFilter } = filter || {};
    const items = await RoadmapRepository.findAll(repositoryFilter);

    // goalId lives in the junction rather than on the item, so it is applied
    // here instead of in the repository filter.
    let scoped = items;
    if (goalId) {
      const backlinks = await GovernanceLinkRepository.getBacklinks(LINK_TARGET, goalId);
      const allowed = new Set(
        backlinks.filter((l) => l.governanceType === LINK_SOURCE).map((l) => l.governanceId)
      );
      scoped = items.filter((i) => allowed.has(i.id));
    }

    return Promise.all(scoped.map((i) => this.withDerivedProgress(i)));
  },

  async getItemById(id: string): Promise<RoadmapItemWithProgress | null> {
    const item = await RoadmapRepository.findById(id);
    if (!item) return null;
    return this.withDerivedProgress(item);
  },

  /**
   * Resolves the goals aligned to an item. Names are read from the Goal
   * repository at query time rather than trusted from the stored link, so a
   * renamed goal cannot leave a stale label behind.
   */
  async getLinkedGoals(roadmapId: string): Promise<RoadmapLinkedGoal[]> {
    const links = await GovernanceLinkRepository.getLinksFor(LINK_SOURCE, roadmapId);
    const goalLinks = links.filter((l) => l.targetType === LINK_TARGET);

    const resolved: RoadmapLinkedGoal[] = [];
    for (const link of goalLinks) {
      const goal = await GoalRepository.findById(link.targetId);
      resolved.push({
        linkId: link.id,
        goalId: link.targetId,
        name: goal?.objective ?? link.targetName,
        status: goal?.status,
        progress: goal?.progress,
      });
    }
    return resolved;
  },

  /** An item plus its goal alignment; alignment is derived, never stored. */
  async getItemWithLinks(
    id: string
  ): Promise<(RoadmapItemWithProgress & { linkedGoals: RoadmapLinkedGoal[] }) | null> {
    const item = await this.getItemById(id);
    if (!item) return null;
    return { ...item, linkedGoals: await this.getLinkedGoals(id) };
  },

  /** RoadmapItems aligned to a goal, resolved from the reverse direction. */
  async getItemsForGoal(goalId: string): Promise<RoadmapItemWithProgress[]> {
    const backlinks = await GovernanceLinkRepository.getBacklinks(LINK_TARGET, goalId);
    const roadmapLinks = backlinks.filter((l) => l.governanceType === LINK_SOURCE);

    const items: RoadmapItemWithProgress[] = [];
    for (const link of roadmapLinks) {
      const item = await RoadmapRepository.findById(link.governanceId);
      if (item) items.push(await this.withDerivedProgress(item));
    }
    return items;
  },

  /**
   * Aligns a roadmap item to a goal. Both ends are verified to exist, and the
   * target's code/name are resolved server-side — the client supplies only ids.
   */
  async linkGoal(roadmapId: string, goalId: string, actor?: RoadmapActor) {
    const item = await RoadmapRepository.findById(roadmapId);
    if (!item) return null;

    const cleanGoalId = requireNonEmptyString(goalId, 'Goal id');
    const goal = await GoalRepository.findById(cleanGoalId);
    if (!goal) throw new Error(`Invalid goal: "${cleanGoalId}" does not exist.`);

    const existing = await GovernanceLinkRepository.getLinksFor(LINK_SOURCE, roadmapId);
    if (existing.some((l) => l.targetType === LINK_TARGET && l.targetId === goal.id)) {
      throw new Error('This roadmap item is already aligned to that goal.');
    }

    const link = await GovernanceLinkRepository.addLink(
      LINK_SOURCE,
      roadmapId,
      LINK_TARGET,
      goal.id,
      goal.id,
      goal.objective
    );

    await ActivityService.logActivity({
      entityType: 'roadmap',
      entityId: roadmapId,
      action: 'assign',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'System',
      details: { code: item.code, goalId: goal.id, goalObjective: goal.objective, linkId: link.id },
    });

    return link;
  },

  /** Removes one alignment. Returns false when the link is not on this item. */
  async unlinkGoal(roadmapId: string, linkId: string, actor?: RoadmapActor): Promise<boolean> {
    const item = await RoadmapRepository.findById(roadmapId);
    if (!item) return false;

    const links = await GovernanceLinkRepository.getLinksFor(LINK_SOURCE, roadmapId);
    const target = links.find((l) => l.id === linkId);
    // Guard against removing a link that belongs to a different item.
    if (!target) return false;

    const removed = await GovernanceLinkRepository.removeLink(linkId);
    if (!removed) return false;

    await ActivityService.logActivity({
      entityType: 'roadmap',
      entityId: roadmapId,
      action: 'reassign',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'System',
      details: { code: item.code, unlinkedGoalId: target.targetId, linkId },
    });

    return true;
  },

  async createItem(data: Partial<RoadmapItem>, actor?: RoadmapActor): Promise<RoadmapItemWithProgress> {
    const name = requireNonEmptyString(data.name, 'Roadmap item name');
    const status = validateEnum(data.status, VALID_ROADMAP_STATUSES, 'status', 'proposed');
    const priority = validateEnum(data.priority, VALID_ROADMAP_PRIORITIES, 'priority', 'medium');
    const startDate = validateDate(data.startDate, 'Start date');
    const targetDate = validateDate(data.targetDate, 'Target date');

    if (startDate && targetDate && targetDate < startDate) {
      throw new Error('Target date cannot be earlier than the start date.');
    }

    const product = await resolveOptionalProduct(data.productId);
    const portfolio = await resolveOptionalPortfolio(data.portfolioId);
    const project = await resolveOptionalProject(data.projectId);
    const owner = await resolveOptionalOwner(data.ownerId);

    const created = await RoadmapRepository.create({
      ...data,
      name,
      status,
      priority,
      startDate,
      targetDate,
      productId: product.id,
      productName: product.name,
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      projectId: project.id,
      projectName: project.name,
      ownerId: owner.id,
      ownerName: owner.name,
      createdBy: actor?.id,
      updatedBy: actor?.id,
    });

    await ActivityService.logActivity({
      entityType: 'roadmap',
      entityId: created.id,
      action: 'create',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'System',
      details: {
        code: created.code,
        name: created.name,
        status: created.status,
        priority: created.priority,
        productId: created.productId,
        projectId: created.projectId,
      },
    });

    return this.withDerivedProgress(created);
  },

  async updateItem(
    id: string,
    updates: Partial<RoadmapItem>,
    actor?: RoadmapActor
  ): Promise<RoadmapItemWithProgress | null> {
    const current = await RoadmapRepository.findById(id);
    if (!current) return null;

    const sanitized: Partial<RoadmapItem> = { ...updates };

    if (updates.name !== undefined) {
      sanitized.name = requireNonEmptyString(updates.name, 'Roadmap item name');
    }
    if (updates.status !== undefined) {
      sanitized.status = validateEnum(updates.status, VALID_ROADMAP_STATUSES, 'status', current.status);
    }
    if (updates.priority !== undefined) {
      sanitized.priority = validateEnum(
        updates.priority,
        VALID_ROADMAP_PRIORITIES,
        'priority',
        current.priority
      );
    }
    if (updates.startDate !== undefined) {
      sanitized.startDate = validateDate(updates.startDate, 'Start date');
    }
    if (updates.targetDate !== undefined) {
      sanitized.targetDate = validateDate(updates.targetDate, 'Target date');
    }

    const nextStart = sanitized.startDate !== undefined ? sanitized.startDate : current.startDate;
    const nextTarget = sanitized.targetDate !== undefined ? sanitized.targetDate : current.targetDate;
    if (nextStart && nextTarget && nextTarget < nextStart) {
      throw new Error('Target date cannot be earlier than the start date.');
    }

    if (updates.productId !== undefined) {
      const product = await resolveOptionalProduct(updates.productId || undefined);
      sanitized.productId = product.id;
      sanitized.productName = product.name;
    }
    if (updates.portfolioId !== undefined) {
      const portfolio = await resolveOptionalPortfolio(updates.portfolioId || undefined);
      sanitized.portfolioId = portfolio.id;
      sanitized.portfolioName = portfolio.name;
    }
    if (updates.projectId !== undefined) {
      const project = await resolveOptionalProject(updates.projectId || undefined);
      sanitized.projectId = project.id;
      sanitized.projectName = project.name;
    }
    if (updates.ownerId !== undefined) {
      const owner = await resolveOptionalOwner(updates.ownerId || undefined);
      sanitized.ownerId = owner.id;
      sanitized.ownerName = owner.name;
    }

    sanitized.updatedBy = actor?.id || current.updatedBy;

    const updated = await RoadmapRepository.update(id, sanitized);
    if (!updated) return null;

    const statusChanged = updates.status !== undefined && updated.status !== current.status;

    await ActivityService.logActivity({
      entityType: 'roadmap',
      entityId: id,
      action: statusChanged ? 'status_change' : 'update',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'System',
      details: statusChanged
        ? { code: updated.code, from: current.status, to: updated.status }
        : { code: updated.code, updatedFields: Object.keys(updates) },
    });

    return this.withDerivedProgress(updated);
  },

  async deleteItem(id: string, actor?: RoadmapActor): Promise<boolean> {
    const current = await RoadmapRepository.findById(id);
    if (!current) return false;

    const deleted = await RoadmapRepository.delete(id);
    if (!deleted) return false;

    // Remove goal alignments so the junction is not left holding orphan edges.
    const removedLinks = await GovernanceLinkRepository.removeLinksFor(LINK_SOURCE, id);

    await ActivityService.logActivity({
      entityType: 'roadmap',
      entityId: id,
      action: 'delete',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'System',
      details: { code: current.code, name: current.name, removedGoalLinks: removedLinks },
    });

    return true;
  },

  /**
   * Applies a new display order. Entries are validated before any write so a
   * malformed batch cannot leave the list half-reordered.
   */
  async reorderItems(
    entries: Array<{ id: string; sequence: number }>,
    actor?: RoadmapActor
  ): Promise<{ applied: number; skipped: number }> {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('Reorder requires a non-empty list of items.');
    }

    for (const entry of entries) {
      if (!entry || typeof entry.id !== 'string' || entry.id.trim() === '') {
        throw new Error('Each reorder entry requires an item id.');
      }
      if (!Number.isFinite(entry.sequence) || entry.sequence < 0) {
        throw new Error(`Invalid sequence for item '${entry.id}'. Sequence must be a non-negative number.`);
      }
    }

    const applied = await RoadmapRepository.reorder(entries);

    await ActivityService.logActivity({
      entityType: 'roadmap',
      entityId: 'roadmap-order',
      action: 'reorder',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'System',
      details: { requested: entries.length, applied },
    });

    return { applied, skipped: entries.length - applied };
  },
};
