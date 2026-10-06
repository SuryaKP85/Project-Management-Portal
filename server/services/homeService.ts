import { ProjectRepository } from '../repositories/projectRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { SubtaskRepository } from '../repositories/subtaskRepository';
import { ActionItemRepository } from '../repositories/actionItemRepository';
import { FollowUpRepository } from '../repositories/followUpRepository';
import { WaitingForRepository } from '../repositories/waitingForRepository';
import { MeetingRepository } from '../repositories/meetingRepository';
import { RequirementRepository } from '../repositories/requirementRepository';
import { FollowThroughActor, ProjectAccessService } from './followThroughSupport';
import { REQUIREMENT_APPROVER_ROLES } from './requirementService';
import { ProjectHealthService } from './projectHealthService';
import { Project } from '../models/types';

/**
 * Sprint 21B — V2 PM Home and unified My Work: one read-only view over
 * existing records, built for the signed-in user only.
 *
 * - Identity is the verified token's user; nothing is read from the request.
 * - Scope is ProjectAccessService.accessibleProjectIds, computed once: every
 *   project, count and project-linked item comes from those projects only.
 * - Delivery work is the user's by assignee id (as in Sprint 21A); follow-through
 *   by owner id; meetings by organizer or participant id; requirements by
 *   owner id. Approvals are the in-review requirements of accessible projects,
 *   for the roles that may approve (REQUIREMENT_APPROVER_ROLES).
 * - Items are short summaries with a navigation target, not full records.
 * - Dates keep their domain meaning (due, target, expected, meeting start);
 *   dueState only classifies them against today's date (UTC, as My Work does).
 */

export type DueState = 'overdue' | 'due-today' | 'due-soon' | 'upcoming' | 'none';
export type HomeItemType = 'story' | 'task' | 'subtask' | 'action-item' | 'follow-up' | 'waiting-for' | 'requirement' | 'approval' | 'meeting';

export interface HomeItem {
  type: HomeItemType;
  id: string;
  code?: string;
  title: string;
  project: { id: string; code?: string; name: string } | null;
  status: string;
  priority?: string;
  date?: string;
  dateKind?: 'due' | 'target' | 'expected' | 'starts';
  dueState: DueState;
  /** Why it is in the attention list, when it is. */
  reason?: 'Overdue' | 'Due today' | 'Blocked' | 'Follow-up needed';
  link: { page: string; tab?: string; id?: string };
}

const SOON_DAYS = 7;
const ATTENTION_LIMIT = 15;
const CLOSED_DELIVERY = new Set(['done', 'cancelled']);
const OPEN_ACTION_ITEM = new Set(['Open', 'In Progress', 'Blocked']);
const OPEN_WAITING_FOR = new Set(['Waiting', 'Follow-up Needed']);
const CLOSED_PROJECT = new Set(['completed', 'archived']);
const BAND_ORDER = ['Critical', 'At Risk', 'Monitor', 'Healthy', 'Excellent'];

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);

function dueStateOf(date: string | undefined, today: string, soon: string): DueState {
  if (!date) return 'none';
  const day = date.slice(0, 10);
  if (day < today) return 'overdue';
  if (day === today) return 'due-today';
  return day <= soon ? 'due-soon' : 'upcoming';
}

const byDate = (a: HomeItem, b: HomeItem) => (a.date || '9999').localeCompare(b.date || '9999') || a.title.localeCompare(b.title);

export const HomeService = {
  async getHome(actor: FollowThroughActor, options: { now?: Date } = {}) {
    const now = options.now ?? new Date();
    const today = dayOf(now);
    const soon = dayOf(addDays(now, SOON_DAYS));
    const me = actor.userId;

    const projectIds = await ProjectAccessService.accessibleProjectIds(actor);
    const accessible = new Set(projectIds);
    const [allProjects, stories, tasks, subtasks, actionItems, followUps, waitingFor, meetings, requirements] = await Promise.all([
      ProjectRepository.findAll(),
      StoryRepository.findAll(),
      TaskRepository.findAll(),
      SubtaskRepository.findAll({ assigneeId: me }),
      ActionItemRepository.findAll({ projectIds, ownerId: me }),
      FollowUpRepository.findAll({ projectIds, ownerId: me }),
      WaitingForRepository.findAll({ projectIds, ownerId: me }),
      MeetingRepository.findAll({ projectIds }),
      RequirementRepository.findAll({ projectIds }),
    ]);
    const projects = allProjects.filter((p) => accessible.has(p.id));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const projectRef = (id: string | undefined) => {
      const p = id ? projectById.get(id) : undefined;
      return p ? { id: p.id, code: p.code, name: p.name } : null;
    };
    // Fail closed: a delivery item is shown only when its project (a subtask's is its task's) is one of the
    // accessible projects. A missing project, a deleted project or an orphaned subtask is never shown.
    const inScope = (projectId: string | undefined) => !!projectId && accessible.has(projectId);
    const item = (base: Omit<HomeItem, 'dueState' | 'project'> & { projectId?: string }): HomeItem => {
      const { projectId, ...rest } = base;
      return { ...rest, project: projectRef(projectId), dueState: dueStateOf(base.date, today, soon) };
    };

    // --- Delivery: assigned to me by id ------------------------------------
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const delivery: HomeItem[] = [
      ...stories.filter((s) => s.assigneeId === me && !CLOSED_DELIVERY.has(s.status) && inScope(s.projectId)).map((s) => item({
        type: 'story', id: s.id, code: s.code, title: s.title, projectId: s.projectId, status: s.status, priority: s.priority,
        date: s.dueDate, dateKind: 'due', link: { page: 'delivery', tab: 'stories', id: s.id },
      })),
      ...tasks.filter((t) => t.assigneeId === me && !CLOSED_DELIVERY.has(t.status) && inScope(t.projectId)).map((t) => item({
        type: 'task', id: t.id, code: t.code, title: t.title, projectId: t.projectId, status: t.status, priority: t.priority,
        date: t.dueDate, dateKind: 'due', link: { page: 'delivery', tab: 'tasks', id: t.id },
      })),
      ...subtasks.filter((st) => st.assigneeId === me && !CLOSED_DELIVERY.has(st.status)).flatMap((st) => {
        // A subtask belongs to its task's project.
        const projectId = taskById.get(st.taskId)?.projectId;
        if (!inScope(projectId)) return [];
        return [item({
          type: 'subtask', id: st.id, title: st.title, projectId, status: st.status, priority: st.priority,
          date: st.dueDate, dateKind: 'due', link: { page: 'delivery', tab: 'tasks', id: st.taskId },
        })];
      }),
    ].sort(byDate);

    // --- Follow-through: owned by me, in accessible projects ---------------
    const followThrough: HomeItem[] = [
      ...actionItems.filter((a) => OPEN_ACTION_ITEM.has(a.status)).map((a) => item({
        type: 'action-item', id: a.id, title: a.title, projectId: a.projectId, status: a.status, priority: a.priority,
        date: a.dueDate, dateKind: 'due', link: { page: 'meetings', tab: 'action-items', id: a.id },
      })),
      ...followUps.filter((f) => f.status === 'Open').map((f) => item({
        type: 'follow-up', id: f.id, title: f.title, projectId: f.projectId, status: f.status,
        date: f.dueDate, dateKind: 'due', link: { page: 'meetings', tab: 'follow-ups', id: f.id },
      })),
      ...waitingFor.filter((w) => OPEN_WAITING_FOR.has(w.status)).map((w) => item({
        type: 'waiting-for', id: w.id, title: w.title, projectId: w.projectId, status: w.status,
        date: w.expectedDate, dateKind: 'expected', link: { page: 'meetings', tab: 'waiting-for', id: w.id },
      })),
    ].sort(byDate);

    // --- Requirements: mine in draft / in review; approvals for approvers --
    const ownedRequirements: HomeItem[] = requirements
      .filter((r) => r.ownerId === me && (r.status === 'draft' || r.status === 'in-review'))
      .map((r) => item({
        type: 'requirement', id: r.id, code: r.code, title: r.title, projectId: r.projectId, status: r.status, priority: r.priority,
        date: r.targetDate, dateKind: 'target', link: { page: 'requirements', id: r.id },
      }))
      .sort(byDate);
    const canApprove = REQUIREMENT_APPROVER_ROLES.includes(actor.role);
    const approvals: HomeItem[] = canApprove
      ? requirements.filter((r) => r.status === 'in-review').map((r) => item({
        type: 'approval', id: r.id, code: r.code, title: r.title, projectId: r.projectId, status: r.status, priority: r.priority,
        date: r.targetDate, dateKind: 'target', link: { page: 'requirements', id: r.id },
      })).sort(byDate)
      : [];

    // --- Meetings: I organise or attend, scheduled from today for 7 days ---
    const meetingWindowEnd = addDays(now, SOON_DAYS).toISOString();
    const upcomingMeetings: HomeItem[] = meetings
      .filter((m) => m.status === 'Scheduled' && (m.organizerId === me || (m.participantIds || []).includes(me)))
      .filter((m) => m.scheduledAt.slice(0, 10) >= today && m.scheduledAt <= meetingWindowEnd)
      .map((m) => item({
        type: 'meeting', id: m.id, title: m.title, projectId: m.projectId, status: m.status,
        date: m.scheduledAt, dateKind: 'starts', link: { page: 'meetings', tab: 'meetings', id: m.id },
      }))
      .sort(byDate);

    // --- Attention: overdue, due today, blocked, follow-up needed ----------
    const reasonFor = (i: HomeItem): HomeItem['reason'] => {
      if (i.dueState === 'overdue') return 'Overdue';
      if (i.dueState === 'due-today') return 'Due today';
      if (i.status === 'blocked' || i.status === 'Blocked') return 'Blocked';
      if (i.status === 'Follow-up Needed') return 'Follow-up needed';
      return undefined;
    };
    const rank = { Overdue: 0, 'Due today': 1, Blocked: 2, 'Follow-up needed': 3 };
    const attentionAll = [...delivery, ...followThrough, ...ownedRequirements]
      .map((i) => ({ ...i, reason: reasonFor(i) }))
      .filter((i) => i.reason)
      .sort((a, b) => rank[a.reason!] - rank[b.reason!] || byDate(a, b));

    // --- Project pulse: accessible, open projects; existing health model ---
    const overdueByProject = new Map<string, number>();
    for (const d of [...stories, ...tasks]) {
      if (d.projectId && accessible.has(d.projectId) && d.dueDate && d.dueDate < today && !CLOSED_DELIVERY.has(d.status)) {
        overdueByProject.set(d.projectId, (overdueByProject.get(d.projectId) || 0) + 1);
      }
    }
    const pulse = await Promise.all(projects.filter((p: Project) => !CLOSED_PROJECT.has(String(p.status))).map(async (p) => {
      const health = await ProjectHealthService.computeHealth(p, { now }).catch(() => null);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        health: health ? { band: health.band, score: health.score } : null,
        overdueDelivery: overdueByProject.get(p.id) || 0,
        openHighRisks: health ? health.signals.openHighOrCriticalRisks : null,
        openHighIssues: health ? health.signals.openHighOrCriticalIssues : null,
      };
    }));
    const bandRank = (band?: string) => (band ? BAND_ORDER.indexOf(band) : BAND_ORDER.length);
    pulse.sort((a, b) => bandRank(a.health?.band) - bandRank(b.health?.band) || String(a.name).localeCompare(String(b.name)));

    const open = [...delivery, ...followThrough, ...ownedRequirements];
    const count = (state: DueState) => open.filter((i) => i.dueState === state).length;
    return {
      user: { id: me, name: actor.name, role: actor.role },
      today,
      canApprove,
      summary: {
        overdue: count('overdue'),
        dueToday: count('due-today'),
        dueSoon: count('due-soon'),
        blocked: open.filter((i) => i.status === 'blocked' || i.status === 'Blocked').length,
        waitingOnOthers: followThrough.filter((i) => i.type === 'waiting-for').length,
        approvals: approvals.length,
        meetingsNext7Days: upcomingMeetings.length,
      },
      attention: attentionAll.slice(0, ATTENTION_LIMIT),
      attentionTotal: attentionAll.length,
      myWork: { delivery, followThrough, requirements: ownedRequirements, approvals, meetings: upcomingMeetings },
      projects: pulse,
      closedProjectsHidden: projects.length - pulse.length,
    };
  },
};
