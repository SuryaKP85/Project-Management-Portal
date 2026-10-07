import { ProjectRepository } from '../repositories/projectRepository';
import { UserRepository } from '../repositories/userRepository';
import { EpicRepository } from '../repositories/epicRepository';
import { FeatureRepository } from '../repositories/featureRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { SubtaskRepository } from '../repositories/subtaskRepository';
import { SprintRepository } from '../repositories/sprintRepository';
import { RiskRepository } from '../repositories/riskRepository';
import { IssueRepository } from '../repositories/issueRepository';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { RequirementRepository } from '../repositories/requirementRepository';
import { RequirementDecompositionRepository } from '../repositories/requirementLinkRepository';
import { ActionItemRepository } from '../repositories/actionItemRepository';
import { WaitingForRepository } from '../repositories/waitingForRepository';
import { FollowUpRepository } from '../repositories/followUpRepository';
import { MeetingRepository } from '../repositories/meetingRepository';
import { toDateOnly } from '../repositories/followThroughRows';
import { ProjectHealthService } from './projectHealthService';
import { MilestoneService } from './milestoneService';
import { ProjectScope, ScopeActor } from './projectScope';
import { notAvailable } from './followThroughSupport';
import { EXECUTIVE_COMMERCIAL_ROLES } from './executiveDashboardService';

/**
 * Sprint 22B — V2 Project Status Report.
 *
 * A live, read-only, deterministic report on one project, built on request
 * from the project's current records. Nothing is stored, nothing is
 * estimated, and no AI is involved.
 * - Access: Sprint 22A project scope (ProjectScope). A missing project and one
 *   the caller cannot see are the same 404.
 * - Every source is read with the project filter and then re-filtered here by
 *   projectId, so a repository fallback can never add another project's rows.
 * - Dates are normalised (strings and JavaScript Date values alike) before any
 *   comparison. The report date is the UTC calendar day of generation.
 * - Health is ProjectHealthService.computeHealth, reused as is.
 * - Budget, client and SOW status are commercial: only EXECUTIVE_COMMERCIAL_ROLES
 *   see them (and the SOW health factor's value).
 * - A value that is not available is null, with a reason; nothing is filled in.
 */

const TERMINAL = {
  delivery: ['done', 'cancelled'],
  risk: ['Closed', 'Accepted'],
  issue: ['Resolved', 'Closed', 'Rejected'],
  dependency: ['Resolved', 'Closed', 'Cancelled'],
  milestone: ['Completed', 'Cancelled'],
  actionItem: ['Completed', 'Cancelled'],
  waitingFor: ['Resolved', 'Cancelled'],
  followUp: ['Completed', 'Cancelled'],
};
const UPCOMING_MILESTONE_DAYS = 30;
const UPCOMING_MEETING_DAYS = 14;
const TOP_FACTORS = 3;

/** The definitions this report applies, returned in meta so every figure can be read against them. */
export const STATUS_REPORT_DEFINITIONS = {
  reportDate: 'The UTC calendar day on which the report was generated.',
  terminal: {
    delivery: TERMINAL.delivery,
    risk: TERMINAL.risk,
    issue: TERMINAL.issue,
    dependency: TERMINAL.dependency,
    milestone: TERMINAL.milestone,
    requirement: ['approved', 'rejected', 'deferred'],
    actionItem: TERMINAL.actionItem,
    waitingFor: TERMINAL.waitingFor,
    followUp: TERMINAL.followUp,
  },
  open: 'A record whose status is not terminal for its type. Open requirements are those in draft or in-review.',
  overdue: 'Open, with its date before the report date: delivery dueDate; risk and issue targetResolutionDate; dependency targetDate (or dueDate); requirement targetDate; action item and follow-up dueDate; waiting-for expectedDate. Records without a date are never overdue.',
  critical: "A risk or issue with severity 'Critical'.",
  high: "A risk or issue with severity 'High'.",
  blocked: "Delivery status 'blocked'; action item status 'Blocked'; dependency status 'Blocked'.",
  atRisk: "An open milestone whose calculated status (MilestoneService) is 'At Risk' or 'Missed', or whose calculated health is 'At Risk' or 'Critical'; a dependency with status 'At Risk'.",
  upcomingMilestone: `An open milestone with a target date from the report date up to ${UPCOMING_MILESTONE_DAYS} days ahead.`,
  upcomingMeeting: `A Scheduled meeting starting within the next ${UPCOMING_MEETING_DAYS} days.`,
};

export const STATUS_REPORT_NOTES = {
  manualProgress: 'Reported progress is entered manually on the project; it is not calculated from delivery work.',
  noTrends: 'This is a live report of the current state: historical health trends and changes since a previous report are not available.',
  noVelocity: 'Velocity history and burndown are not included.',
  statusVocabulary: "Delivery completion is not reported: epic and feature forms record 'completed' while delivery rollups recognise only 'done', so completion figures would be unreliable.",
  postgresIssues: 'In PostgreSQL mode, issue persistence has a known defect (a missing column) that this report does not repair; issue figures may be incomplete there.',
  commercialHidden: 'Budget, client and SOW information are not shown to your role.',
};

const day = (value: unknown): string | undefined => toDateOnly(value);
const isBefore = (value: unknown, today: string) => {
  const d = day(value);
  return !!d && d < today;
};
const open = (status: unknown, terminal: readonly string[]) => !terminal.includes(String(status));

export const ProjectStatusReportService = {
  async build(actor: ScopeActor, projectId: string, options: { now?: Date } = {}) {
    const now = options.now ?? new Date();
    const today = now.toISOString().slice(0, 10);
    const project = typeof projectId === 'string' && projectId ? await ProjectRepository.findById(projectId) : null;
    if (!project || !(await ProjectScope.canRead(actor, project.id))) throw notAvailable('Project');
    const id = project.id;
    const mine = <T extends { projectId?: string }>(rows: T[]) => rows.filter((r) => r.projectId === id);
    const commercial = EXECUTIVE_COMMERCIAL_ROLES.includes(actor.role);

    const [health, epics, features, stories, tasks, allSubtasks, risks, issues, dependencies, milestones, requirements, actionItems, waitingFor, followUps, meetings, activeSprint, manager] = await Promise.all([
      ProjectHealthService.computeHealth(project, { now }),
      EpicRepository.findAll({ projectId: id }).then(mine),
      FeatureRepository.findAll({ projectId: id }).then(mine),
      StoryRepository.findAll({ projectId: id }).then(mine),
      TaskRepository.findAll({ projectId: id }).then(mine),
      SubtaskRepository.findAll(),
      RiskRepository.findAll({ projectId: id, status: 'all' }).then(mine),
      IssueRepository.findAll({ projectId: id }).then(mine),
      DependencyRepository.findAll({ projectId: id }).then(mine),
      MilestoneService.getAllMilestones({ projectId: id }).then(mine),
      RequirementRepository.findAll({ projectIds: [id] }).then(mine),
      ActionItemRepository.findAll({ projectIds: [id] }).then(mine),
      WaitingForRepository.findAll({ projectIds: [id] }).then(mine),
      FollowUpRepository.findAll({ projectIds: [id] }).then(mine),
      MeetingRepository.findAll({ projectIds: [id] }).then(mine),
      SprintRepository.findActiveByProject(id).then((s) => (s && s.projectId === id ? s : null)),
      project.managerId ? UserRepository.findById(project.managerId) : Promise.resolve(null),
    ]);
    // A subtask belongs to its task's project.
    const taskIds = new Set(tasks.map((t) => t.id));
    const subtasks = allSubtasks.filter((st) => taskIds.has(st.taskId));

    // --- Project (commercial fields by role) ------------------------------
    const projectOut: {
      id: string; code: string; name: string; status: string; startDate: string | null; endDate: string | null;
      manager: { id: string; name: string } | null; managerUnavailableReason?: string;
      budget?: number | null; client?: string | null; sowStatus?: string | null;
    } = {
      id,
      code: project.code,
      name: project.name,
      status: project.status,
      startDate: day(project.startDate) ?? null,
      endDate: day(project.endDate) ?? null,
      manager: manager ? { id: manager.id, name: `${manager.firstName || ''} ${manager.lastName || ''}`.trim() || manager.email } : null,
    };
    if (!manager) projectOut.managerUnavailableReason = project.managerId ? 'The manager account no longer exists.' : 'No manager is recorded for this project.';
    if (commercial) {
      projectOut.budget = typeof project.budget === 'number' ? project.budget : null;
      projectOut.client = project.client || null;
      projectOut.sowStatus = project.sowStatus || null;
    }

    // --- Health (reused; the SOW factor's value is commercial) -------------
    const topFactors = health.factors
      .filter((f) => f.included && f.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, TOP_FACTORS)
      .map((f) => (f.id === 'sow_approval' && !commercial
        ? { id: f.id, label: 'Commercial approval (restricted)', delta: f.delta, severity: f.severity, value: null }
        : { id: f.id, label: f.label, delta: f.delta, severity: f.severity, value: f.value }));

    // --- Delivery: counts, blocked, overdue (no completion figures) --------
    const deliveryItems = [
      ...stories.map((s) => ({ type: 'story', id: s.id, code: s.code, title: s.title, status: s.status, dueDate: s.dueDate })),
      ...tasks.map((t) => ({ type: 'task', id: t.id, code: t.code, title: t.title, status: t.status, dueDate: t.dueDate })),
      ...subtasks.map((st) => ({ type: 'subtask', id: st.id, code: undefined, title: st.title, status: st.status, dueDate: st.dueDate })),
    ];
    const overdueDelivery = deliveryItems
      .filter((i) => open(i.status, TERMINAL.delivery) && isBefore(i.dueDate, today))
      .map((i) => ({ type: i.type, id: i.id, code: i.code ?? null, title: i.title, status: i.status, dueDate: day(i.dueDate) }))
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const blockedOf = (rows: Array<{ status?: string }>) => rows.filter((r) => r.status === 'blocked').length;
    const blocked = { epics: blockedOf(epics), features: blockedOf(features), stories: blockedOf(stories), tasks: blockedOf(tasks), subtasks: blockedOf(subtasks) };
    const blockedTotal = Object.values(blocked).reduce((a, b) => a + b, 0);

    // --- Active sprint (existing committed / completed points only) --------
    let sprint: {
      active: { id: string; name: string; startDate: string | null; endDate: string | null; stories: number; committedPoints: number; completedPoints: number } | null;
      reason?: string;
    };
    if (activeSprint) {
      const sprintStories = mine(await StoryRepository.findAll({ sprintId: activeSprint.id }));
      const points = (rows: typeof sprintStories) => rows.reduce((sum, s) => sum + (Number(s.storyPoints) || 0), 0);
      sprint = {
        active: {
          id: activeSprint.id,
          name: activeSprint.name,
          startDate: day(activeSprint.startDate) ?? null,
          endDate: day(activeSprint.endDate) ?? null,
          stories: sprintStories.length,
          committedPoints: points(sprintStories),
          completedPoints: points(sprintStories.filter((s) => s.status === 'done')),
        },
      };
    } else {
      sprint = { active: null, reason: 'No active sprint for this project.' };
    }

    // --- Milestones (MilestoneService calculated values) -------------------
    const upcomingEnd = new Date(now.getTime() + UPCOMING_MILESTONE_DAYS * 86400000).toISOString().slice(0, 10);
    const milestoneOut = (m: (typeof milestones)[number]) => ({ id: m.id, code: m.code, name: m.name, status: m.status, health: m.health, targetDate: day(m.targetDate) ?? null });
    const openMilestones = milestones.filter((m) => open(m.status, TERMINAL.milestone));
    const atRiskMilestones = openMilestones.filter((m) => ['At Risk', 'Missed'].includes(m.status) || ['At Risk', 'Critical'].includes(m.health));
    const upcomingMilestones = openMilestones.filter((m) => { const d = day(m.targetDate); return !!d && d >= today && d <= upcomingEnd; });

    // --- Risks and issues ---------------------------------------------------
    const governance = <T extends { status: string; severity: string; targetResolutionDate?: string }>(rows: T[], terminal: readonly string[], shape: (r: T) => Record<string, unknown>) => {
      const openRows = rows.filter((r) => open(r.status, terminal));
      const bySeverity = { Critical: 0, High: 0, Medium: 0, Low: 0 } as Record<string, number>;
      for (const r of openRows) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
      return {
        open: openRows.length,
        bySeverity,
        critical: openRows.filter((r) => r.severity === 'Critical').map(shape),
        high: openRows.filter((r) => r.severity === 'High').map(shape),
        overdue: openRows.filter((r) => isBefore(r.targetResolutionDate, today)).map(shape),
      };
    };
    const riskShape = (r: (typeof risks)[number]) => ({ id: r.id, code: r.code, title: r.title, severity: r.severity, status: r.status, targetResolutionDate: day(r.targetResolutionDate) ?? null });
    const issueShape = (i: (typeof issues)[number]) => ({ id: i.id, code: i.code, title: i.title, severity: i.severity, priority: i.priority, status: i.status, targetResolutionDate: day(i.targetResolutionDate) ?? null });
    const risksOut = governance(risks, TERMINAL.risk, riskShape);
    const issuesOut = governance(issues, TERMINAL.issue, issueShape);

    // --- Dependencies owned by this project; other projects stay anonymous --
    const endpointCache = new Map<string, boolean>();
    const endpoint = async (type: string, entityId: string, name?: string, code?: string) => {
      const key = `${type}:${entityId}`;
      if (!endpointCache.has(key)) {
        const owner = await ProjectScope.projectOfEntity(type, entityId);
        endpointCache.set(key, owner === 'org' || owner === id || (!!owner && (await ProjectScope.canRead(actor, owner))));
      }
      return endpointCache.get(key) ? { type, label: [code, name].filter(Boolean).join(' · ') || type, hidden: false } : { type, label: 'Another project', hidden: true };
    };
    const openDependencies = dependencies.filter((d) => open(d.status, TERMINAL.dependency));
    const dependencyOut = async (d: (typeof dependencies)[number]) => ({
      id: d.id,
      code: d.code,
      dependencyType: d.dependencyType,
      status: d.status,
      criticality: d.criticality,
      date: day(d.targetDate || d.dueDate) ?? null,
      source: await endpoint(d.sourceEntityType, d.sourceEntityId, d.sourceEntityName, d.sourceEntityCode),
      target: await endpoint(d.targetEntityType, d.targetEntityId, d.targetEntityName, d.targetEntityCode),
    });
    const listOf = async (rows: typeof dependencies) => Promise.all(rows.map(dependencyOut));
    const dependenciesOut = {
      open: openDependencies.length,
      blocked: await listOf(openDependencies.filter((d) => d.status === 'Blocked')),
      atRisk: await listOf(openDependencies.filter((d) => d.status === 'At Risk')),
      overdue: await listOf(openDependencies.filter((d) => isBefore(d.targetDate || d.dueDate, today))),
    };

    // --- Requirements -------------------------------------------------------
    const countBy = <T>(rows: T[], key: (r: T) => string) => rows.reduce((acc, r) => { acc[key(r)] = (acc[key(r)] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    const reqShape = (r: (typeof requirements)[number]) => ({ id: r.id, code: r.code, title: r.title, status: r.status, priority: r.priority, revision: r.revision, targetDate: day(r.targetDate) ?? null });
    const approved = requirements.filter((r) => r.status === 'approved');
    const decomposed = await Promise.all(approved.map((r) => RequirementDecompositionRepository.findByRevision(r.id, r.revision)));
    const requirementsOut = {
      total: requirements.length,
      byStatus: countBy(requirements, (r) => r.status),
      byPriority: countBy(requirements, (r) => r.priority),
      byType: countBy(requirements, (r) => r.type),
      awaitingApproval: requirements.filter((r) => r.status === 'in-review').map(reqShape),
      notDecomposed: approved.filter((_, i) => !decomposed[i]).map(reqShape),
      overdue: requirements.filter((r) => (r.status === 'draft' || r.status === 'in-review') && isBefore(r.targetDate, today)).map(reqShape),
    };

    // --- Follow-through -----------------------------------------------------
    const openActions = actionItems.filter((a) => open(a.status, TERMINAL.actionItem));
    const actionShape = (a: (typeof actionItems)[number]) => ({ id: a.id, title: a.title, status: a.status, priority: a.priority, dueDate: day(a.dueDate) ?? null });
    const openWaiting = waitingFor.filter((w) => open(w.status, TERMINAL.waitingFor));
    const waitingShape = (w: (typeof waitingFor)[number]) => ({ id: w.id, title: w.title, status: w.status, expectedDate: day(w.expectedDate) ?? null });
    const openFollowUps = followUps.filter((f) => open(f.status, TERMINAL.followUp));
    const followUpShape = (f: (typeof followUps)[number]) => ({ id: f.id, title: f.title, status: f.status, dueDate: day(f.dueDate) ?? null });
    const meetingEnd = now.getTime() + UPCOMING_MEETING_DAYS * 86400000;
    const startOf = (m: (typeof meetings)[number]) => new Date(m.scheduledAt as any).getTime();
    const scheduled = meetings.filter((m) => m.status === 'Scheduled' && Number.isFinite(startOf(m)));
    const meetingShape = (m: (typeof meetings)[number]) => ({ id: m.id, title: m.title, status: m.status, scheduledAt: new Date(m.scheduledAt as any).toISOString() });
    const followThrough = {
      actionItems: {
        open: openActions.length,
        overdue: openActions.filter((a) => isBefore(a.dueDate, today)).map(actionShape),
        blocked: openActions.filter((a) => a.status === 'Blocked').map(actionShape),
      },
      waitingFor: {
        open: openWaiting.length,
        followUpNeeded: openWaiting.filter((w) => w.status === 'Follow-up Needed').map(waitingShape),
        pastExpected: openWaiting.filter((w) => isBefore(w.expectedDate, today)).map(waitingShape),
      },
      followUps: {
        open: openFollowUps.length,
        overdue: openFollowUps.filter((f) => isBefore(f.dueDate, today)).map(followUpShape),
      },
      upcomingMeetings: scheduled.filter((m) => startOf(m) >= now.getTime() && startOf(m) <= meetingEnd).sort((a, b) => startOf(a) - startOf(b)).map(meetingShape),
      pastScheduledMeetings: scheduled.filter((m) => startOf(m) < now.getTime()).map(meetingShape),
    };

    // --- Attention: deterministic, from the figures above -------------------
    const attention: Array<{ level: 'critical' | 'warning'; kind: string; count: number; message: string }> = [];
    const flag = (level: 'critical' | 'warning', kind: string, count: number, message: string) => { if (count > 0) attention.push({ level, kind, count, message }); };
    if (health.band === 'Critical' || health.band === 'At Risk') attention.push({ level: health.band === 'Critical' ? 'critical' : 'warning', kind: 'health', count: 1, message: `Project health is ${health.band} (${health.score}).` });
    if (health.signals.isPastEndDate && open(project.status, ['completed', 'archived'])) attention.push({ level: 'critical', kind: 'past-end-date', count: 1, message: 'The project is past its end date.' });
    flag('critical', 'critical-risks', risksOut.critical.length, `${risksOut.critical.length} open critical risk(s).`);
    flag('critical', 'critical-issues', issuesOut.critical.length, `${issuesOut.critical.length} open critical issue(s).`);
    flag('warning', 'high-risks', risksOut.high.length, `${risksOut.high.length} open high risk(s).`);
    flag('warning', 'high-issues', issuesOut.high.length, `${issuesOut.high.length} open high issue(s).`);
    flag('warning', 'overdue-delivery', overdueDelivery.length, `${overdueDelivery.length} overdue delivery item(s).`);
    flag('warning', 'blocked-delivery', blockedTotal, `${blockedTotal} blocked delivery item(s).`);
    flag('warning', 'milestones-at-risk', atRiskMilestones.length, `${atRiskMilestones.length} milestone(s) at risk or missed.`);
    flag('warning', 'blocked-dependencies', dependenciesOut.blocked.length, `${dependenciesOut.blocked.length} blocked dependenc(ies).`);
    flag('warning', 'overdue-risks-issues', risksOut.overdue.length + issuesOut.overdue.length, `${risksOut.overdue.length + issuesOut.overdue.length} risk(s) or issue(s) past their target resolution date.`);
    flag('warning', 'requirements-awaiting-approval', requirementsOut.awaitingApproval.length, `${requirementsOut.awaitingApproval.length} requirement(s) awaiting approval.`);
    flag('warning', 'overdue-action-items', followThrough.actionItems.overdue.length, `${followThrough.actionItems.overdue.length} overdue action item(s).`);
    flag('warning', 'waiting-for-follow-up', new Set([...followThrough.waitingFor.followUpNeeded, ...followThrough.waitingFor.pastExpected].map((w) => w.id)).size, 'Waiting-for item(s) need follow-up or are past their expected date.');
    const order = { critical: 0, warning: 1 };
    attention.sort((a, b) => order[a.level] - order[b.level]);

    // --- Notes --------------------------------------------------------------
    const notes = [STATUS_REPORT_NOTES.manualProgress, STATUS_REPORT_NOTES.noTrends, STATUS_REPORT_NOTES.noVelocity, STATUS_REPORT_NOTES.statusVocabulary, STATUS_REPORT_NOTES.postgresIssues];
    if (health.coverage.unavailableFactors > 0) notes.push(`Health was measured on ${health.coverage.measuredFactors} of ${health.coverage.applicableFactors} factors; the others cannot be evaluated from current data.`);
    if (!commercial) notes.push(STATUS_REPORT_NOTES.commercialHidden);

    return {
      meta: { generatedAt: now.toISOString(), reportDate: today, healthModel: health.meta.model, definitions: STATUS_REPORT_DEFINITIONS, notes },
      project: projectOut,
      health: { score: health.score, band: health.band, coverage: health.coverage, topFactors },
      schedule: {
        startDate: projectOut.startDate,
        endDate: projectOut.endDate,
        daysRemaining: health.signals.daysRemaining,
        isPastEnd: health.signals.isPastEndDate,
        expectedProgressPct: health.signals.expectedProgressPct,
        reportedProgressPct: typeof project.progress === 'number' ? project.progress : null,
        reportedProgressIsManual: true,
      },
      delivery: {
        counts: { epics: epics.length, features: features.length, stories: stories.length, tasks: tasks.length, subtasks: subtasks.length },
        blocked: { ...blocked, total: blockedTotal },
        overdue: overdueDelivery,
        statusCaveat: STATUS_REPORT_NOTES.statusVocabulary,
      },
      sprint,
      milestones: { upcoming: upcomingMilestones.map(milestoneOut), atRiskOrMissed: atRiskMilestones.map(milestoneOut) },
      risks: risksOut,
      issues: issuesOut,
      dependencies: dependenciesOut,
      requirements: requirementsOut,
      followThrough,
      attention,
    };
  },
};
