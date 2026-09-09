/**
 * My Work Personal Workspace Module for Surya PM Portal V2.0
 * Shows all assigned work items across active sprints and projects for the current user
 */

import { MyWorkService } from './services/myWorkService.js';
import { DeliveryService } from './services/deliveryService.js';
import { StoryService } from './services/storyService.js';
import { TaskService } from './services/taskService.js';

export const MyWorkModule = {
  app: null,
  workData: null,
  activeFilter: 'all', // 'all' | 'active-sprint' | 'in-progress' | 'blocked' | 'done'
  searchQuery: '',

  async init(appInstance) {
    this.app = appInstance;
    await this.loadData();
    this.setupEvents();
    this.render();
  },

  async loadData() {
    try {
      const data = await MyWorkService.getMyWork();
      this.workData = data || {
        stories: [],
        tasks: [],
        subtasks: [],
        summary: { totalItems: 0, completedItems: 0, inProgressItems: 0, totalPoints: 0, totalEstimatedHours: 0, totalActualHours: 0 },
      };
    } catch (err) {
      console.error('[MyWorkModule] loadData error:', err);
    }
  },

  setupEvents() {
    const container = document.getElementById('my-work-workspace');
    if (!container || container.dataset.eventsBound) return;
    container.dataset.eventsBound = 'true';

    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button, a');
      if (!btn) return;

      const action = btn.dataset.action;
      if (!action) return;

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
      } else if (action === 'log-time') {
        const itemId = btn.dataset.itemId;
        const itemType = btn.dataset.itemType;
        this.openLogTimeModal(itemId, itemType);
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

  render() {
    const container = document.getElementById('my-work-workspace');
    if (!container) return;

    const data = this.workData || {};
    const summary = data.summary || {};
    const allItems = [
      ...(data.stories || []).map((s) => ({ ...s, itemType: 'story' })),
      ...(data.tasks || []).map((t) => ({ ...t, itemType: 'task' })),
      ...(data.subtasks || []).map((st) => ({ ...st, itemType: 'subtask' })),
    ];

    const filtered = this.filterItems(allItems);

    container.innerHTML = `
      <!-- Top Metrics Strip -->
      <div class="stats-grid-executive mb-4">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Assigned Items</span>
            <div class="kpi-icon-wrapper kpi-icon-primary"><i class="fa-solid fa-list-check text-primary"></i></div>
          </div>
          <h2 class="kpi-value">${summary.totalItems || 0}</h2>
          <div class="kpi-footer"><span class="kpi-trend neutral">Personal Work Queue</span></div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">In Progress</span>
            <div class="kpi-icon-wrapper kpi-icon-warning"><i class="fa-solid fa-spinner fa-spin-pulse text-warning"></i></div>
          </div>
          <h2 class="kpi-value text-warning">${summary.inProgressItems || 0}</h2>
          <div class="kpi-footer"><span class="kpi-trend neutral">Active Engineering Units</span></div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Story Points</span>
            <div class="kpi-icon-wrapper kpi-icon-info"><i class="fa-solid fa-book-open text-info"></i></div>
          </div>
          <h2 class="kpi-value text-primary">${summary.totalPoints || 0} pts</h2>
          <div class="kpi-footer"><span class="kpi-trend neutral">Committed Capacity</span></div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Completed</span>
            <div class="kpi-icon-wrapper kpi-icon-success"><i class="fa-solid fa-circle-check text-success"></i></div>
          </div>
          <h2 class="kpi-value text-success">${summary.completedItems || 0}</h2>
          <div class="kpi-footer"><span class="kpi-trend positive">Delivered Output</span></div>
        </div>
      </div>

      <!-- Controls & Filter Strip -->
      <div class="card shadow-sm border-0 mb-4 p-3 bg-white">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div class="btn-group flex-wrap" role="group">
            <button type="button" class="btn btn-sm ${this.activeFilter === 'all' ? 'btn-primary' : 'btn-light'}" data-action="filter-tab" data-filter="all">
              All Items (${allItems.length})
            </button>
            <button type="button" class="btn btn-sm ${this.activeFilter === 'in-progress' ? 'btn-primary' : 'btn-light'}" data-action="filter-tab" data-filter="in-progress">
              <i class="fa-solid fa-spinner fa-spin-pulse me-1"></i> In Progress
            </button>
            <button type="button" class="btn btn-sm ${this.activeFilter === 'active-sprint' ? 'btn-primary' : 'btn-light'}" data-action="filter-tab" data-filter="active-sprint">
              <i class="fa-solid fa-person-running me-1"></i> In Active Sprint
            </button>
            <button type="button" class="btn btn-sm ${this.activeFilter === 'blocked' ? 'btn-primary' : 'btn-light'}" data-action="filter-tab" data-filter="blocked">
              <i class="fa-solid fa-triangle-exclamation text-danger me-1"></i> Blocked / Review
            </button>
            <button type="button" class="btn btn-sm ${this.activeFilter === 'done' ? 'btn-primary' : 'btn-light'}" data-action="filter-tab" data-filter="done">
              <i class="fa-solid fa-circle-check text-success me-1"></i> Completed
            </button>
          </div>

          <div class="search-bar" style="max-width: 240px;">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="my-work-search" placeholder="Search my items..." value="${this.searchQuery}" />
          </div>
        </div>
      </div>

      <!-- Work Items Table -->
      <div class="card shadow-sm border-0 bg-white">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th style="width: 100px;">Code</th>
                <th>Work Item Title</th>
                <th style="width: 130px;">Sprint</th>
                <th style="width: 100px;">Priority</th>
                <th style="width: 110px;">Effort</th>
                <th style="width: 140px;">Status</th>
                <th style="width: 160px;" class="text-end">Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              ${
                filtered.length === 0
                  ? `<tr><td colspan="7" class="p-5 text-center text-muted">No work items found matching this filter.</td></tr>`
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
    });
  },

  renderTableRow(item) {
    const isStory = item.itemType === 'story';
    const isSubtask = item.itemType === 'subtask';
    const code = item.code || (isStory ? 'STR' : isSubtask ? 'SUB' : 'TSK');
    const badgeType = isStory ? 'bg-primary' : isSubtask ? 'bg-info text-dark' : 'bg-success';
    const effort = isStory ? `${item.storyPoints || 0} pts` : `${item.actualEffortHrs || 0}/${item.estimatedEffortHrs || 0}h`;

    const nextStatuses = this.getNextStatusTransitions(item.status);

    return `
      <tr>
        <td>
          <span class="badge ${badgeType} font-mono">${code}</span>
        </td>
        <td>
          <div class="font-bold text-dark">
            <a href="#" class="text-decoration-none text-dark" data-action="view-details" data-item-id="${item.id}" data-item-type="${item.itemType}">
              ${item.title}
            </a>
          </div>
          ${
            item.featureName || item.storyTitle
              ? `<div class="text-muted" style="font-size: 0.75rem;"><i class="fa-solid fa-puzzle-piece text-info me-1"></i>${item.featureName || item.storyTitle}</div>`
              : ''
          }
        </td>
        <td>
          ${
            item.sprint
              ? `<span class="badge bg-light text-dark border font-mono"><i class="fa-solid fa-person-running text-primary me-1"></i>${item.sprint}</span>`
              : `<span class="text-muted" style="font-size: 0.8rem;">Backlog</span>`
          }
        </td>
        <td>
          <span class="badge ${this.getPriorityBadge(item.priority)}" style="font-size: 0.7rem;">${item.priority || 'medium'}</span>
        </td>
        <td>
          <span class="font-mono font-semibold" style="font-size: 0.85rem;">${effort}</span>
        </td>
        <td>
          <span class="badge ${this.getStatusBadge(item.status)}">${item.status}</span>
        </td>
        <td class="text-end">
          <div class="d-inline-flex gap-1">
            ${nextStatuses
              .map(
                (ns) => `
              <button class="btn btn-sm btn-outline-${ns.color} py-1 px-2" data-action="update-status" data-item-id="${item.id}" data-item-type="${item.itemType}" data-new-status="${ns.status}" title="Move to ${ns.label}">
                <i class="${ns.icon}"></i> ${ns.label}
              </button>
            `
              )
              .join('')}
          </div>
        </td>
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
    return items.filter((item) => {
      if (this.activeFilter === 'in-progress' && item.status !== 'in-progress') return false;
      if (this.activeFilter === 'active-sprint' && (!item.sprint || item.sprint === 'Backlog')) return false;
      if (this.activeFilter === 'blocked' && item.status !== 'blocked' && item.status !== 'in-review') return false;
      if (this.activeFilter === 'done' && item.status !== 'done' && item.status !== 'completed') return false;

      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesCode = item.code?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCode) return false;
      }
      return true;
    });
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
        trace = await DeliveryService.getTraceability('story', itemId).catch(() => null);
      } else {
        item = await TaskService.getTaskById(itemId);
        trace = await DeliveryService.getTraceability('task', itemId).catch(() => null);
      }

      if (!item) return;

      const bodyHtml = `
        <div>
          <div class="p-2 bg-light rounded mb-3 border font-mono" style="font-size: 0.75rem;">
            <i class="fa-solid fa-route text-primary me-1"></i>
            <strong>Lineage:</strong> 
            ${trace?.ancestors?.map((a) => `<span class="badge bg-white text-dark border mx-1">${a.entityType}: ${a.name}</span>`).join('&rarr;') || 'Standalone'}
          </div>

          <div class="d-flex justify-content-between align-items-center mb-2">
            <div>
              <span class="badge bg-primary me-1">${item.code}</span>
              <span class="badge bg-secondary">${item.status}</span>
              <span class="badge bg-light text-dark border ms-1">${item.priority}</span>
            </div>
            <span class="font-bold text-primary">${itemType === 'story' ? `${item.storyPoints || 0} pts` : `${item.estimatedEffortHrs || 0}h`}</span>
          </div>

          <h5 class="font-bold mb-2">${item.title}</h5>
          <p class="text-muted" style="font-size: 0.9rem;">${item.description || 'No detailed description.'}</p>
        </div>
      `;

      this.app?.openModal(`Work Item: ${item.code}`, bodyHtml);
    } catch (err) {
      this.app?.showToast(`Error opening item: ${err.message}`, 'danger');
    }
  },
};
