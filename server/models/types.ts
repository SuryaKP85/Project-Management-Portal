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
export type PortfolioHealth = 'healthy' | 'caution' | 'critical';

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
export type ProductHealth = 'on-track' | 'at-risk' | 'critical';

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
  | 'auth'
  | 'system';

export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'severity_change'
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
  | 'migrate';

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
  | 'issue_assigned'
  | 'critical_issue'
  | 'dependency_blocked'
  | 'dependency_overdue'
  | 'milestone_alert'
  | 'milestone_at_risk'
  | 'milestone_missed'
  | 'release_at_risk'
  | 'release_approaching'
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
// Sprint 5: Governance & Delivery Control (Risks, Issues, Dependencies, Milestones, Releases)
// ====================================================================

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
  | 'release';

export interface GovernanceLink {
  id: string;
  governanceType: 'risk' | 'issue' | 'dependency' | 'milestone' | 'release';
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
  contingencyPlan?: string;
  trigger?: string;
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
  | 'Requirements'
  | 'Technical'
  | 'Process'
  | 'Resource'
  | 'Vendor'
  | 'Customer'
  | 'Environment'
  | 'Communication'
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
  | 'Required By'
  | 'Related To';

export type DependencyStatus =
  | 'Open'
  | 'In Progress'
  | 'At Risk'
  | 'Resolved'
  | 'Closed';

export type DependencyEntityType =
  | 'project'
  | 'epic'
  | 'feature'
  | 'story'
  | 'task'
  | 'sprint'
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
  ownerId?: string;
  ownerName?: string;
  description?: string;
  dueDate?: string;
  resolutionDate?: string;
  isOverdue?: boolean;
  isCritical?: boolean;
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


