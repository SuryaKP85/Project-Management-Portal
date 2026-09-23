import {
  Project,
  Product,
  Goal,
  RoadmapItem,
  GovernanceLink,
  ActivityLog,
  UserRole,
  ProjectStatus,
  ProjectRisk,
  GoalStatus,
  RoadmapStatus,
  ExecutiveOverview,
  ExecutiveOverviewFilter,
  ExecutiveProjectRollup,
  ExecutiveHealthRollup,
  ExecutiveStrategySummary,
  ExecutiveGovernanceSummary,
  ExecutiveActivityEntry,
  ExecutivePortfolioNode,
} from '../models/types';
import { ProjectRepository } from '../repositories/projectRepository';
import { PortfolioRepository } from '../repositories/portfolioRepository';
import { ProductRepository } from '../repositories/productRepository';
import { GoalRepository } from '../repositories/goalRepository';
import { RoadmapRepository } from '../repositories/roadmapRepository';
import { GovernanceLinkRepository } from '../repositories/governanceLinkRepository';
import { RiskRepository } from '../repositories/riskRepository';
import { IssueRepository } from '../repositories/issueRepository';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { MilestoneRepository } from '../repositories/milestoneRepository';
import { ReleaseRepository } from '../repositories/releaseRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import {
  ProjectHealthService,
  ProjectHealthResult,
  HealthBand,
  HEALTH_MODEL_VERSION,
} from './projectHealthService';
import { VALID_ROADMAP_STATUSES } from './roadmapService';

/**
 * Sprint 11.1A — executive overview, a READ-ONLY aggregate.
 *
 * Every number here is counted or averaged from canonical records fetched in
 * one bulk pass. Health is taken verbatim from ProjectHealthService — this
 * module never scores a project itself and never treats the stored
 * Portfolio.health / Product.health enums as derived health (they are echoed
 * only as `declaredHealth`). The same pure `summariseProjects` helper is applied
 * at every level of Portfolio -> Product -> Project, so a future Program level
 * slots in as one more grouping without new arithmetic.
 */

/** Canonical vocabularies, so every Record carries every key even when zero. */
export const PROJECT_STATUSES: ProjectStatus[] = [
  'planning',
  'in-progress',
  'awaiting-sow-sign-off',
  'on-hold',
  'completed',
  'archived',
];
export const PROJECT_RISKS: ProjectRisk[] = ['Low', 'Medium', 'High', 'Critical'];
const GOAL_STATUSES: GoalStatus[] = ['not-started', 'in-progress', 'achieved', 'missed'];
const HEALTH_BANDS: HealthBand[] = ['Excellent', 'Healthy', 'Monitor', 'At Risk', 'Critical'];

/** Roles that may see budget figures; mirrors the AI context's commercial gating. */
export const EXECUTIVE_COMMERCIAL_ROLES: UserRole[] = ['admin', 'project-manager', 'product-manager'];

/**
 * Upper bound on projects scored per request. Health is computed for the whole
 * scope up to this bound; beyond it the aggregate is flagged incomplete rather
 * than pretending a partial average is the scope's health.
 */
export const MAX_HEALTH_PROJECTS = 200;

const RECENT_ACTIVITY_LIMIT = 10;
const ACTIVITY_SCAN_LIMIT = 50;
const STRATEGIC_ACTIVITY_TYPES = new Set(['portfolio', 'product', 'project', 'goal', 'roadmap']);

// Governance predicates mirror the ones already used by the AI governance
// counters and GovernanceService, so executives and the assistant agree.
const OPEN_RISK_STATUSES = new Set(['Identified', 'Assessing', 'Mitigating', 'Monitoring', 'Escalated']);
const OPEN_ISSUE_STATUSES = new Set(['Open', 'Investigating', 'In Progress', 'Blocked']);
const BLOCKED_DEPENDENCY_STATUSES = new Set(['Blocked', 'At Risk']);
const MILESTONE_AT_RISK_HEALTH = new Set(['At Risk', 'Critical']);
const RELEASE_AT_RISK_HEALTH = new Set(['At Risk', 'Off Track']);

/** Thrown when a requested scope id does not resolve; the controller maps it to 404. */
export class ExecutiveScopeNotFoundError extends Error {
  constructor(public readonly entity: 'portfolio' | 'product', message: string) {
    super(message);
    this.name = 'ExecutiveScopeNotFoundError';
  }
}

export interface ExecutiveOverviewOptions {
  /** Test seam for the health bound; production callers leave it unset. */
  maxHealthProjects?: number;
  /** Reference time, injectable for reproducible tests. */
  now?: Date;
}

function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  const record = {} as Record<K, number>;
  for (const key of keys) record[key] = 0;
  return record;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Pure rollup over one project set. Health results are looked up, never
 * computed: a project absent from `healthByProjectId` simply was not scored,
 * and the rollup says so through `complete` and `computedFor`.
 */
export function summariseProjects(
  projects: Project[],
  healthByProjectId: Map<string, ProjectHealthResult>,
  includeCommercials: boolean
): ExecutiveProjectRollup {
  const byStatus = zeroRecord(PROJECT_STATUSES) as Record<string, number>;
  const byRisk = zeroRecord(PROJECT_RISKS) as Record<string, number>;
  for (const p of projects) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    byRisk[p.risk] = (byRisk[p.risk] ?? 0) + 1;
  }

  const scored = projects.map((p) => healthByProjectId.get(p.id)).filter((r): r is ProjectHealthResult => !!r);
  const byBand = zeroRecord(HEALTH_BANDS) as Record<string, number>;
  let scoreSum = 0;
  for (const r of scored) {
    byBand[r.band] = (byBand[r.band] ?? 0) + 1;
    scoreSum += r.score;
  }
  const complete = scored.length === projects.length;
  const health: ExecutiveHealthRollup = {
    // A partial average is never reported as the scope's health.
    averageScore: complete && scored.length > 0 ? round1(scoreSum / scored.length) : null,
    byBand,
    computedFor: scored.length,
    complete,
  };

  const rollup: ExecutiveProjectRollup = {
    total: projects.length,
    byStatus: byStatus as Record<ProjectStatus, number>,
    byRisk: byRisk as Record<ProjectRisk, number>,
    health,
    progress: {
      average:
        projects.length > 0
          ? round1(projects.reduce((sum, p) => sum + (Number(p.progress) || 0), 0) / projects.length)
          : null,
    },
  };
  if (includeCommercials) {
    rollup.budget = { total: projects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0) };
  }
  return rollup;
}

export const ExecutiveDashboardService = {
  async getOverview(
    filter: ExecutiveOverviewFilter,
    actor: { role: UserRole },
    options: ExecutiveOverviewOptions = {}
  ): Promise<ExecutiveOverview> {
    const includeCommercials = EXECUTIVE_COMMERCIAL_ROLES.includes(actor.role);
    const maxHealthProjects = options.maxHealthProjects ?? MAX_HEALTH_PROJECTS;
    const now = options.now ?? new Date();
    const filtered = !!(filter.portfolioId || filter.productId);

    // One bulk pass; nothing below reads a repository per item.
    const [projects, portfolios, products, goals, roadmapItems, roadmapLinks, risks, issues, dependencies, milestones, releases, activities] =
      await Promise.all([
        ProjectRepository.findAll(),
        PortfolioRepository.findAll(),
        ProductRepository.findAll(),
        GoalRepository.findAll(),
        RoadmapRepository.findAll(),
        GovernanceLinkRepository.findBySourceType('roadmap'),
        RiskRepository.findAll(),
        IssueRepository.findAll(),
        DependencyRepository.findAll(),
        MilestoneRepository.findAll(),
        ReleaseRepository.findAll(),
        ActivityRepository.findRecent(ACTIVITY_SCAN_LIMIT),
      ]);

    // Scope resolution: unknown ids are a 404 concern, surfaced as a typed error.
    const portfolio = filter.portfolioId ? portfolios.find((pf) => pf.id === filter.portfolioId) : undefined;
    if (filter.portfolioId && !portfolio) {
      throw new ExecutiveScopeNotFoundError('portfolio', 'Portfolio not found');
    }
    const product = filter.productId ? products.find((pr) => pr.id === filter.productId) : undefined;
    if (filter.productId && !product) {
      throw new ExecutiveScopeNotFoundError('product', 'Product not found');
    }
    if (portfolio && product && product.portfolioId !== portfolio.id) {
      throw new ExecutiveScopeNotFoundError('product', 'Product not found in the requested portfolio');
    }

    const productById = new Map<string, Product>(products.map((pr) => [pr.id, pr]));
    // A project's portfolio is its own stored portfolioId, falling back to the
    // stored portfolioId of its product — both canonical fields, no inference.
    const portfolioOf = (p: Project): string | undefined =>
      p.portfolioId || (p.productId ? productById.get(p.productId)?.portfolioId : undefined);

    const scopedProjects = projects.filter(
      (p) =>
        (!filter.portfolioId || portfolioOf(p) === filter.portfolioId) &&
        (!filter.productId || p.productId === filter.productId)
    );
    const scopedProjectIds = new Set(scopedProjects.map((p) => p.id));
    const scopedProjectCodes = new Set(scopedProjects.map((p) => p.code).filter(Boolean));

    // Health: reuse ProjectHealthService exactly, for the whole scope up to the bound.
    const toScore = scopedProjects.slice(0, maxHealthProjects);
    const healthResults = await Promise.all(toScore.map((p) => ProjectHealthService.computeHealth(p, { now })));
    const healthByProjectId = new Map<string, ProjectHealthResult>(healthResults.map((r) => [r.projectId, r]));

    const overallRollup = summariseProjects(scopedProjects, healthByProjectId, includeCommercials);

    // Portfolio -> Product -> Project, the same helper at each level.
    const portfolioNodes: ExecutivePortfolioNode[] = (portfolio ? [portfolio] : portfolios).map((pf) => {
      const portfolioProjects = scopedProjects.filter((p) => portfolioOf(p) === pf.id);
      const portfolioProducts = products.filter(
        (pr) => pr.portfolioId === pf.id && (!filter.productId || pr.id === filter.productId)
      );
      return {
        id: pf.id,
        code: pf.code,
        name: pf.name,
        status: pf.status,
        declaredHealth: pf.health,
        rollup: summariseProjects(portfolioProjects, healthByProjectId, includeCommercials),
        products: portfolioProducts.map((pr) => ({
          id: pr.id,
          code: pr.code,
          name: pr.name,
          status: pr.status,
          rollup: summariseProjects(
            portfolioProjects.filter((p) => p.productId === pr.id),
            healthByProjectId,
            includeCommercials
          ),
        })),
      };
    });

    return {
      scope: {
        ...(filter.portfolioId ? { portfolioId: filter.portfolioId } : {}),
        ...(filter.productId ? { productId: filter.productId } : {}),
        projectsInScope: scopedProjects.length,
        projectsWithoutPortfolio: scopedProjects.filter((p) => !portfolioOf(p)).length,
      },
      projects: overallRollup,
      portfolios: portfolioNodes,
      strategy: summariseStrategy(filter, filtered, scopedProjects, scopedProjectIds, goals, roadmapItems, roadmapLinks),
      governance: summariseGovernance(
        filtered,
        scopedProjectIds,
        scopedProjectCodes,
        { risks, issues, dependencies, milestones, releases },
        now
      ),
      recentActivity: summariseActivity(activities, filtered, {
        projectIds: scopedProjectIds,
        projectCodes: scopedProjectCodes,
        portfolioIds: new Set(portfolioNodes.map((n) => n.id)),
        productIds: new Set(portfolioNodes.flatMap((n) => n.products.map((pr) => pr.id))),
      }),
      meta: {
        generatedAt: now.toISOString(),
        healthModel: HEALTH_MODEL_VERSION,
        healthComputedFor: healthResults.length,
        healthComplete: overallRollup.health.complete,
        commercialsIncluded: includeCommercials,
        basis: 'deterministic-aggregation',
      },
    };
  },
};

function summariseStrategy(
  filter: ExecutiveOverviewFilter,
  filtered: boolean,
  scopedProjects: Project[],
  scopedProjectIds: Set<string>,
  goals: Goal[],
  roadmapItems: RoadmapItem[],
  roadmapLinks: GovernanceLink[]
): ExecutiveStrategySummary {
  const matchesFilter = (portfolioId?: string, productId?: string) =>
    (!filter.portfolioId || portfolioId === filter.portfolioId) && (!filter.productId || productId === filter.productId);

  const scopedGoals = filtered ? goals.filter((g) => matchesFilter(g.portfolioId, g.productId)) : goals;
  // A chartered initiative follows its project; an unchartered one is scoped by its own stored ids.
  const scopedItems = filtered
    ? roadmapItems.filter((i) =>
        i.projectId ? scopedProjectIds.has(i.projectId) : matchesFilter(i.portfolioId, i.productId)
      )
    : roadmapItems;

  const goalCounts = zeroRecord(GOAL_STATUSES) as Record<string, number>;
  for (const g of scopedGoals) goalCounts[g.status] = (goalCounts[g.status] ?? 0) + 1;

  const initiativeCounts = zeroRecord(VALID_ROADMAP_STATUSES) as Record<string, number>;
  for (const i of scopedItems) initiativeCounts[i.status] = (initiativeCounts[i.status] ?? 0) + 1;

  const charteredProjectIds = new Set(scopedItems.map((i) => i.projectId).filter((id): id is string => !!id));
  const goalLinkCountByItem = new Map<string, number>();
  for (const link of roadmapLinks) {
    if (link.targetType !== 'goal') continue;
    goalLinkCountByItem.set(link.governanceId, (goalLinkCountByItem.get(link.governanceId) ?? 0) + 1);
  }

  return {
    goals: goalCounts as Record<GoalStatus, number>,
    goalsTotal: scopedGoals.length,
    initiatives: initiativeCounts as Record<RoadmapStatus, number>,
    initiativesTotal: scopedItems.length,
    charteredInitiatives: scopedItems.filter((i) => !!i.projectId).length,
    uncharteredInitiatives: scopedItems.filter((i) => !i.projectId).length,
    projectsWithoutInitiative: scopedProjects.filter((p) => !charteredProjectIds.has(p.id)).length,
    initiativesWithoutGoal: scopedItems.filter((i) => (goalLinkCountByItem.get(i.id) ?? 0) === 0).length,
  };
}

function summariseGovernance(
  filtered: boolean,
  scopedProjectIds: Set<string>,
  scopedProjectCodes: Set<string>,
  records: {
    risks: Array<{ projectId?: string; status: string; severity: string }>;
    issues: Array<{ projectId?: string; status: string }>;
    dependencies: Array<{ projectId?: string; status: string }>;
    milestones: Array<{ projectId?: string; status: string; health: string; targetDate: string }>;
    releases: Array<{ projectId?: string; status: string; health: string }>;
  },
  now: Date
): ExecutiveGovernanceSummary {
  // Unfiltered = the whole organisation, as the AI governance counters do;
  // filtered = only records attached to an in-scope project.
  const inScope = (projectId?: string) =>
    !filtered || (!!projectId && (scopedProjectIds.has(projectId) || scopedProjectCodes.has(projectId)));
  const todayStr = now.toISOString().split('T')[0];

  const openRisks = records.risks.filter((r) => inScope(r.projectId) && OPEN_RISK_STATUSES.has(r.status));
  const openIssues = records.issues.filter((i) => inScope(i.projectId) && OPEN_ISSUE_STATUSES.has(i.status));
  const milestones = records.milestones.filter((m) => inScope(m.projectId));
  const releases = records.releases.filter((r) => inScope(r.projectId));

  return {
    openRisks: openRisks.length,
    criticalOrHighRisks: openRisks.filter((r) => r.severity === 'Critical' || r.severity === 'High').length,
    openIssues: openIssues.length,
    blockingDependencies: records.dependencies.filter(
      (d) => inScope(d.projectId) && BLOCKED_DEPENDENCY_STATUSES.has(d.status)
    ).length,
    atRiskMilestones: milestones.filter((m) => m.status !== 'Completed' && MILESTONE_AT_RISK_HEALTH.has(m.health)).length,
    upcomingMilestones: milestones.filter(
      (m) => m.status !== 'Completed' && m.status !== 'Cancelled' && m.targetDate >= todayStr
    ).length,
    activeReleases: releases.filter((r) => r.status !== 'Released' && r.status !== 'Cancelled').length,
    atRiskReleases: releases.filter((r) => r.status !== 'Released' && RELEASE_AT_RISK_HEALTH.has(r.health)).length,
  };
}

function summariseActivity(
  activities: ActivityLog[],
  filtered: boolean,
  scope: { projectIds: Set<string>; projectCodes: Set<string>; portfolioIds: Set<string>; productIds: Set<string> }
): ExecutiveActivityEntry[] {
  const inScope = (a: ActivityLog) =>
    !filtered ||
    scope.projectIds.has(a.entityId) ||
    scope.projectCodes.has(a.entityId) ||
    scope.portfolioIds.has(a.entityId) ||
    scope.productIds.has(a.entityId);

  return activities
    .filter((a) => STRATEGIC_ACTIVITY_TYPES.has(a.entityType) && inScope(a))
    .slice(0, RECENT_ACTIVITY_LIMIT)
    .map((a) => {
      const label = a.details?.code || a.details?.name || a.details?.objective || a.entityId;
      return {
        id: a.id,
        entityType: a.entityType,
        entityId: a.entityId,
        action: a.action,
        actorName: a.actorName,
        createdAt: a.createdAt,
        summary: `${a.action} ${a.entityType} ${label}`,
      };
    });
}
