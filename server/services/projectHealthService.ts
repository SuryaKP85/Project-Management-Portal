import { Project } from '../models/types';
import { ProjectRepository } from '../repositories/projectRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { RiskRepository } from '../repositories/riskRepository';
import { IssueRepository } from '../repositories/issueRepository';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { MilestoneRepository } from '../repositories/milestoneRepository';

/**
 * Sprint 8.1 — deterministic project health scoring.
 *
 * This is ordinary application logic, not an AI-generated score: the same inputs
 * always produce the same output, and every point of the result is attributable
 * to a named factor.
 *
 * The model is ported from the V1.1 client algorithm in
 * PM-Portal/js/aiEngine.js (calculateProjectHealth), reusing its weights
 * wherever the server holds a defensible equivalent signal. Factors whose source
 * data does not exist server-side are reported as explicitly UNAVAILABLE rather
 * than scored as zero, so a missing signal is never mistaken for a healthy one.
 */

export type HealthBand = 'Excellent' | 'Healthy' | 'Monitor' | 'At Risk' | 'Critical';

export type HealthFactorSeverity = 'positive' | 'neutral' | 'info' | 'warning' | 'danger';

export interface HealthFactor {
  /** Stable identifier, safe to key off in UI or tests. */
  id: string;
  /** Human label for the factor. */
  label: string;
  /** What was measured. */
  measured: string;
  /** The underlying signal value the decision was based on. */
  value: number | string | null;
  /** Score contribution: negative penalises, positive rewards, 0 is neutral. */
  delta: number;
  severity: HealthFactorSeverity;
  /** False when the factor could not be evaluated from server-held data. */
  included: boolean;
  /** Populated only when included === false. */
  unavailableReason?: string;
  /**
   * Set when the factor was measured but deliberately carries no penalty
   * because another factor already accounts for the same condition.
   */
  supersededBy?: string;
  /** Populated only alongside supersededBy. */
  supersededReason?: string;
}

export interface ProjectHealthSignals {
  expectedProgressPct: number | null;
  actualProgressPct: number;
  scheduleLagPct: number | null;
  daysRemaining: number | null;
  isPastEndDate: boolean;
  blockedStories: number;
  blockedTasks: number;
  storiesAwaitingQa: number;
  openHighOrCriticalRisks: number;
  openHighOrCriticalIssues: number;
  blockingDependencies: number;
  slippedMilestones: number;
  sowStatus: string | null;
}

/**
 * How much of the model could actually be evaluated for this project.
 *
 * Surfaced so a score is never read as a complete picture when signals are
 * missing: a project scoring 100 with 9 of 11 factors measured is a weaker
 * statement than the same score with full coverage.
 */
export interface ProjectHealthCoverage {
  /** Factors evaluated from server-held data. */
  measuredFactors: number;
  /** Total factors defined by the model. */
  applicableFactors: number;
  /** Factors that could not be evaluated. */
  unavailableFactors: number;
  /** measuredFactors / applicableFactors, rounded to 2dp. */
  ratio: number;
  /** Same value as a 0-100 percentage, rounded to the nearest integer. */
  percentage: number;
}

export interface ProjectHealthResult {
  projectId: string;
  projectCode: string;
  projectName: string;
  score: number;
  band: HealthBand;
  coverage: ProjectHealthCoverage;
  factors: HealthFactor[];
  signals: ProjectHealthSignals;
  computedAt: string;
  meta: {
    model: string;
    baseScore: number;
    includedFactors: number;
    unavailableFactors: number;
  };
}

export interface ProjectHealthOptions {
  /** Reference time. Injectable so results are reproducible in tests. */
  now?: Date;
}

/** Scoring model identifier, bumped when weights or factors change. */
export const HEALTH_MODEL_VERSION = 'v2-calibrated-2026-09';

const BASE_SCORE = 100;

/** Aggregate ceiling for the open High/Critical risk penalty. */
const MAX_RISK_PENALTY = 30;

/** Risk/issue statuses that still represent live exposure. */
const OPEN_RISK_STATUSES = new Set(['Identified', 'Assessing', 'Mitigating', 'Monitoring', 'Escalated']);
const OPEN_ISSUE_STATUSES = new Set(['Open', 'Investigating', 'In Progress', 'Blocked']);
const BLOCKING_DEPENDENCY_STATUSES = new Set(['Blocked', 'At Risk']);

/**
 * SOW values that count as signed off. The V1 algorithm tested
 * `sowStatus !== 'Approved'`, but this application's own data uses 'Signed',
 * so a literal port would penalise correctly-signed projects.
 */
const APPROVED_SOW_STATUSES = new Set(['approved', 'signed']);

/** Project states where schedule pressure no longer applies. */
const CLOSED_PROJECT_STATUSES = new Set(['completed', 'archived']);

function toDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Elapsed portion of the planned window, 0-100. Null when either bound is
 * missing, which is reported as an unavailable factor rather than assumed.
 */
export function calculateExpectedProgress(
  startDate: string | undefined,
  endDate: string | undefined,
  now: Date
): number | null {
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (!start || !end) return null;

  const startMs = startOfDay(start);
  const endMs = startOfDay(end);
  const nowMs = startOfDay(now);

  if (endMs <= startMs) return nowMs >= endMs ? 100 : 0;
  if (nowMs <= startMs) return 0;
  if (nowMs >= endMs) return 100;

  return Math.round(((nowMs - startMs) / (endMs - startMs)) * 100);
}

/** Whole days from now until the end date. Negative once past. */
export function calculateDaysRemaining(endDate: string | undefined, now: Date): number | null {
  const end = toDate(endDate);
  if (!end) return null;
  return Math.round((startOfDay(end) - startOfDay(now)) / 86_400_000);
}

export function resolveBand(score: number): HealthBand {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Healthy';
  if (score >= 60) return 'Monitor';
  if (score >= 45) return 'At Risk';
  return 'Critical';
}

export const ProjectHealthService = {
  /**
   * Computes health for a single project. Returns null when the project does
   * not exist, so callers can distinguish "missing" from "unhealthy".
   */
  async getProjectHealth(
    projectId: string,
    options: ProjectHealthOptions = {}
  ): Promise<ProjectHealthResult | null> {
    let project = await ProjectRepository.findById(projectId);
    if (!project) {
      const all = await ProjectRepository.findAll();
      project = all.find((p) => p.id === projectId || p.code === projectId) || null;
    }
    if (!project) return null;

    return this.computeHealth(project, options);
  },

  /**
   * Scores an already-loaded project. Kept separate so batch callers can avoid
   * re-reading the project, and so tests can score a constructed project.
   */
  async computeHealth(
    project: Project,
    options: ProjectHealthOptions = {}
  ): Promise<ProjectHealthResult> {
    const now = options.now ?? new Date();

    const [stories, tasks, risks, issues, dependencies, milestones] = await Promise.all([
      StoryRepository.findAll({ projectId: project.id }),
      TaskRepository.findAll({ projectId: project.id }),
      RiskRepository.findAll({ projectId: project.id }),
      IssueRepository.findAll({ projectId: project.id }),
      DependencyRepository.findAll({ projectId: project.id }),
      MilestoneRepository.findAll({ projectId: project.id }),
    ]);

    const factors: HealthFactor[] = [];

    // ---- Signals -----------------------------------------------------------
    const actualProgressPct = typeof project.progress === 'number' ? project.progress : 0;
    const expectedProgressPct = calculateExpectedProgress(project.startDate, project.endDate, now);
    const scheduleLagPct =
      expectedProgressPct === null ? null : expectedProgressPct - actualProgressPct;
    const daysRemaining = calculateDaysRemaining(project.endDate, now);
    const isProjectClosed = CLOSED_PROJECT_STATUSES.has(String(project.status));
    const isPastEndDate = daysRemaining !== null && daysRemaining < 0;

    const blockedStories = stories.filter((s: any) => s.status === 'blocked');
    const blockedTasks = tasks.filter((t: any) => t.status === 'blocked');
    const storiesAwaitingQa = stories.filter(
      (s: any) => s.status === 'testing' || s.status === 'in-review'
    );
    const openHighRisks = risks.filter(
      (r: any) => (r.severity === 'Critical' || r.severity === 'High') && OPEN_RISK_STATUSES.has(r.status)
    );
    const openHighIssues = issues.filter(
      (i: any) => (i.severity === 'Critical' || i.severity === 'High') && OPEN_ISSUE_STATUSES.has(i.status)
    );
    const blockingDependencies = dependencies.filter((d: any) =>
      BLOCKING_DEPENDENCY_STATUSES.has(d.status)
    );
    const slippedMilestones = milestones.filter((m: any) => {
      if (m.status === 'Completed' || m.status === 'Cancelled') return false;
      if (m.status === 'Missed') return true;
      const target = toDate(m.targetDate);
      return target !== null && startOfDay(target) < startOfDay(now);
    });

    // Resolved before the schedule factor so that variance can defer to it:
    // past the end date, elapsed progress necessarily reads 100%, so both
    // factors would otherwise penalise the same underlying condition twice.
    const isOverdue = isPastEndDate && actualProgressPct < 100 && !isProjectClosed;

    // ---- F1. Schedule variance (V1 weight 25 / 15 / +5) --------------------
    if (scheduleLagPct === null) {
      factors.push({
        id: 'schedule_variance',
        label: 'Schedule variance',
        measured: 'Elapsed schedule vs reported progress',
        value: null,
        delta: 0,
        severity: 'neutral',
        included: false,
        unavailableReason: 'Project is missing a start date or end date.',
      });
    } else if (isOverdue) {
      // Superseded by overdue_delivery. The lag is still reported because it is
      // genuinely measured, but it carries no penalty: past the end date it and
      // overdue_delivery describe the same condition.
      factors.push({
        id: 'schedule_variance',
        label: 'Schedule variance',
        measured: 'Elapsed schedule vs reported progress',
        value: scheduleLagPct,
        delta: 0,
        severity: 'info',
        included: true,
        supersededBy: 'overdue_delivery',
        supersededReason:
          'Past the planned end date this duplicates overdue delivery, so only the overdue penalty is applied.',
      });
    } else if (scheduleLagPct > 20) {
      factors.push({
        id: 'schedule_variance',
        label: 'Schedule variance',
        measured: 'Elapsed schedule vs reported progress',
        value: scheduleLagPct,
        delta: -25,
        severity: 'danger',
        included: true,
      });
    } else if (scheduleLagPct > 10) {
      factors.push({
        id: 'schedule_variance',
        label: 'Schedule variance',
        measured: 'Elapsed schedule vs reported progress',
        value: scheduleLagPct,
        delta: -15,
        severity: 'warning',
        included: true,
      });
    } else if (scheduleLagPct < -10) {
      factors.push({
        id: 'schedule_variance',
        label: 'Schedule variance',
        measured: 'Elapsed schedule vs reported progress',
        value: scheduleLagPct,
        delta: 5,
        severity: 'positive',
        included: true,
      });
    } else {
      factors.push({
        id: 'schedule_variance',
        label: 'Schedule variance',
        measured: 'Elapsed schedule vs reported progress',
        value: scheduleLagPct,
        delta: 0,
        severity: 'info',
        included: true,
      });
    }

    // ---- F2. Overdue delivery (V1 weight 35) -------------------------------
    // V1 tested "past deadline with hours remaining". The server has no effort
    // data, so incomplete progress past the end date is used as the equivalent.
    factors.push({
      id: 'overdue_delivery',
      label: 'Overdue delivery',
      measured: 'Past planned end date with incomplete progress',
      value: daysRemaining,
      delta: isOverdue ? -35 : 0,
      severity: isOverdue ? 'danger' : 'info',
      included: true,
    });

    // ---- F3. Burn rate (V1 weight 20) — NOT PORTABLE -----------------------
    factors.push({
      id: 'burn_rate',
      label: 'Required daily burn rate',
      measured: 'Remaining effort hours against remaining days',
      value: null,
      delta: 0,
      severity: 'neutral',
      included: false,
      unavailableReason:
        'No server-side effort data: the application has no time-log repository and Project has no hoursRemaining field.',
    });

    // ---- F4. Blocked stories (V1: min(25, count * 8)) ----------------------
    const blockedPenalty = blockedStories.length > 0 ? Math.min(25, blockedStories.length * 8) : 0;
    factors.push({
      id: 'blocked_work',
      label: 'Blocked stories',
      measured: 'User stories in blocked status',
      value: blockedStories.length,
      delta: -blockedPenalty,
      severity: blockedStories.length > 0 ? 'danger' : 'info',
      included: true,
    });

    // ---- F5. QA bottleneck (V1: -10 when more than 3) ----------------------
    const qaPenalty = storiesAwaitingQa.length > 3 ? 10 : 0;
    factors.push({
      id: 'qa_bottleneck',
      label: 'QA bottleneck',
      measured: 'Stories awaiting test or review',
      value: storiesAwaitingQa.length,
      delta: -qaPenalty,
      severity: qaPenalty > 0 ? 'warning' : 'info',
      included: true,
    });

    // ---- F6. Unmitigated high/critical risks (V1: count * 10) --------------
    // V1 compared Risk.impact to strings; server-side impact is numeric 1-5, so
    // the derived severity band is the equivalent signal.
    // Capped so that risk alone cannot drive the score to zero, matching the
    // capping already applied to every other multi-item factor.
    const riskPenalty = Math.min(MAX_RISK_PENALTY, openHighRisks.length * 10);
    factors.push({
      id: 'unmitigated_risks',
      label: 'Unmitigated high/critical risks',
      measured: 'Open risks at High or Critical severity',
      value: openHighRisks.length,
      delta: -riskPenalty,
      severity: openHighRisks.length > 0 ? 'danger' : 'info',
      included: true,
    });

    // ---- F7. SOW approval (V1: -15) ----------------------------------------
    const sowStatus = project.sowStatus || null;
    const sowApproved = sowStatus ? APPROVED_SOW_STATUSES.has(sowStatus.trim().toLowerCase()) : false;
    if (!sowStatus) {
      factors.push({
        id: 'sow_approval',
        label: 'SOW approval',
        measured: 'Statement of work sign-off state',
        value: null,
        delta: 0,
        severity: 'neutral',
        included: false,
        unavailableReason: 'Project has no recorded SOW status.',
      });
    } else {
      factors.push({
        id: 'sow_approval',
        label: 'SOW approval',
        measured: 'Statement of work sign-off state',
        value: sowStatus,
        delta: sowApproved ? 0 : -15,
        severity: sowApproved ? 'info' : 'warning',
        included: true,
      });
    }

    // ---- F8. Weekend support bonus (V1: +5) — NOT PORTABLE -----------------
    factors.push({
      id: 'weekend_support',
      label: 'Weekend support buffer',
      measured: 'Scheduled weekend delivery shifts',
      value: null,
      delta: 0,
      severity: 'neutral',
      included: false,
      unavailableReason:
        'No server-side weekend roster: weekend work exists only in V1.1 local storage.',
    });

    // ---- F9. Open high/critical issues (server-only, -8 each, cap 24) ------
    const issuePenalty = Math.min(24, openHighIssues.length * 8);
    factors.push({
      id: 'open_critical_issues',
      label: 'Open high/critical issues',
      measured: 'Unresolved issues at High or Critical severity',
      value: openHighIssues.length,
      delta: -issuePenalty,
      severity: openHighIssues.length > 0 ? 'danger' : 'info',
      included: true,
    });

    // ---- F10. Blocking dependencies (server-only, -6 each, cap 18) --------
    const dependencyPenalty = Math.min(18, blockingDependencies.length * 6);
    factors.push({
      id: 'blocking_dependencies',
      label: 'Blocking dependencies',
      measured: 'Dependencies in Blocked or At Risk status',
      value: blockingDependencies.length,
      delta: -dependencyPenalty,
      severity: blockingDependencies.length > 0 ? 'warning' : 'info',
      included: true,
    });

    // ---- F11. Milestone slippage (server-only, -10 each, cap 20) ----------
    const milestonePenalty = Math.min(20, slippedMilestones.length * 10);
    factors.push({
      id: 'milestone_slippage',
      label: 'Milestone slippage',
      measured: 'Missed milestones, or past target date and not completed',
      value: slippedMilestones.length,
      delta: -milestonePenalty,
      severity: slippedMilestones.length > 0 ? 'danger' : 'info',
      included: true,
    });

    // ---- Score -------------------------------------------------------------
    const rawScore = factors.reduce((total, f) => total + (f.included ? f.delta : 0), BASE_SCORE);
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    const measuredFactors = factors.filter((f) => f.included).length;
    const applicableFactors = factors.length;
    const unavailableFactors = applicableFactors - measuredFactors;
    const coverage: ProjectHealthCoverage = {
      measuredFactors,
      applicableFactors,
      unavailableFactors,
      ratio: applicableFactors > 0 ? Math.round((measuredFactors / applicableFactors) * 100) / 100 : 0,
      percentage: applicableFactors > 0 ? Math.round((measuredFactors / applicableFactors) * 100) : 0,
    };

    return {
      projectId: project.id,
      projectCode: project.code || project.id,
      projectName: project.name,
      score,
      band: resolveBand(score),
      coverage,
      factors,
      signals: {
        expectedProgressPct,
        actualProgressPct,
        scheduleLagPct,
        daysRemaining,
        isPastEndDate,
        blockedStories: blockedStories.length,
        blockedTasks: blockedTasks.length,
        storiesAwaitingQa: storiesAwaitingQa.length,
        openHighOrCriticalRisks: openHighRisks.length,
        openHighOrCriticalIssues: openHighIssues.length,
        blockingDependencies: blockingDependencies.length,
        slippedMilestones: slippedMilestones.length,
        sowStatus,
      },
      computedAt: now.toISOString(),
      meta: {
        model: HEALTH_MODEL_VERSION,
        baseScore: BASE_SCORE,
        // Retained for existing consumers; coverage above is the canonical form.
        includedFactors: measuredFactors,
        unavailableFactors,
      },
    };
  },
};
