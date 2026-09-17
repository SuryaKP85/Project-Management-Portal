import { UserRole, Project, Risk, Issue, Dependency } from '../models/types';
import { ProjectRepository } from '../repositories/projectRepository';
import { RiskRepository } from '../repositories/riskRepository';
import { IssueRepository } from '../repositories/issueRepository';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { NotificationRepository } from '../repositories/notificationRepository';
import { MyWorkService } from './myWorkService';

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
  };
}

/** Hard caps. Context is a briefing, not a database dump. */
const MAX_PROJECTS = 8;
const MAX_WORK_ITEMS = 10;

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

function toContextProject(project: Project, includeCommercials: boolean): AiContextProject {
  const base: AiContextProject = {
    code: project.code || project.id,
    name: project.name,
    status: project.status,
    risk: project.risk,
    progress: project.progress,
    endDate: project.endDate,
    sprint: project.sprint,
  };
  // Commercial fields are withheld from read-only roles.
  if (includeCommercials) {
    base.budget = project.budget;
    base.client = project.client;
  }
  return base;
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

    const context: AiAuthorizedContext = {
      user: { name: displayName, role: actor.role },
      scope,
      myWork: {
        totalAssigned: myWork.summary.totalAssigned,
        inProgress: myWork.summary.inProgress,
        overdue: myWork.summary.overdue,
        items: includedWorkItems,
      },
      projects: includedProjects.map((p) => toContextProject(p, includeCommercials)),
      unreadNotifications: (await NotificationRepository.findByUserId(actor.userId, true)).length,
      meta: {
        generatedAt: new Date().toISOString(),
        projectsInScope,
        projectsIncluded: includedProjects.length,
        workItemsIncluded: includedWorkItems.length,
        truncated: projectsInScope > includedProjects.length || workItems.length > includedWorkItems.length,
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
