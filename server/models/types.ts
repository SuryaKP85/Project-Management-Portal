export type UserRole = 'admin' | 'project-manager' | 'product-manager' | 'team-member' | 'viewer';

export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl?: string;
  department?: string;
  title?: string;
  msUserId?: string;
  msTenantId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface TeamMember {
  userId: string;
  userName: string;
  userEmail?: string;
  roleInTeam: string;
  allocatedHrs?: number;
}

export interface Team {
  id: string;
  name: string;
  department: string;
  leadId?: string;
  leadName?: string;
  capacityHrs: number;
  allocatedHrs?: number;
  memberCount: number;
  members?: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export type PortfolioStatus = 'active' | 'planning' | 'archived';
/**
 * Sprint 11.2B — declared health, shared by Portfolio and Product.
 *
 * A hand-entered status, distinct from the computed ProjectHealthService
 * model. One vocabulary for both entities: it is what the UI has always
 * written and rendered, and 'critical' — the only value with a side effect
 * (owner notification) — is preserved verbatim.
 */
export type DeclaredHealth = 'healthy' | 'at-risk' | 'critical';
export type PortfolioHealth = DeclaredHealth;

export const DECLARED_HEALTH_VALUES: readonly DeclaredHealth[] = ['healthy', 'at-risk', 'critical'];

/**
 * Deprecated compatibility aliases from the pre-11.2B unions. Normalised on
 * write (so they are never stored again) and on read (so rows that already
 * hold them present canonically without a database rewrite).
 */
export const DECLARED_HEALTH_LEGACY_ALIASES: Readonly<Record<string, DeclaredHealth>> = {
  caution: 'at-risk',
  'on-track': 'healthy',
};

/** Canonical value for a canonical or legacy input; undefined for anything else. */
export function normalizeDeclaredHealth(value: unknown): DeclaredHealth | undefined {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim().toLowerCase();
  if ((DECLARED_HEALTH_VALUES as readonly string[]).includes(candidate)) return candidate as DeclaredHealth;
  return DECLARED_HEALTH_LEGACY_ALIASES[candidate];
}

/** Error shaped for the global errorHandler: the existing 400 validation envelope. */
export function invalidDeclaredHealthError(entity: 'portfolio' | 'product', value: unknown): Error {
  const err = new Error(
    `Invalid ${entity} health '${String(value)}'. Allowed values: ${DECLARED_HEALTH_VALUES.join(', ')}.`
  ) as Error & { status: number; code: string };
  err.status = 400;
  err.code = 'VALIDATION_ERROR';
  return err;
}

export interface Portfolio {
  id: string;
  code: string;
  name: string;
  description: string;
  ownerId?: string;
  ownerName?: string;
  status: PortfolioStatus;
  health: PortfolioHealth;
  productCount?: number;
  projectCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductStatus = 'discovery' | 'in-development' | 'ga' | 'maintenance' | 'deprecated';
/** Same declared-health vocabulary as Portfolio; see DeclaredHealth. */
export type ProductHealth = DeclaredHealth;

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  status: ProductStatus;
  health?: ProductHealth;
  ownerId?: string;
  ownerName?: string;
  teamId?: string;
  teamName?: string;
  category?: string;
  targetAudience?: string;
  vision?: string;
  strategicObjective?: string;
  startDate?: string;
  targetDate?: string;
  portfolioId?: string;
  portfolioName?: string;
  targetRelease?: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalStatus = 'not-started' | 'in-progress' | 'achieved' | 'missed';

export interface Goal {
  id: string;
  objective: string;
  description: string;
  ownerId?: string;
  ownerName?: string;
  status: GoalStatus;
  targetValue: number;
  currentValue: number;
  progress: number; // 0 - 100
  unit?: string;
  dueDate?: string;
  portfolioId?: string;
  portfolioName?: string;
  productId?: string;
  productName?: string;
  createdAt: string;
  updatedAt: string;
}

// ====================================================================
// Sprint 9: Roadmap
// ====================================================================

/**
 * Commitment vocabulary for roadmap initiatives. Deliberately separate from
 * DeliveryStatus, which is execution vocabulary: overloading that union would
 * put roadmap rows into the delivery board, backlog and burndown queries.
 */
export type RoadmapStatus =
  | 'proposed'
  | 'committed'
  | 'in-progress'
  | 'shipped'
  | 'deferred'
  | 'cancelled';

/**
 * A strategic initiative: what we intend to do and roughly when. Sits beside
 * Goal as a sibling of the Product, not as a new hierarchy level.
 *
 * Unlike Epic, every association is optional — an initiative exists before a
 * project is chartered, which is precisely what distinguishes the two. Priority
 * reuses DeliveryPriority rather than defining a parallel union.
 *
 * Progress is deliberately NOT stored here. It is derived at read time from the
 * linked project's canonical progress, and is null when no project is linked;
 * see RoadmapService.withDerivedProgress.
 */
export interface RoadmapItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: RoadmapStatus;
  priority: DeliveryPriority;
  startDate?: string;
  targetDate?: string;
  ownerId?: string;
  ownerName?: string;
  productId?: string;
  productName?: string;
  portfolioId?: string;
  portfolioName?: string;
  /** Set once the initiative is chartered as a project; null while proposed. */
  projectId?: string;
  projectName?: string;
  /** Ascending display order, following the existing backlogOrder pattern. */
  sequence: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * A roadmap item enriched with read-time derived values. `progress` is null
 * when the item has no linked project, so "not yet measurable" is never
 * conflated with "0% complete".
 */
export interface RoadmapItemWithProgress extends RoadmapItem {
  progress: number | null;
  progressSource: 'linked-project' | 'unavailable';
}

export type ProjectStatus = 'planning' | 'in-progress' | 'awaiting-sow-sign-off' | 'on-hold' | 'completed' | 'archived';
export type ProjectRisk = 'Low' | 'Medium' | 'High' | 'Critical';

export interface ProjectTeamMember {
  userId?: string;
  name: string;
  role: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
  managerId?: string;
  managerName?: string;
  teamId?: string;
  teamName?: string;
  members?: ProjectTeamMember[];
  status: ProjectStatus;
  risk: ProjectRisk;
  progress: number;
  budget: number;
  sprint?: string;
  startDate?: string;
  endDate?: string;
  productId?: string;
  productName?: string;
  portfolioId?: string;
  portfolioName?: string;
  sowStatus?: string;
  poc?: string;
  developer?: string;
  qa?: string;
  ba?: string;
  remarks?: string;
  month?: string;
  quarter?: string;
  year?: string;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryStatus =
  | 'backlog'
  | 'planned'
  | 'ready'
  | 'in-progress'
  | 'blocked'
  | 'in-review'
  | 'testing'
  | 'done'
  | 'cancelled';

export type DeliveryPriority = 'critical' | 'high' | 'medium' | 'low';
export type DeliveryHealth = 'on-track' | 'at-risk' | 'critical';

export interface Epic {
  id: string;
  code: string;
  name: string;
  description: string;
  projectId: string;
  projectName?: string;
  productId?: string;
  productName?: string;
  portfolioId?: string;
  portfolioName?: string;
  ownerId?: string;
  ownerName?: string;
  teamId?: string;
  teamName?: string;
  status: DeliveryStatus;
  priority: DeliveryPriority;
  health: DeliveryHealth;
  progress: number; // 0-100 calculated from children
  startDate?: string;
  targetDate?: string;
  isArchived?: boolean;
  featureCount?: number;
  storyCount?: number;
  taskCount?: number;
  backlogOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Feature {
  id: string;
  code: string;
  name: string;
  description: string;
  epicId?: string;
  epicName?: string;
  projectId: string;
  projectName?: string;
  productId?: string;
  productName?: string;
  ownerId?: string;
  ownerName?: string;
  teamId?: string;
  teamName?: string;
  status: DeliveryStatus;
  priority: DeliveryPriority;
  targetRelease?: string;
  startDate?: string;
  targetDate?: string;
  progress: number; // 0-100 calculated from stories
  storyCount?: number;
  taskCount?: number;
  backlogOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoryCriteria {
  id: string;
  text: string;
  completed: boolean;
}

export interface UserStoryFormat {
  asA: string;
  iWant: string;
  soThat: string;
}

export interface UserStory {
  id: string;
  code: string;
  title: string;
  description?: string;
  userStory?: UserStoryFormat;
  acceptanceCriteria: StoryCriteria[];
  featureId?: string;
  featureName?: string;
  epicId?: string;
  epicName?: string;
  projectId: string;
  projectName?: string;
  productId?: string;
  productName?: string;
  storyPoints?: number;
  priority: DeliveryPriority;
  status: DeliveryStatus;
  assigneeId?: string;
  assigneeName?: string;
  teamId?: string;
  teamName?: string;
  reporterId?: string;
  reporterName?: string;
  sprint?: string;
  sprintId?: string;
  targetRelease?: string;
  dueDate?: string;
  backlogOrder?: number;
  progress: number; // 0-100 calculated from tasks
  taskCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type Story = UserStory;

export interface Task {
  id: string;
  code: string;
  title: string;
  description?: string;
  storyId?: string;
  storyTitle?: string;
  featureId?: string;
  featureName?: string;
  epicId?: string;
  epicName?: string;
  projectId: string;
  projectName?: string;
  assigneeId?: string;
  assigneeName?: string;
  teamId?: string;
  teamName?: string;
  status: DeliveryStatus;
  priority: DeliveryPriority;
  dueDate?: string;
  estimatedEffortHrs?: number;
  actualEffortHrs?: number;
  startDate?: string;
  completionDate?: string;
  sprint?: string;
  sprintId?: string;
  backlogOrder?: number;
  progress: number; // 0-100 calculated from subtasks
  subtaskCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  taskTitle?: string;
  title: string;
  assigneeId?: string;
  assigneeName?: string;
  status: DeliveryStatus;
  priority: DeliveryPriority;
  estimateHrs?: number;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TraceabilityNode {
  type:
    | 'portfolio'
    | 'product'
    | 'project'
    | 'epic'
    | 'feature'
    | 'story'
    | 'task'
    | 'subtask'
    | 'goal'
    | 'roadmap'
    | 'risk'
    | 'issue'
    | 'dependency'
    | 'milestone'
    | 'release';
  id: string;
  code?: string;
  name: string;
  status?: string;
  priority?: string;
  progress?: number;
  severity?: string;
  criticality?: string;
  dependencyType?: string;
  isCriticalPath?: boolean;
}

export interface TraceabilityChain {
  entity: TraceabilityNode;
  ancestors: TraceabilityNode[];
  children?: TraceabilityNode[];
  governance?: {
    risks?: TraceabilityNode[];
    issues?: TraceabilityNode[];
    dependencies?: TraceabilityNode[];
    milestones?: TraceabilityNode[];
    releases?: TraceabilityNode[];
  };
}

export type ActivityEntityType =
  | 'user'
  | 'team'
  | 'product'
  | 'portfolio'
  | 'goal'
  | 'project'
  | 'epic'
  | 'feature'
  | 'story'
  | 'task'
  | 'subtask'
  | 'sprint'
  | 'backlog'
  | 'risk'
  | 'issue'
  | 'dependency'
  | 'milestone'
  | 'release'
  | 'governance'
  | 'roadmap'
  | 'auth'
  | 'ai'
  | 'system';

export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'severity_change'
  | 'priority_change'
  | 'owner_change'
  | 'member_change'
  | 'login'
  | 'logout'
  | 'export'
  | 'assign'
  | 'reassign'
  | 'complete'
  | 'start'
  | 'block'
  | 'carryover'
  | 'reorder'
  | 'archive'
  | 'escalate'
  | 'resolve'
  | 'delay'
  | 'release'
  | 'migrate'
  | 'ai_query';

export interface ActivityLog {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  actorId: string;
  actorName: string;
  details: Record<string, any>;
  ipAddress?: string;
  createdAt: string;
}

export type NotificationType =
  | 'task_assigned'
  | 'work_assigned'
  | 'work_reassigned'
  | 'status_change'
  | 'work_completed'
  | 'work_blocked'
  | 'sprint_started'
  | 'sprint_completed'
  | 'sprint_ending'
  | 'capacity_exceeded'
  | 'ownership_change'
  | 'team_change'
  | 'mention'
  | 'risk_alert'
  | 'critical_risk'
  | 'risk_assigned'
  | 'risk_escalated'
  | 'issue_assigned'
  | 'critical_issue'
  | 'dependency_blocked'
  | 'dependency_overdue'
  | 'dependency_critical'
  | 'dependency_assigned'
  | 'milestone_alert'
  | 'milestone_at_risk'
  | 'milestone_missed'
  | 'release_at_risk'
  | 'release_approaching'
  | 'release_delayed'
  | 'status_alert'
  | 'approval_request'
  | 'system';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: string;
}

// ====================================================================
// Sprint 4: Backlog Management, Sprints & Agile Execution
// ====================================================================

export type SprintStatus = 'planning' | 'future' | 'active' | 'completed' | 'cancelled';

export interface Sprint {
  id: string;
  code: string;
  name: string;
  projectId: string;
  projectName?: string;
  goal?: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  capacityHours: number;
  capacityPoints: number;
  committedPoints?: number;
  completedPoints?: number;
  committedHours?: number;
  completedHours?: number;
  remainingPoints?: number;
  remainingHours?: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type BacklogItemType = 'story' | 'task' | 'feature' | 'epic';

export interface BacklogItem {
  id: string;
  type: BacklogItemType;
  code: string;
  title: string;
  description?: string;
  status: DeliveryStatus;
  priority: DeliveryPriority;
  backlogOrder: number;
  storyPoints?: number;
  estimatedEffortHrs?: number;
  actualEffortHrs?: number;
  projectId: string;
  projectName?: string;
  productId?: string;
  productName?: string;
  epicId?: string;
  epicName?: string;
  featureId?: string;
  featureName?: string;
  assigneeId?: string;
  assigneeName?: string;
  sprintId?: string;
  sprintName?: string;
  targetRelease?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberCapacityBreakdown {
  userId?: string;
  name: string;
  role: string;
  allocationPercent: number;
  dailyCapacityHrs: number;
  totalAvailableHrs: number;
  leaveHrs: number;
  existingAllocHrs: number;
  netCapacityHrs: number;
  assignedSprintHrs: number;
  assignedSprintPoints: number;
}

export interface SprintCapacitySummary {
  sprintId: string;
  sprintName: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  teamMembersCount: number;
  availableHours: number;
  capacityPoints: number;
  committedHours: number;
  completedHours: number;
  remainingHours: number;
  committedPoints: number;
  completedPoints: number;
  remainingPoints: number;
  hoursUtilization: number; // percentage
  pointsUtilization: number; // percentage
  isOverCapacity: boolean;
  memberBreakdown: MemberCapacityBreakdown[];
}

export interface BurndownDay {
  dayIndex: number;
  date: string;
  label: string;
  idealRemainingPoints: number;
  actualRemainingPoints: number;
  idealRemainingHours: number;
  actualRemainingHours: number;
}

export interface VelocityRecord {
  sprintId: string;
  sprintName: string;
  projectId: string;
  startDate: string;
  endDate: string;
  completedDate: string;
  committedPoints: number;
  completedPoints: number;
  committedHours: number;
  completedHours: number;
}

// ====================================================================
// Sprint 11.1A: Executive Overview (read-only aggregate)
// ====================================================================

/**
 * Query scope for the executive overview. Both fields are optional and narrow
 * the project set; a future Program level would add a third optional id here
 * without changing anything below it.
 */
export interface ExecutiveOverviewFilter {
  portfolioId?: string;
  productId?: string;
}

/**
 * Health rolled up from ProjectHealthService results — never re-scored here.
 *
 * `complete` is false when health could not be computed for every project in
 * the rollup's scope. In that case `averageScore` is null (a partial average is
 * never presented as the scope's health) and `byBand` describes only the
 * `computedFor` projects that were scored.
 */
export interface ExecutiveHealthRollup {
  /** Unweighted mean of the canonical project scores, 1 dp; null unless complete and non-empty. */
  averageScore: number | null;
  /** resolveBand(averageScore) from ProjectHealthService; null whenever averageScore is null. */
  band: string | null;
  /** Keyed by HealthBand ('Excellent' | 'Healthy' | 'Monitor' | 'At Risk' | 'Critical'). */
  byBand: Record<string, number>;
  /** Projects in this scope. */
  projectCount: number;
  /** Projects that were actually scored. */
  computedFor: number;
  /** projectCount - computedFor: not scored because of a bound or a failed computation. */
  excludedCount: number;
  complete: boolean;
  /** projectCount === 0 — "no projects", never a band. */
  empty: boolean;
  /** ProjectHealthService model version the scores came from. */
  healthModel: string;
}

/**
 * Sprint 11.2C — the same rollup shape wherever derived health is reported
 * for a container (portfolio, product, and any future Program level).
 */
export type DerivedHealthRollup = ExecutiveHealthRollup;

/** One project's contribution to a container rollup. */
export interface DerivedHealthProjectEntry {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  /** null when the project was not scored (bound or failure). */
  score: number | null;
  band: string | null;
  /** measuredFactors / applicableFactors for the project, so thin data is visible. */
  coverageRatio: number | null;
}

export interface PortfolioHealthResponse {
  portfolioId: string;
  portfolioCode: string;
  /** Hand-entered status, kept separate from the computed rollup. */
  declaredHealth: PortfolioHealth;
  derivedHealth: DerivedHealthRollup;
  projects: DerivedHealthProjectEntry[];
  computedAt: string;
}

export interface ProductHealthResponse {
  productId: string;
  productCode: string;
  portfolioId?: string;
  declaredHealth?: ProductHealth;
  derivedHealth: DerivedHealthRollup;
  projects: DerivedHealthProjectEntry[];
  computedAt: string;
}

/** Aggregates over one set of projects; applied identically at every hierarchy level. */
export interface ExecutiveProjectRollup {
  total: number;
  byStatus: Record<ProjectStatus, number>;
  byRisk: Record<ProjectRisk, number>;
  health: ExecutiveHealthRollup;
  /** Mean of the canonical Project.progress values, or null when there are no projects. */
  progress: { average: number | null };
  /** Present only when the caller's role may see commercial figures. */
  budget?: { total: number };
}

export interface ExecutiveProductNode {
  id: string;
  code: string;
  name: string;
  status: ProductStatus;
  rollup: ExecutiveProjectRollup;
}

export interface ExecutivePortfolioNode {
  id: string;
  code: string;
  name: string;
  status: PortfolioStatus;
  /** The stored Portfolio.health value, reported as declared — not derived here. */
  declaredHealth?: PortfolioHealth;
  rollup: ExecutiveProjectRollup;
  products: ExecutiveProductNode[];
}

/**
 * Sprint 11.3 — per-goal execution rollup. Progress is the mean canonical
 * project progress across the goal's chartered initiatives, one contribution
 * per initiative; null when none is available. Never Goal.progress.
 */
export interface ExecutiveGoalRollup {
  goalId: string;
  goalName: string;
  status: GoalStatus;
  initiativeCount: number;
  charteredInitiativeCount: number;
  progress: number | null;
  progressBasedOn: number;
  progressUnavailable: number;
}
export interface ExecutiveStrategySummary {
  goals: Record<GoalStatus, number>;
  goalsTotal: number;
  initiatives: Record<RoadmapStatus, number>;
  initiativesTotal: number;
  charteredInitiatives: number;
  uncharteredInitiatives: number;
  projectsWithoutInitiative: number;
  initiativesWithoutGoal: number;
  /** Sprint 11.3 — complements of the counts above, for direct display. */
  alignedProjects: { aligned: number; unaligned: number };
  initiativesWithGoal: { withGoal: number; withoutGoal: number };
  /**
   * Initiative-based: one contribution per chartered initiative from its linked
   * project's canonical progress. `average` is null when nothing is available.
   */
  roadmapProgress: { average: number | null; basedOn: number; unavailable: number };
  goalRollups: ExecutiveGoalRollup[];
}

export interface ExecutiveGovernanceSummary {
  openRisks: number;
  criticalOrHighRisks: number;
  openIssues: number;
  blockingDependencies: number;
  atRiskMilestones: number;
  upcomingMilestones: number;
  activeReleases: number;
  atRiskReleases: number;
}

export interface ExecutiveActivityEntry {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  actorName: string;
  createdAt: string;
  summary: string;
}

export interface ExecutiveOverview {
  scope: {
    portfolioId?: string;
    productId?: string;
    projectsInScope: number;
    /** Projects counted in `projects` that belong to no portfolio and so appear under none. */
    projectsWithoutPortfolio: number;
  };
  projects: ExecutiveProjectRollup;
  portfolios: ExecutivePortfolioNode[];
  /**
   * Products with no resolvable portfolio (Sprint 11.3.0). Product membership is
   * the stored productId alone, so these products still roll up their projects
   * and are listed here rather than dropped from the hierarchy.
   */
  productsWithoutPortfolio: ExecutiveProductNode[];
  strategy: ExecutiveStrategySummary;
  governance: ExecutiveGovernanceSummary;
  recentActivity: ExecutiveActivityEntry[];
  meta: {
    generatedAt: string;
    healthModel: string;
    healthComputedFor: number;
    healthComplete: boolean;
    commercialsIncluded: boolean;
    basis: 'deterministic-aggregation';
  };
}

// ====================================================================
// Sprint 5: Governance & Delivery Control (Risks, Issues, Dependencies, Milestones, Releases)
// ====================================================================

/**
 * Entities that may own links in the generic governance_links junction.
 *
 * 'roadmap' joins the original governance entities so Goal alignment reuses the
 * existing junction rather than adding a near-duplicate table. The table keeps
 * its historical name; treat it as a generic link store.
 */
export type GovernanceLinkSourceType =
  | 'risk'
  | 'issue'
  | 'dependency'
  | 'milestone'
  | 'release'
  | 'roadmap';

export type GovernanceLinkTargetType =
  | 'portfolio'
  | 'product'
  | 'project'
  | 'epic'
  | 'feature'
  | 'story'
  | 'task'
  | 'sprint'
  | 'milestone'
  | 'release'
  | 'goal';

export interface GovernanceLink {
  id: string;
  governanceType: GovernanceLinkSourceType;
  governanceId: string;
  targetType: GovernanceLinkTargetType;
  targetId: string;
  targetCode?: string;
  targetName?: string;
  createdAt: string;
}

// 1. Risk Management
export type RiskCategory =
  | 'Schedule'
  | 'Cost'
  | 'Scope'
  | 'Technical'
  | 'Resource'
  | 'Customer'
  | 'Vendor'
  | 'Security'
  | 'Quality'
  | 'Operational'
  | 'Dependency'
  | 'Strategic'
  | 'Other';

export type RiskStatus =
  | 'Identified'
  | 'Assessing'
  | 'Mitigating'
  | 'Monitoring'
  | 'Escalated'
  | 'Closed'
  | 'Accepted';

export type RiskSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export interface Risk {
  id: string;
  code: string;
  title: string;
  description?: string;
  projectId: string;
  projectName?: string;
  productId?: string;
  productName?: string;
  portfolioId?: string;
  portfolioName?: string;
  ownerId?: string;
  ownerName?: string;
  teamId?: string;
  teamName?: string;
  category: RiskCategory;
  probability: number; // 1 - 5
  impact: number;      // 1 - 5
  riskScore: number;   // 1 - 25 (Probability * Impact)
  severity: RiskSeverity; // 1-4 Low, 5-9 Medium, 10-16 High, 17-25 Critical
  status: RiskStatus;
  mitigation?: string;
  mitigationPlan?: string;
  contingencyPlan?: string;
  trigger?: string;
  triggerCondition?: string;
  targetResolutionDate?: string;
  linkedItems?: GovernanceLink[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// 2. Issue Management
export type IssueStatus =
  | 'Open'
  | 'Investigating'
  | 'In Progress'
  | 'Blocked'
  | 'Resolved'
  | 'Closed'
  | 'Rejected';

export type IssueSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type IssuePriority = 'Urgent' | 'High' | 'Medium' | 'Low';

export type RootCauseCategory =
  | 'Requirement'
  | 'Requirements'
  | 'Technical'
  | 'Process'
  | 'Resource'
  | 'Communication'
  | 'Vendor'
  | 'Customer'
  | 'Dependency'
  | 'Quality'
  | 'Environment'
  | 'Other';

export interface Issue {
  id: string;
  code: string;
  title: string;
  description?: string;
  projectId: string;
  projectName?: string;
  productId?: string;
  productName?: string;
  reportedBy?: string;
  reportedByName?: string;
  ownerId?: string;
  ownerName?: string;
  assigneeId?: string;
  assigneeName?: string;
  teamId?: string;
  teamName?: string;
  category: string;
  severity: IssueSeverity;
  priority: IssuePriority;
  status: IssueStatus;
  rootCauseCategory?: RootCauseCategory;
  rootCauseNotes?: string;
  resolution?: string;
  reportedDate: string;
  targetResolutionDate?: string;
  resolvedAt?: string;
  resolvedDate?: string;
  linkedItems?: GovernanceLink[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// 3. Dependency Management
export type DependencyType =
  | 'Blocks'
  | 'Blocked By'
  | 'Depends On'
  | 'Requires'
  | 'Required By'
  | 'Related To'
  | 'Predecessor'
  | 'Successor'
  | 'External';

export type DependencyStatus =
  | 'Open'
  | 'In Progress'
  | 'At Risk'
  | 'Blocked'
  | 'Resolved'
  | 'Closed'
  | 'Cancelled';

export type DependencyCriticality =
  | 'Low'
  | 'Medium'
  | 'High'
  | 'Critical';

export type DependencyEntityType =
  | 'portfolio'
  | 'product'
  | 'project'
  | 'epic'
  | 'feature'
  | 'story'
  | 'task'
  | 'subtask'
  | 'sprint'
  | 'risk'
  | 'issue'
  | 'milestone'
  | 'release';

export interface Dependency {
  id: string;
  code: string;
  sourceEntityId: string;
  sourceEntityType: DependencyEntityType;
  sourceEntityName: string;
  sourceEntityCode?: string;
  targetEntityId: string;
  targetEntityType: DependencyEntityType;
  targetEntityName: string;
  targetEntityCode?: string;
  dependencyType: DependencyType;
  status: DependencyStatus;
  criticality: DependencyCriticality;
  ownerId?: string;
  ownerName?: string;
  description?: string;
  targetDate?: string;
  dueDate?: string;
  resolvedAt?: string;
  resolutionDate?: string;
  resolutionNotes?: string;
  projectId?: string;
  isOverdue?: boolean;
  isCritical?: boolean;
  isCriticalPath?: boolean;
  lagDays?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// 4. Milestones
export type MilestoneType =
  | 'Delivery'
  | 'Customer'
  | 'Technical'
  | 'Governance'
  | 'Approval'
  | 'Launch'
  | 'Other';

export type MilestoneStatus =
  | 'Planned'
  | 'In Progress'
  | 'At Risk'
  | 'Completed'
  | 'Missed'
  | 'Cancelled';

export type MilestoneHealth = 'On Track' | 'At Risk' | 'Critical';

export interface Milestone {
  id: string;
  code: string;
  name: string;
  description?: string;
  projectId: string;
  projectName?: string;
  productId?: string;
  productName?: string;
  ownerId?: string;
  ownerName?: string;
  status: MilestoneStatus;
  targetDate: string;
  actualDate?: string;
  progress: number; // 0 - 100 derived or manual
  health: MilestoneHealth;
  type: MilestoneType;
  linkedItems?: GovernanceLink[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// 5. Releases
export type ReleaseStatus =
  | 'Planned'
  | 'In Development'
  | 'Code Complete'
  | 'Testing'
  | 'Ready for Release'
  | 'Released'
  | 'Delayed'
  | 'Cancelled';

export type ReleaseHealth = 'On Track' | 'At Risk' | 'Off Track';

export interface ReleaseItem {
  id: string;
  releaseId: string;
  itemType: 'epic' | 'feature' | 'story' | 'task' | 'milestone';
  itemId: string;
  itemCode?: string;
  itemTitle?: string;
  status?: string;
  progress?: number;
  addedAt: string;
}

export interface ReleaseHealthFactor {
  metric: string;
  status: 'good' | 'warning' | 'critical';
  details: string;
}

export interface Release {
  id: string;
  code: string;
  name: string;
  version: string;
  productId?: string;
  productName?: string;
  projectId?: string;
  projectName?: string;
  ownerId?: string;
  ownerName?: string;
  status: ReleaseStatus;
  releaseDate: string;
  actualReleaseDate?: string;
  health: ReleaseHealth;
  healthFactors?: ReleaseHealthFactor[];
  description?: string;
  items?: ReleaseItem[];
  itemCounts?: {
    epics: number;
    features: number;
    stories: number;
    tasks: number;
    milestones: number;
    total: number;
    completed: number;
  };
  completionProgress?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// 6. Governance Dashboard Summary
export interface RiskHeatmapCell {
  probability: number;
  impact: number;
  score: number;
  severity: RiskSeverity;
  count: number;
  riskIds: string[];
}

export interface GovernanceSummary {
  openRisks: number;
  criticalRisks: number;
  highRisks: number;
  openIssues: number;
  criticalIssues: number;
  highIssues: number;
  blockingDependencies: number;
  overdueDependencies: number;
  totalDependencies: number;
  upcomingMilestones: number;
  atRiskMilestones: number;
  completedMilestones: number;
  upcomingReleases: number;
  atRiskReleases: number;
  releasedCount: number;
  heatmapMatrix: RiskHeatmapCell[];
}


