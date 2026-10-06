/**
 * My Work — Sprint 21B: one workspace for everything that is the signed-in
 * user's: assigned stories, tasks and subtasks; owned action items, follow-ups
 * and waiting-for items; owned requirements in draft or review; requirements
 * awaiting their approval (approver roles only); meetings in the next 7 days.
 * Read from GET /home (the server decides the scope); stories and tasks keep
 * their quick status actions and details view.
 */

import { MyWorkService } from './services/myWorkService.js';
import { escapeHtml, dataArgs } from './safeHtml.js';
import { DeliveryService } from './services/deliveryService.js';
import { StoryService } from './services/storyService.js';
import { TaskService } from './services/taskService.js';
import { MicrosoftService } from './services/microsoftService.js';
import { bindOpenLinks, dueBadge, itemLink, projectLabel, typeLabel } from './home.js';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'followThrough', label: 'Follow-through' },
  { key: 'requirements', label: 'My requirements' },
  { key: 'approvals', label: 'Approvals', approverOnly: true },
  { key: 'meetings', label: 'Meetings' },
];

const escapeOutlook = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const MyWorkModule = {
  app: null,
  workData: null,
  error: null,
  activeFilter: 'all', // a CATEGORIES key
  searchQuery: '',

  async init(appInstance) {
    this.app = appInstance;
    // Sprint 10A: read-only Outlook panel, loaded independently of the work queue.
    this.loadOutlookEvents();
    await this.loadData();
    this.setupEvents();
    this.render();
  },

  /**
   * Loads the signed-in user's upcoming Outlook events (Sprint 10A). States:
   * loading, not configured, not connected, error, no events, events.
   */
  async loadOutlookEvents() {
    const panel = document.getElementById('my-work-outlook-panel');
    if (!panel) return;
    const message = (text, role = 'status', tone = 'text-muted') =>
      `<p class="${tone} small mb-0" role="${role}">${text}</p>`;
    panel.innerHTML = message('Loading Outlook events…');
    try {
      const status = await MicrosoftService.getStatus();
      if (!status || !status.connected) {
        panel.innerHTML = status && status.configured === false
          ? message('Microsoft 365 integration is not configured on this server.')
          : message('Connect your Microsoft 365 account in <a href="#" data-outlook-settings>Settings</a> to see upcoming Outlook events here.');
        panel.querySelector('[data-outlook-settings]')?.addEventListener('click', (e) => {
          e.preventDefault();
          this.app?.switchPage?.('settings');
        });
        return;
      }
      const calendar = await MicrosoftService.getCalendar(7);
      this.renderOutlookEvents(calendar);
    } catch (err) {
      panel.innerHTML = message(`<i class="fa-solid fa-circle-exclamation me-1"></i>Outlook events could not be loaded: ${escapeOutlook((err && err.message) || 'server error')}`, 'alert', 'text-danger');
    }
  },

  renderOutlookEvents(calendar) {
    const panel = document.getElementById('my-work-outlook-panel');
    if (!panel) return;
    const events = (calendar && calendar.events) || [];
    if (events.length === 0) {
      panel.innerHTML = '<p class="text-muted small mb-0" role="status">No Outlook events in the next 7 days.</p>';
      return;
    }
    const when = (e) => {
      if (!e.start) return '—';
      const start = new Date(e.start);
      return e.isAllDay
        ? `${start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · All day`
        : start.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    };
    const items = events.map((e) => `
        <li class="list-group-item d-flex justify-content-between align-items-start gap-3 px-0">
          <div>
            <div class="fw-semibold small">${e.isCancelled ? '<span class="badge bg-light text-secondary border me-1">Cancelled</span>' : ''}${escapeOutlook(e.subject)}</div>
            <div class="small text-muted">${escapeOutlook(when(e))}${e.location ? ` · ${escapeOutlook(e.location)}` : ''}${e.organizer ? ` · ${escapeOutlook(e.organizer)}` : ''}</div>
          </div>
          ${e.webLink ? `<a class="small text-nowrap" href="${escapeOutlook(e.webLink)}" target="_blank" rel="noopener noreferrer">Open in Outlook</a>` : ''}
        </li>`).join('');
    panel.innerHTML = `
      <ul class="list-group list-group-flush">${items}</ul>
      ${calendar.truncated ? '<p class="small text-muted mt-2 mb-0">Showing the first 50 events.</p>' : ''}`;
  },

  async loadData() {
    try {
      this.workData = await MyWorkService.getHome();
      this.error = null;
    } catch (err) {
      this.workData = null;
      this.error = err;
      console.error('[MyWorkModule] loadData error:', err);
    }
  },

  setupEvents() {
    const container = document.getElementById('my-work-workspace');
    if (!container || container.dataset.eventsBound) return;
    container.dataset.eventsBound = 'true';
    bindOpenLinks(container, this.app);

    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button, a');
      if (!btn) return;

      const action = btn.dataset.action;
      if (!action) return;
      e.preventDefault();

      if (action === 'update-status') {
        const itemId = btn.dataset.itemId;
        const itemType = btn.dataset.itemType;
        const newStatus = btn.dataset.newStatus;
        await this.handleStatusUpdate(itemId, itemType, newStatus);
      } else if (action === 'filter-tab') {
        this.activeFilter = btn.dataset.filter;
        this.render();
      } else if (action === 'view-details') {
        const itemId = btn.dataset.itemId;
        const itemType = btn.dataset.itemType;
        await this.openDetailsModal(itemId, itemType);
      }
    });
  },

  async handleStatusUpdate(itemId, itemType, newStatus) {
    try {
      await MyWorkService.updateStatus(itemId, itemType, newStatus);
      this.app?.showToast(`Item transitioned to ${newStatus}`, 'success');
      await this.loadData();
      this.render();
    } catch (err) {
      this.app?.showToast(err.message || 'Status update failed', 'danger');
    }
  },

  /** The items of the selected category; "all" is ordered overdue first, then by date. */
  itemsFor(filter) {
    const work = this.workData?.myWork || {};
    if (filter !== 'all') return work[filter] || [];
    const rank = { overdue: 0, 'due-today': 1, 'due-soon': 2, upcoming: 3, none: 4 };
    return CATEGORIES.filter((c) => c.key !== 'all').flatMap((c) => work[c.key] || [])
      .sort((a, b) => (rank[a.dueState] ?? 4) - (rank[b.dueState] ?? 4) || String(a.date || '9999').localeCompare(String(b.date || '9999')));
  },

  render() {
    const container = document.getElementById('my-work-workspace');
    if (!container) return;
    if (!this.workData) {
      container.innerHTML = `<p class="text-danger small" role="alert"><i class="fa-solid fa-circle-exclamation me-1"></i>My Work could not be loaded: ${escapeHtml(this.error?.message || 'unknown error')}</p>`;
      return;
    }

    const summary = this.workData.summary || {};
    const categories = CATEGORIES.filter((c) => !c.approverOnly || this.workData.canApprove);
    if (!categories.some((c) => c.key === this.activeFilter)) this.activeFilter = 'all';
    const filtered = this.filterItems(this.itemsFor(this.activeFilter));

    container.innerHTML = `
      <div class="card shadow-sm border-0 mb-4 p-3 bg-white">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div class="btn-group flex-wrap" role="group" aria-label="Work categories">
            ${categories.map((c) => `
              <button type="button" class="btn btn-sm ${this.activeFilter === c.key ? 'btn-primary' : 'btn-light'}" data-action="filter-tab" data-filter="${escapeHtml(c.key)}">
                ${escapeHtml(c.label)} (${escapeHtml(this.itemsFor(c.key).length)})
              </button>`).join('')}
          </div>
          <div class="d-flex align-items-center gap-3">
            <span class="small"><span class="${summary.overdue ? 'text-danger fw-semibold' : 'text-muted'}">${escapeHtml(summary.overdue || 0)} overdue</span> · <span class="text-muted">${escapeHtml(summary.dueToday || 0)} due today</span></span>
            <div class="search-bar" style="max-width: 240px;">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" id="my-work-search" placeholder="Search my items..." value="${escapeHtml(this.searchQuery)}" />
            </div>
          </div>
        </div>
      </div>

      <div class="card shadow-sm border-0 bg-white">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="width: 120px;">Due</th>
                <th style="width: 110px;">Type</th>
                <th>Item</th>
                <th style="width: 200px;">Project</th>
                <th style="width: 120px;">Status</th>
                <th style="width: 90px;">Priority</th>
                <th style="width: 180px;" class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${
                filtered.length === 0
                  ? `<tr><td colspan="7" class="p-5 text-center text-muted">${this.searchQuery ? 'No items match your search.' : 'Nothing here: you are all caught up.'}</td></tr>`
                  : filtered.map((item) => this.renderTableRow(item)).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('my-work-search')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
      const input = document.getElementById('my-work-search');
      input?.focus();
      input?.setSelectionRange?.(input.value.length, input.value.length);
    });
  },

  renderTableRow(item) {
    // Stories and tasks keep the quick status actions and the details view.
    const quick = item.type === 'story' || item.type === 'task';
    const title = quick
      ? `<a href="#" class="text-decoration-none fw-semibold" data-action="view-details" data-item-id="${escapeHtml(item.id)}" data-item-type="${escapeHtml(item.type)}">${item.code ? `<span class="font-mono text-muted me-1">${escapeHtml(item.code)}</span>` : ''}${escapeHtml(item.title)}</a>`
      : itemLink(item);
    const actions = quick
      ? this.getNextStatusTransitions(item.status).map((ns) => `
          <button class="btn btn-sm btn-outline-${ns.color} py-1 px-2" data-action="update-status" data-item-id="${escapeHtml(item.id)}" data-item-type="${escapeHtml(item.type)}" data-new-status="${escapeHtml(ns.status)}" title="Move to ${ns.label}">
            <i class="${ns.icon}"></i> ${ns.label}
          </button>`).join('')
      : `<a href="#" class="btn btn-sm btn-outline-secondary py-1 px-2" data-home-open="${dataArgs(item.link?.page, item.link?.tab, item.link?.id)}">Open</a>`;

    return `
      <tr>
        <td>${dueBadge(item)}</td>
        <td><span class="small">${escapeHtml(typeLabel(item.type))}</span></td>
        <td>${title}</td>
        <td><span class="small text-muted">${escapeHtml(projectLabel(item))}</span></td>
        <td><span class="badge ${this.getStatusBadge(item.status)}">${escapeHtml(item.status)}</span></td>
        <td>${item.priority ? `<span class="badge ${this.getPriorityBadge(String(item.priority).toLowerCase())}" style="font-size: 0.7rem;">${escapeHtml(item.priority)}</span>` : '<span class="text-muted small">—</span>'}</td>
        <td class="text-end"><div class="d-inline-flex gap-1">${actions}</div></td>
      </tr>
    `;
  },

  getNextStatusTransitions(currentStatus) {
    if (currentStatus === 'ready' || currentStatus === 'backlog' || currentStatus === 'planned') {
      return [{ status: 'in-progress', label: 'Start', icon: 'fa-solid fa-play', color: 'primary' }];
    }
    if (currentStatus === 'in-progress') {
      return [
        { status: 'in-review', label: 'Review', icon: 'fa-solid fa-eye', color: 'warning' },
        { status: 'done', label: 'Done', icon: 'fa-solid fa-check', color: 'success' },
      ];
    }
    if (currentStatus === 'in-review' || currentStatus === 'blocked') {
      return [
        { status: 'in-progress', label: 'Resume', icon: 'fa-solid fa-play', color: 'primary' },
        { status: 'testing', label: 'Test', icon: 'fa-solid fa-vial', color: 'info' },
        { status: 'done', label: 'Done', icon: 'fa-solid fa-check', color: 'success' },
      ];
    }
    if (currentStatus === 'testing') {
      return [
        { status: 'in-progress', label: 'Fix', icon: 'fa-solid fa-wrench', color: 'warning' },
        { status: 'done', label: 'Accept', icon: 'fa-solid fa-check', color: 'success' },
      ];
    }
    return [{ status: 'in-progress', label: 'Reopen', icon: 'fa-solid fa-rotate-left', color: 'secondary' }];
  },

  filterItems(items) {
    if (!this.searchQuery) return items;
    const q = this.searchQuery.toLowerCase();
    return items.filter((item) => item.title?.toLowerCase().includes(q) || item.code?.toLowerCase().includes(q));
  },

  getStatusBadge(status) {
    if (status === 'done' || status === 'completed') return 'bg-success';
    if (status === 'in-progress') return 'bg-primary';
    if (status === 'in-review') return 'bg-warning text-dark';
    if (status === 'blocked') return 'bg-danger';
    if (status === 'testing') return 'bg-info text-dark';
    return 'bg-secondary';
  },

  getPriorityBadge(priority) {
    if (priority === 'critical') return 'bg-danger';
    if (priority === 'high') return 'bg-warning text-dark';
    if (priority === 'medium') return 'bg-info text-dark';
    return 'bg-secondary';
  },

  async openDetailsModal(itemId, itemType) {
    try {
      let item = null;
      let trace = null;

      if (itemType === 'story') {
        item = await StoryService.getStoryById(itemId);
        trace = await DeliveryService.getTrace('story', itemId).catch(() => null);
      } else {
        item = await TaskService.getTaskById(itemId);
        trace = await DeliveryService.getTrace('task', itemId).catch(() => null);
      }

      if (!item) return;

      const bodyHtml = `
        <div>
          <div class="p-2 bg-light rounded mb-3 border font-mono" style="font-size: 0.75rem;">
            <i class="fa-solid fa-route text-primary me-1"></i>
            <strong>Lineage:</strong> 
            ${trace?.ancestors?.map((a) => `<span class="badge bg-white text-dark border mx-1">${escapeHtml(a.type)}: ${escapeHtml(a.name)}</span>`).join('&rarr;') || 'Standalone'}
          </div>

          <div class="d-flex justify-content-between align-items-center mb-2">
            <div>
              <span class="badge bg-primary me-1">${escapeHtml(item.code)}</span>
              <span class="badge bg-secondary">${escapeHtml(item.status)}</span>
              <span class="badge bg-light text-dark border ms-1">${escapeHtml(item.priority)}</span>
            </div>
            <span class="font-bold text-primary">${itemType === 'story' ? `${escapeHtml(item.storyPoints || 0)} pts` : `${escapeHtml(item.estimatedEffortHrs || 0)}h`}</span>
          </div>

          <h5 class="font-bold mb-2">${escapeHtml(item.title)}</h5>
          <p class="text-muted" style="font-size: 0.9rem;">${escapeHtml(item.description || 'No detailed description.')}</p>
        </div>
      `;

      this.app?.openModal(`Work Item: ${escapeHtml(item.code)}`, bodyHtml);
    } catch (err) {
      this.app?.showToast(`Error opening item: ${err.message}`, 'danger');
    }
  },
};
