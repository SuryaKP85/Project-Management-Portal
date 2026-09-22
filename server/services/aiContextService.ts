import { UserRole, Project, Risk, Issue, Dependency, Goal, RoadmapItem, GovernanceLink } from '../models/types';
import { ProjectRepository } from '../repositories/projectRepository';
import { RiskRepository } from '../repositories/riskRepository';
import { IssueRepository } from '../repositories/issueRepository';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { NotificationRepository } from '../repositories/notificationRepository';
import { RoadmapRepository } from '../repositories/roadmapRepository';
import { GoalRepository } from '../repositories/goalRepository';
import { GovernanceLinkRepository } from '../repositories/governanceLinkRepository';
import { MyWorkService } from './myWorkService';
import { ProjectHealthService, ProjectHealthResult, HEALTH_MODEL_VERSION } from './projectHealthService';

/**
 * Sprint 7A (Step 2) — server-side authorised AI context.
 *
 * The client supplies a question; this service decides what the model is
 * allowed to see. Context is built from the authenticated user's id and role
 * and is never influenced by the request body.
 *
 * Two properties are enforced here:
 *
 *  1. MINIMISATION — context is assembled from an explicit field whitelist and
 *     hard item caps. Records are never spread wholesale, so a future column
 *     added to a repository cannot silently start reaching an AI provider.
 *
 *  2. RELEVANCE SCOPING — read-only roles receive only their own work and the
 *     projects they are actually associated with. Management roles additionally
 *     receive aggregate governance counters for the projects in their scope.
 *
 * Note on the current authorisation model: every GET route in this application
 * is guarded by authenticateToken alone, with no row-level filtering, so any
 * authenticated user can already read these records through the REST API. This
 * service is therefore data minimisation and defence in depth — it is strictly
 * narrower than existing read access, and deliberately so. It is not a
 * substitute for row-level authorisation, which does not exist yet.
 */

export type AiContextScope = 'personal' | 'managed' | 'organisation';

export interface AiContextActor {
  userId: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * Compact, AI-oriented projection of a ProjectHealthService result.
 *
 * This is a DERIVED signal, not a prediction: it is produced by deterministic
 * application logic in projectHealthService, so the same inputs always yield the
 * same score. `basis` states that explicitly so the value is never presented to
 * a model — or a reader — as something the AI estimated.
 *
 * Only a summary is carried here; the full payload with every factor remains
 * available from GET /api/v1/projects/:id/health.
 */
export interface AiContextProjectHealth {
  basis: 'deterministic-calculation';
  score: number;
  band: string;
  /** Largest penalties first, capped — the reasons the score is not 100. */
  topNegativeFactors: Array<{
    id: string;
    label: string;
    value: number | string | null;
    impact: number;
  }>;
  includedFactorCount: number;
  /**
   * How much of the model was evaluable. Carried so a model reading this
   * context can qualify the score rather than treat it as complete.
   */
  coverage: {
    measuredFactors: number;
    applicableFactors: number;
    percentage: number;
  };
  /** Factor ids that could not be measured server-side, so gaps are visible. */
  unavailableFactors: string[];
  /** Health-specific signals not already present elsewhere in the context. */
  signals: {
    scheduleLagPct: number | null;
    daysRemaining: number | null;
    blockedStories: number;
    storiesAwaitingQa: number;
  };
}

/**
 * Sprint 9.5D — strategic alignment, as RETRIEVED FACTS.
 *
 * The chain is Goal <- GovernanceLink(roadmap -> goal) <- RoadmapItem.projectId
 * <- Project, read straight from the repositories. Nothing here is inferred:
 * portfolio-based goal guesses are deliberately excluded, and goals are only
 * ever reached through a roadmap initiative, never attached to a project
 * directly. `basis` states that so a model cannot present it as its own
 * deduction. Roadmap status is carried exactly as stored; no delay or schedule
 * state is derived in this layer.
 */
export interface AiContextGoal {
  id: string;
  objective: string;
  status: string;
  progress: number;
  dueDate?: string;
}

export interface AiContextInitiative {
  code: string;
  name: string;
  status: string;
  priority: string;
  targetDate?: string;
  goals: AiContextGoal[];
}

export interface AiContextProjectStrategy {
  basis: 'retrieved-relationship';
  /**
   * CHARTER alignment, read from RoadmapItem.projectId: 'aligned' means at
   * least one roadmap initiative is chartered as this project; 'none' means no
   * initiative points at it. It says nothing about Goal links — an 'aligned'
   * project may carry initiatives whose `goals` arrays are empty. This is a
   * different notion from the Portfolios UI, where "alignment" means the
   * Goal <-> RoadmapItem links themselves.
   */
  alignment: 'aligned' | 'none';
  initiatives: AiContextInitiative[];
  /** True when this project's initiatives or their goals were capped. */
  truncated: boolean;
}

export interface AiContextProject {
  code: string;
  name: string;
  status: string;
  risk: string;
  progress: number;
  endDate?: string;
  sprint?: string;
  /** Management scope only. */
  budget?: number;
  /** Management scope only. */
  client?: string;
  /** Deterministic health for this project; see AiContextProjectHealth. */
  health?: AiContextProjectHealth;
  /** Always present, so "no alignment" is stated rather than absent. */
  strategy: AiContextProjectStrategy;
}

export interface AiContextWorkItem {
  code: string;
  title: string;
  type: 'story' | 'task';
  status: string;
  priority: string;
  dueDate?: string;
}

export interface AiGovernanceSummary {
  openRisks: number;
  criticalOrHighRisks: number;
  openIssues: number;
  blockedDependencies: number;
}

export interface AiAuthorizedContext {
  user: { name: string; role: UserRole };
  scope: AiContextScope;
  myWork: {
    totalAssigned: number;
    inProgress: number;
    overdue: number;
    items: AiContextWorkItem[];
  };
  projects: AiContextProject[];
  governance?: AiGovernanceSummary;
  unreadNotifications: number;
  meta: {
    generatedAt: string;
    projectsInScope: number;
    projectsIncluded: number;
    workItemsIncluded: number;
    truncated: boolean;
    /** Version of the deterministic health model used for project.health. */
    healthModel: string;
    /** Version of the strategic-context projection used for project.strategy. */
    strategyModel: string;
    strategy: {
      initiativesIncluded: number;
      goalsIncluded: number;
      projectsWithoutAlignment: number;
      truncated: boolean;
      /**
       * Initiatives not yet chartered as a project, so excluded from every
       * project's strategy. A count only, and only for management scopes —
       * the same rule the governance counters follow.
       */
      uncharteredInitiativesExcluded?: number;
    };
  };
}

/** Hard caps. Context is a briefing, not a database dump. */
const MAX_PROJECTS = 8;
const MAX_WORK_ITEMS = 10;

/** Most impactful penalties carried per project; keeps the context small. */
const MAX_HEALTH_FACTORS = 3;

/** Strategic caps, per project and per initiative respectively. */
const MAX_INITIATIVES_PER_PROJECT = 2;
const MAX_GOALS_PER_INITIATIVE = 3;

export const STRATEGY_MODEL_VERSION = 'v1-governance-links-2026-09';

/**
 * Projects a full health result down to the compact context shape. Health is
 * only ever computed for projects already inside the caller's scope, so this
 * cannot widen visibility.
 */
function toContextHealth(result: ProjectHealthResult): AiContextProjectHealth {
  const topNegativeFactors = result.factors
    .filter((f) => f.included && f.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, MAX_HEALTH_FACTORS)
    .map((f) => ({
      id: f.id,
      label: f.label,
      value: f.value,
      impact: f.delta,
    }));

  return {
    basis: 'deterministic-calculation',
    score: result.score,
    band: result.band,
    topNegativeFactors,
    includedFactorCount: result.meta.includedFactors,
    coverage: {
      measuredFactors: result.coverage.measuredFactors,
      applicableFactors: result.coverage.applicableFactors,
      percentage: result.coverage.percentage,
    },
    unavailableFactors: result.factors.filter((f) => !f.included).map((f) => f.id),
    signals: {
      scheduleLagPct: result.signals.scheduleLagPct,
      daysRemaining: result.signals.daysRemaining,
      blockedStories: result.signals.blockedStories,
      storiesAwaitingQa: result.signals.storiesAwaitingQa,
    },
  };
}

const MANAGEMENT_ROLES: UserRole[] = ['admin', 'project-manager', 'product-manager'];

const OPEN_RISK_STATUSES = new Set(['Identified', 'Assessing', 'Mitigating', 'Monitoring', 'Escalated']);
const OPEN_ISSUE_STATUSES = new Set(['Open', 'Investigating', 'In Progress', 'Blocked']);
const BLOCKED_DEPENDENCY_STATUSES = new Set(['Blocked', 'At Risk']);

export function resolveScope(role: UserRole): AiContextScope {
  if (role === 'admin') return 'organisation';
  if (MANAGEMENT_ROLES.includes(role)) return 'managed';
  return 'personal';
}

/** True when the user manages the project or is listed on its team. */
function isAssociatedWithProject(project: Project, userId: string): boolean {
  if (project.managerId && project.managerId === userId) return true;
  return (project.members || []).some((m) => m.userId === userId);
}

function toContextProject(
  project: Project,
  includeCommercials: boolean,
  strategy: AiContextProjectStrategy
): AiContextProject {
  const base: AiContextProject = {
    code: project.code || project.id,
    name: project.name,
    status: project.status,
    risk: project.risk,
    progress: project.progress,
    endDate: project.endDate,
    sprint: project.sprint,
    strategy,
  };
  // Commercial fields are withheld from read-only roles.
  if (includeCommercials) {
    base.budget = project.budget;
    base.client = project.client;
  }
  return base;
}

/** Explicit whitelist projections; records are never spread. */
function toContextGoal(goal: Goal): AiContextGoal {
  return {
    id: goal.id,
    objective: goal.objective,
    status: goal.status,
    progress: goal.progress,
    dueDate: goal.dueDate,
  };
}

function toContextInitiative(item: RoadmapItem, goals: AiContextGoal[]): AiContextInitiative {
  return {
    code: item.code,
    name: item.name,
    status: item.status,
    priority: item.priority,
    targetDate: item.targetDate,
    goals,
  };
}

const NO_ALIGNMENT: AiContextProjectStrategy = {
  basis: 'retrieved-relationship',
  alignment: 'none',
  initiatives: [],
  truncated: false,
};

interface StrategyBuild {
  byProjectId: Map<string, AiContextProjectStrategy>;
  initiativesIncluded: number;
  goalsIncluded: number;
  truncated: boolean;
  /** Roadmap items with no projectId; counted, never carried. */
  uncharteredCount: number;
}

/**
 * Builds strategy for the already-scoped, already-capped project set from three
 * bulk reads, indexed in memory. Taking includedProjects as input means this
 * inherits the caller's scope and cap exactly as health does — it can never
 * surface a project, initiative or goal the caller could not already see.
 */
async function buildStrategyByProject(includedProjects: Project[]): Promise<StrategyBuild> {
  const [roadmapItems, goals, roadmapLinks] = await Promise.all([
    RoadmapRepository.findAll(), // already ordered by sequence
    GoalRepository.findAll(),
    GovernanceLinkRepository.findBySourceType('roadmap'), // already ordered by createdAt
  ]);

  const goalById = new Map<string, Goal>(goals.map((g) => [g.id, g]));

  // Initiatives grouped by the project they are chartered as. Order within a
  // group follows the repository's sequence ordering.
  const itemsByProjectId = new Map<string, RoadmapItem[]>();
  let uncharteredCount = 0;
  for (const item of roadmapItems) {
    if (!item.projectId) {
      uncharteredCount += 1;
      continue;
    }
    const group = itemsByProjectId.get(item.projectId) || [];
    group.push(item);
    itemsByProjectId.set(item.projectId, group);
  }

  // Goal links grouped by initiative, preserving createdAt order.
  const goalLinksByItemId = new Map<string, GovernanceLink[]>();
  for (const link of roadmapLinks) {
    if (link.targetType !== 'goal') continue;
    const group = goalLinksByItemId.get(link.governanceId) || [];
    group.push(link);
    goalLinksByItemId.set(link.governanceId, group);
  }

  const byProjectId = new Map<string, AiContextProjectStrategy>();
  let initiativesIncluded = 0;
  let goalsIncluded = 0;
  let truncated = false;

  for (const project of includedProjects) {
    const items = itemsByProjectId.get(project.id) || [];
    if (items.length === 0) {
      byProjectId.set(project.id, NO_ALIGNMENT);
      continue;
    }

    let projectTruncated = items.length > MAX_INITIATIVES_PER_PROJECT;
    const initiatives = items.slice(0, MAX_INITIATIVES_PER_PROJECT).map((item) => {
      // A link whose goal no longer exists is dropped, not fabricated.
      const linkedGoals = (goalLinksByItemId.get(item.id) || [])
        .map((link) => goalById.get(link.targetId))
        .filter((g): g is Goal => g !== undefined);
      if (linkedGoals.length > MAX_GOALS_PER_INITIATIVE) projectTruncated = true;
      const contextGoals = linkedGoals.slice(0, MAX_GOALS_PER_INITIATIVE).map(toContextGoal);
      goalsIncluded += contextGoals.length;
      return toContextInitiative(item, contextGoals);
    });

    initiativesIncluded += initiatives.length;
    truncated = truncated || projectTruncated;
    byProjectId.set(project.id, {
      basis: 'retrieved-relationship',
      alignment: 'aligned',
      initiatives,
      truncated: projectTruncated,
    });
  }

  return { byProjectId, initiativesIncluded, goalsIncluded, truncated, uncharteredCount };
}

export const AiContextService = {
  /**
   * Builds the authorised context for a caller. Takes only the authenticated
   * identity — there is deliberately no parameter through which a request body
   * could influence the result.
   */
  async buildContext(actor: AiContextActor): Promise<AiAuthorizedContext> {
    const scope = resolveScope(actor.role);
    const includeCommercials = scope !== 'personal';

    const displayName =
      `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email || actor.userId;

    // 1. The caller's own assigned work, via the existing scoping service.
    const myWork = await MyWorkService.getMyWork(actor.userId);

    const workItems: AiContextWorkItem[] = [
      ...myWork.stories.map((s: any) => ({
        code: s.code || s.id,
        title: s.title,
        type: 'story' as const,
        status: s.status,
        priority: s.priority,
        dueDate: s.dueDate,
      })),
      ...myWork.tasks.map((t: any) => ({
        code: t.code || t.id,
        title: t.title,
        type: 'task' as const,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
      })),
    ];

    // 2. Projects in scope.
    const allProjects = await ProjectRepository.findAll();

    // Projects the caller works on, inferred from their own assignments.
    const projectIdsFromWork = new Set<string>(
      [...myWork.stories, ...myWork.tasks]
        .map((item: any) => item.projectId)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    );

    let scopedProjects: Project[];
    if (scope === 'organisation') {
      scopedProjects = allProjects;
    } else {
      scopedProjects = allProjects.filter(
        (p) => isAssociatedWithProject(p, actor.userId) || projectIdsFromWork.has(p.id)
      );
    }

    const projectsInScope = scopedProjects.length;
    const includedProjects = scopedProjects.slice(0, MAX_PROJECTS);
    const includedWorkItems = workItems.slice(0, MAX_WORK_ITEMS);

    // 2b. Deterministic health, computed ONLY for the already-scoped and
    // already-capped projects. Deriving it from includedProjects means health
    // inherits the scope and the cap rather than re-deriving either, so it can
    // never surface a project the caller could not already see.
    const healthResults = await Promise.all(
      includedProjects.map((p) => ProjectHealthService.computeHealth(p))
    );
    const healthByProjectId = new Map(
      healthResults.map((result) => [result.projectId, toContextHealth(result)])
    );

    // 2c. Strategic alignment, likewise derived ONLY from includedProjects.
    const strategy = await buildStrategyByProject(includedProjects);
    const projectsWithoutAlignment = includedProjects.filter(
      (p) => (strategy.byProjectId.get(p.id) || NO_ALIGNMENT).alignment === 'none'
    ).length;

    const context: AiAuthorizedContext = {
      user: { name: displayName, role: actor.role },
      scope,
      myWork: {
        totalAssigned: myWork.summary.totalAssigned,
        inProgress: myWork.summary.inProgress,
        overdue: myWork.summary.overdue,
        items: includedWorkItems,
      },
      projects: includedProjects.map((p) => {
        const contextProject = toContextProject(
          p,
          includeCommercials,
          strategy.byProjectId.get(p.id) || NO_ALIGNMENT
        );
        const health = healthByProjectId.get(p.id);
        if (health) contextProject.health = health;
        return contextProject;
      }),
      unreadNotifications: (await NotificationRepository.findByUserId(actor.userId, true)).length,
      meta: {
        generatedAt: new Date().toISOString(),
        projectsInScope,
        projectsIncluded: includedProjects.length,
        workItemsIncluded: includedWorkItems.length,
        truncated:
          projectsInScope > includedProjects.length ||
          workItems.length > includedWorkItems.length ||
          strategy.truncated,
        healthModel: HEALTH_MODEL_VERSION,
        strategyModel: STRATEGY_MODEL_VERSION,
        strategy: {
          initiativesIncluded: strategy.initiativesIncluded,
          goalsIncluded: strategy.goalsIncluded,
          projectsWithoutAlignment,
          truncated: strategy.truncated,
          // Withheld from personal scope, like every other organisation-wide count.
          ...(scope !== 'personal' ? { uncharteredInitiativesExcluded: strategy.uncharteredCount } : {}),
        },
      },
    };

    // 3. Aggregate governance counters — management scopes only, and only ever
    //    counts, never the underlying records.
    if (scope !== 'personal') {
      context.governance = await buildGovernanceSummary(scopedProjects, scope);
    }

    return context;
  },
};

async function buildGovernanceSummary(
  scopedProjects: Project[],
  scope: AiContextScope
): Promise<AiGovernanceSummary> {
  const [risks, issues, dependencies] = await Promise.all([
    RiskRepository.findAll(),
    IssueRepository.findAll(),
    DependencyRepository.findAll(),
  ]);

  const inScope = (projectId?: string) => {
    if (scope === 'organisation') return true;
    if (!projectId) return false;
    return scopedProjects.some((p) => p.id === projectId || p.code === projectId);
  };

  const scopedRisks = risks.filter((r: Risk) => inScope(r.projectId));
  const scopedIssues = issues.filter((i: Issue) => inScope(i.projectId));
  const scopedDependencies = dependencies.filter((d: Dependency) => inScope(d.projectId));

  return {
    openRisks: scopedRisks.filter((r) => OPEN_RISK_STATUSES.has(r.status)).length,
    criticalOrHighRisks: scopedRisks.filter(
      (r) => OPEN_RISK_STATUSES.has(r.status) && (r.severity === 'Critical' || r.severity === 'High')
    ).length,
    openIssues: scopedIssues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status)).length,
    blockedDependencies: scopedDependencies.filter((d) => BLOCKED_DEPENDENCY_STATUSES.has(d.status)).length,
  };
}
