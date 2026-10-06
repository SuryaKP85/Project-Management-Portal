/**
 * Sprint 21B — V2 PM Home: what needs the signed-in user's attention, what is
 * coming up, and how their accessible projects are doing.
 *
 * One request (GET /home). The server decides the scope; nothing here sends a
 * user or project. Every value is rendered through escapeHtml / cssToken, and
 * navigation targets travel in data attributes (dataArgs), never inline script.
 * The item helpers below are shared with the unified My Work page.
 */

import { MyWorkService } from './services/myWorkService.js';
import { escapeHtml, cssToken, dataArgs, readDataArgs } from './safeHtml.js';

export const TYPE_LABELS = {
  story: 'Story', task: 'Task', subtask: 'Subtask',
  'action-item': 'Action item', 'follow-up': 'Follow-up', 'waiting-for': 'Waiting for',
  requirement: 'Requirement', approval: 'Approval', meeting: 'Meeting',
};

const DUE_BADGES = { overdue: 'bg-danger', 'due-today': 'bg-warning text-dark', 'due-soon': 'bg-info text-dark', upcoming: 'bg-light text-dark border', none: 'bg-light text-muted border' };
const BAND_BADGES = { Critical: 'bg-danger', 'At Risk': 'bg-warning text-dark', Monitor: 'bg-info text-dark', Healthy: 'bg-success', Excellent: 'bg-success' };

/** "Overdue", "Due today", "Due soon", "Upcoming" or "No date"; meetings say "Today" / "This week". */
export function dueLabel(item) {
  const starts = item.dateKind === 'starts';
  switch (item.dueState) {
    case 'overdue': return 'Overdue';
    case 'due-today': return starts ? 'Today' : 'Due today';
    case 'due-soon': return starts ? 'This week' : 'Due soon';
    case 'upcoming': return 'Upcoming';
    default: return 'No date';
  }
}

/** The stored date as the user should read it: a day as stored, a meeting start in local time. */
export function dateText(item) {
  if (!item.date) return '';
  if (item.dateKind !== 'starts') return item.date.slice(0, 10);
  const d = new Date(item.date);
  return Number.isNaN(d.getTime()) ? item.date : d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dueBadge(item) {
  const cls = Object.hasOwn(DUE_BADGES, item.dueState) ? DUE_BADGES[item.dueState] : DUE_BADGES.none;
  const date = dateText(item);
  return `<span class="badge ${cls}">${escapeHtml(item.reason && item.reason !== 'Overdue' && item.reason !== 'Due today' ? item.reason : dueLabel(item))}</span>${date ? `<div class="small text-muted mt-1">${escapeHtml(date)}</div>` : ''}`;
}

export const typeLabel = (type) => (Object.hasOwn(TYPE_LABELS, type) ? TYPE_LABELS[type] : 'Item');
export const projectLabel = (item) => (item.project ? `${item.project.code || item.project.id} · ${item.project.name}` : '—');

/** The item's title as a link to its existing page. */
export function itemLink(item) {
  return `<a href="#" class="text-decoration-none fw-semibold" data-home-open="${dataArgs(item.link?.page, item.link?.tab, item.link?.id)}">${item.code ? `<span class="font-mono text-muted me-1">${escapeHtml(item.code)}</span>` : ''}${escapeHtml(item.title)}</a>`;
}

/** Delegated handler for links written by itemLink. */
export function bindOpenLinks(container, app) {
  if (!container || container.dataset.homeLinksBound) return;
  container.dataset.homeLinksBound = 'true';
  container.addEventListener('click', (e) => {
    const link = e.target.closest('[data-home-open]');
    if (!link) return;
    e.preventDefault();
    const [page, tab, id] = readDataArgs(link, 'data-home-open');
    app?.openTarget({ page, tab, id });
  });
}

export const HomeModule = {
  app: null,
  data: null,
  error: null,

  async init(appInstance) {
    this.app = appInstance;
    const root = document.getElementById('home-workspace');
    if (!root) return;
    bindOpenLinks(root, this.app);
    root.innerHTML = '<p class="text-muted small" role="status"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading your day…</p>';
    try {
      this.data = await MyWorkService.getHome();
      this.error = null;
    } catch (err) {
      this.data = null;
      this.error = err;
    }
    root.innerHTML = this.render();
  },

  render() {
    if (!this.data) {
      return `<p class="text-danger small" role="alert"><i class="fa-solid fa-circle-exclamation me-1"></i>Home could not be loaded: ${escapeHtml(this.error?.message || 'unknown error')}</p>`;
    }
    const d = this.data;
    const s = d.summary || {};
    const stat = (label, value, tone) => `
      <div class="text-center px-3 py-2">
        <div class="fs-4 fw-bold ${value > 0 ? cssToken(tone) : 'text-muted'}">${escapeHtml(value || 0)}</div>
        <div class="small text-muted">${escapeHtml(label)}</div>
      </div>`;
    return `
      <div class="enterprise-card mb-4">
        <div class="d-flex flex-wrap justify-content-around">
          ${stat('Overdue', s.overdue, 'text-danger')}
          ${stat('Due today', s.dueToday, 'text-warning')}
          ${stat('Due this week', s.dueSoon, 'text-info')}
          ${stat('Blocked', s.blocked, 'text-danger')}
          ${stat('Waiting on others', s.waitingOnOthers, 'text-primary')}
          ${d.canApprove ? stat('Awaiting approval', s.approvals, 'text-warning') : ''}
          ${stat('Meetings (7 days)', s.meetingsNext7Days, 'text-primary')}
        </div>
      </div>

      <div class="row g-4 mb-4">
        <div class="col-lg-7">
          <div class="enterprise-card h-100">
            <div class="card-header-clean d-flex justify-content-between align-items-center">
              <h2 class="card-title-clean fs-6 mb-0"><i class="fa-solid fa-bell text-danger"></i> Needs your attention</h2>
              <a href="#" class="small" data-home-open="${dataArgs('my-work')}">Open My Work</a>
            </div>
            <div class="p-3">${this.renderAttention(d)}</div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="enterprise-card mb-4">
            <div class="card-header-clean"><h2 class="card-title-clean fs-6 mb-0"><i class="fa-regular fa-calendar text-primary"></i> Coming up: your meetings</h2></div>
            <div class="p-3">${this.renderList(d.myWork?.meetings, 'No meetings for you in the next 7 days.', 6)}</div>
          </div>
          ${d.canApprove ? `
          <div class="enterprise-card">
            <div class="card-header-clean"><h2 class="card-title-clean fs-6 mb-0"><i class="fa-solid fa-stamp text-warning"></i> Requirements awaiting approval</h2></div>
            <div class="p-3">${this.renderList(d.myWork?.approvals, 'No requirements are waiting for approval in your projects.', 6)}</div>
          </div>` : ''}
        </div>
      </div>

      <div class="enterprise-card">
        <div class="card-header-clean d-flex justify-content-between align-items-center">
          <h2 class="card-title-clean fs-6 mb-0"><i class="fa-solid fa-heart-pulse text-success"></i> My projects</h2>
          <a href="#" class="small" data-home-open="${dataArgs('projects')}">All projects</a>
        </div>
        <div class="p-3">${this.renderPulse(d)}</div>
      </div>`;
  },

  renderAttention(d) {
    const items = d.attention || [];
    if (!items.length) return '<p class="text-muted small mb-0">Nothing is overdue, due today or blocked. Check My Work for what is coming next.</p>';
    const more = d.attentionTotal > items.length
      ? `<p class="small text-muted mt-2 mb-0">Showing ${escapeHtml(items.length)} of ${escapeHtml(d.attentionTotal)}. <a href="#" data-home-open="${dataArgs('my-work')}">See everything in My Work</a>.</p>`
      : '';
    return `
      <ul class="list-group list-group-flush">
        ${items.map((i) => `
          <li class="list-group-item px-0 d-flex gap-3 align-items-start">
            <div style="min-width: 96px;">${dueBadge(i)}</div>
            <div class="flex-grow-1">
              <div>${itemLink(i)}</div>
              <div class="small text-muted">${escapeHtml(typeLabel(i.type))} · ${escapeHtml(projectLabel(i))} · ${escapeHtml(i.status)}</div>
            </div>
          </li>`).join('')}
      </ul>${more}`;
  },

  renderList(items = [], empty, limit) {
    if (!items.length) return `<p class="text-muted small mb-0">${escapeHtml(empty)}</p>`;
    const shown = items.slice(0, limit);
    return `
      <ul class="list-group list-group-flush">
        ${shown.map((i) => `
          <li class="list-group-item px-0">
            <div>${itemLink(i)}</div>
            <div class="small text-muted">${escapeHtml(dateText(i) || dueLabel(i))} · ${escapeHtml(projectLabel(i))}</div>
          </li>`).join('')}
      </ul>
      ${items.length > limit ? `<p class="small text-muted mt-2 mb-0">And ${escapeHtml(items.length - limit)} more in <a href="#" data-home-open="${dataArgs('my-work')}">My Work</a>.</p>` : ''}`;
  },

  renderPulse(d) {
    const projects = d.projects || [];
    const hidden = d.closedProjectsHidden ? `<p class="small text-muted mt-2 mb-0">${escapeHtml(d.closedProjectsHidden)} completed or archived project(s) not shown.</p>` : '';
    if (!projects.length) return `<p class="text-muted small mb-0">You are not on any open project yet.</p>${hidden}`;
    const n = (v) => (v === null || v === undefined ? '—' : escapeHtml(v));
    const warn = (v) => (v > 0 ? 'text-danger fw-semibold' : 'text-muted');
    return `
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
          <thead class="table-light">
            <tr><th>Project</th><th>Health</th><th class="text-end">Overdue delivery</th><th class="text-end">High risks</th><th class="text-end">High issues</th></tr>
          </thead>
          <tbody>
            ${projects.map((p) => `
              <tr>
                <td><a href="#" class="text-decoration-none" data-home-open="${dataArgs('projects')}"><span class="font-mono text-muted me-1">${escapeHtml(p.code || p.id)}</span>${escapeHtml(p.name)}</a></td>
                <td>${p.health ? `<span class="badge ${Object.hasOwn(BAND_BADGES, p.health.band) ? BAND_BADGES[p.health.band] : 'bg-secondary'}">${escapeHtml(p.health.band)}</span> <span class="small text-muted">${escapeHtml(p.health.score)}</span>` : '<span class="small text-muted">Not available</span>'}</td>
                <td class="text-end ${warn(p.overdueDelivery)}">${n(p.overdueDelivery)}</td>
                <td class="text-end ${warn(p.openHighRisks)}">${n(p.openHighRisks)}</td>
                <td class="text-end ${warn(p.openHighIssues)}">${n(p.openHighIssues)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>${hidden}`;
  },
};
