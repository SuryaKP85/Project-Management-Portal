/**
 * Sprint Planning & Backlog Management Module for Surya PM Portal V2.0
 * Connects directly to delivery hierarchy (Stories, Tasks, Features, Epics, Projects)
 */

import { BacklogService } from './services/backlogService.js';
import { SprintService } from './services/sprintService.js';
import { StoryService } from './services/storyService.js';
import { TaskService } from './services/taskService.js';
import { ProjectService } from './services/projectService.js';
import { FeatureService } from './services/featureService.js';
import { EpicService } from './services/epicService.js';
import { UserService } from './services/userService.js';
import { VelocityService } from './services/velocityService.js';
import { AgileMetrics } from './agileMetrics.js';

export const SprintPlanningModule = {
  app: null,
  backlogItems: [],
  sprints: [],
  selectedSprint: null,
  sprintItems: { stories: [], tasks: [] },
  capacitySummary: null,
  projects: [],
  features: [],
  epics: [],
  users: [],

  // Backlog filters
  filterProjectId: 'all',
  filterPriority: 'all',
  filterType: 'all',
  searchQuery: '',
  selectedBacklogIds: new Set(),

  async init(appInstance) {
    this.app = appInstance;
    await this.loadData();
    this.setupEvents();
    this.render();
  },

  async loadData() {
    try {
      const [backlogData, sprints, projects, features, epics, users] = await Promise.all([
        BacklogService.getBacklog({ projectId: this.filterProjectId !== 'all' ? this.filterProjectId : undefined }),
        SprintService.getSprints({ projectId: this.filterProjectId !== 'all' ? this.filterProjectId : undefined }),
        ProjectService.getProjects(),
        FeatureService.getFeatures(),
        EpicService.getEpics(),
        UserService.getUsers(),
      ]);

      this.backlogItems = Array.isArray(backlogData) ? backlogData : backlogData?.items || [];
      this.sprints = sprints || [];
      this.projects = projects || [];
      this.features = features || [];
      this.epics = epics || [];
      this.users = users || [];

      // Default selected sprint to first planning sprint or active sprint
      if (!this.selectedSprint && this.sprints.length > 0) {
        this.selectedSprint = this.sprints.find((s) => s.status === 'planning') || this.sprints.find((s) => s.status === 'active') || this.sprints[0];
      }

      if (this.selectedSprint) {
        await this.loadSprintDetails(this.selectedSprint.id);
      }
    } catch (err) {
      console.error('[SprintPlanningModule] loadData error:', err);
    }
  },

  async loadSprintDetails(sprintId) {
    try {
      const [itemsRes, capRes] = await Promise.all([
        SprintService.getSprintItems(sprintId).catch(() => null),
        SprintService.getSprintCapacity(sprintId).catch(() => null),
      ]);

      if (itemsRes) {
        this.sprintItems = {
          stories: itemsRes.stories || [],
          tasks: itemsRes.tasks || [],
        };
        if (itemsRes.sprint) this.selectedSprint = itemsRes.sprint;
      }
      this.capacitySummary = capRes;
    } catch (err) {
      console.error('[SprintPlanningModule] loadSprintDetails error:', err);
    }
  },

  setupEvents() {
    const container = document.getElementById('sprint-planning-workspace');
    if (!container || container.dataset.eventsBound) return;
    container.dataset.eventsBound = 'true';

    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button, a');
      if (!btn) return;

      const action = btn.dataset.action;
      if (!action) return;

      if (action === 'switch-sprint') {
        const id = btn.dataset.sprintId;
        this.selectedSprint = this.sprints.find((s) => s.id === id);
        if (this.selectedSprint) {
          await this.loadSprintDetails(this.selectedSprint.id);
          this.render();
        }
      } else if (action === 'create-sprint') {
        this.openCreateSprintModal();
      } else if (action === 'create-backlog-item') {
        this.openCreateBacklogItemModal();
      } else if (action === 'add-to-sprint') {
        const itemId = btn.dataset.itemId;
        const itemType = btn.dataset.itemType;
        await this.addItemToSprint(itemId, itemType);
      } else if (action === 'remove-from-sprint') {
        const itemId = btn.dataset.itemId;
        const itemType = btn.dataset.itemType;
        await this.removeItemFromSprint(itemId, itemType);
      } else if (action === 'bulk-add-to-sprint') {
        await this.bulkAddSelectedToSprint();
      } else if (action === 'start-sprint') {
        await this.handleStartSprint();
      } else if (action === 'view-velocity') {
        this.openVelocityModal();
      } else if (action === 'move-backlog-up') {
        const itemId = btn.dataset.itemId;
        await this.reorderBacklogItem(itemId, -1);
      } else if (action === 'move-backlog-down') {
        const itemId = btn.dataset.itemId;
        await this.reorderBacklogItem(itemId, 1);
      }
    });

    container.addEventListener('change', (e) => {
      if (e.target.classList.contains('backlog-select-checkbox')) {
        const id = e.target.dataset.itemId;
        if (e.target.checked) {
          this.selectedBacklogIds.add(id);
        } else {
          this.selectedBacklogIds.delete(id);
        }
        this.updateBulkActionBar();
      }
    });
  },

  async reorderBacklogItem(itemId, direction) {
    const idx = this.backlogItems.findIndex((i) => i.id === itemId);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= this.backlogItems.length) return;

    // Swap in array
    const temp = this.backlogItems[idx];
    this.backlogItems[idx] = this.backlogItems[targetIdx];
    this.backlogItems[targetIdx] = temp;

    // Send order to backend
    const orders = this.backlogItems.map((item, index) => ({
      itemId: item.id,
      itemType: item.itemType,
      order: index + 1,
    }));

    try {
      await BacklogService.reorderBacklog(orders);
      this.render();
    } catch (err) {
      this.app?.showToast('Failed to save backlog order', 'warning');
    }
  },

  async addItemToSprint(itemId, itemType) {
    if (!this.selectedSprint) {
      this.app?.showToast('Please select or create a sprint first', 'warning');
      return;
    }

    try {
      await BacklogService.moveToSprint(itemId, itemType, this.selectedSprint.id);
      this.app?.showToast('Item moved to sprint scope', 'success');
      await this.loadData();
      if (this.selectedSprint) await this.loadSprintDetails(this.selectedSprint.id);
      this.render();
    } catch (err) {
      this.app?.showToast(`Failed adding item: ${err.message}`, 'danger');
    }
  },

  async removeItemFromSprint(itemId, itemType) {
    if (!this.selectedSprint) return;

    try {
      await SprintService.removeSprintItem(this.selectedSprint.id, itemId, itemType);
      this.app?.showToast('Item returned to backlog', 'success');
      await this.loadData();
      if (this.selectedSprint) await this.loadSprintDetails(this.selectedSprint.id);
      this.render();
    } catch (err) {
      this.app?.showToast(`Failed removing item: ${err.message}`, 'danger');
    }
  },

  async bulkAddSelectedToSprint() {
    if (!this.selectedSprint) return;
    if (this.selectedBacklogIds.size === 0) return;

    try {
      await BacklogService.bulkMoveToSprint(Array.from(this.selectedBacklogIds), this.selectedSprint.id);
      this.app?.showToast(`Moved ${this.selectedBacklogIds.size} items to sprint`, 'success');
      this.selectedBacklogIds.clear();
      await this.loadData();
      if (this.selectedSprint) await this.loadSprintDetails(this.selectedSprint.id);
      this.render();
    } catch (err) {
      this.app?.showToast(err.message || 'Bulk move failed', 'danger');
    }
  },

  async handleStartSprint() {
    if (!this.selectedSprint) return;
    try {
      await SprintService.startSprint(this.selectedSprint.id);
      this.app?.showToast(`Sprint "${this.selectedSprint.name}" is now Active!`, 'success');
      await this.loadData();
      this.render();
    } catch (err) {
      this.app?.showToast(err.message || 'Failed to start sprint', 'danger');
    }
  },

  updateBulkActionBar() {
    const bar = document.getElementById('backlog-bulk-bar');
    const countEl = document.getElementById('backlog-selected-count');
    if (!bar || !countEl) return;

    if (this.selectedBacklogIds.size > 0) {
      bar.classList.remove('d-none');
      countEl.textContent = `${this.selectedBacklogIds.size} items selected`;
    } else {
      bar.classList.add('d-none');
    }
  },

  render() {
    const container = document.getElementById('sprint-planning-workspace');
    if (!container) return;

    const filteredBacklog = this.filterBacklog();
    const sprint = this.selectedSprint;

    const sprintStories = this.sprintItems.stories || [];
    const sprintTasks = this.sprintItems.tasks || [];
    const committedPoints = sprintStories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const committedHours = sprintTasks.reduce((sum, t) => sum + (t.estimatedEffortHrs || 0), 0);

    const cap = this.capacitySummary;
    const isOverCap = cap?.isOverCapacity || (sprint && committedPoints > (sprint.capacityPoints || 40));

    container.innerHTML = `
      <!-- Page Header with Metrics Strip -->
      <div class="card shadow-sm border-0 mb-4 p-3 bg-white">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h4 class="font-bold mb-1 text-dark">
              <i class="fa-solid fa-list-check text-primary me-2"></i>Sprint Planning & Backlog Management
            </h4>
            <p class="text-muted mb-0" style="font-size: 0.85rem;">
              Prioritize deliverables from the delivery hierarchy, balance team capacity, and commit sprint scopes.
            </p>
          </div>

          <div class="d-flex align-items-center gap-2 flex-wrap">
            <select class="form-select form-select-sm" id="planning-filter-project" style="width: 180px;">
              <option value="all">All Projects</option>
              ${this.projects.map((p) => `<option value="${p.id}" ${this.filterProjectId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
            <button class="btn btn-sm btn-outline-primary" data-action="view-velocity">
              <i class="fa-solid fa-chart-simple me-1"></i> Velocity History
            </button>
            <button class="btn btn-sm btn-primary font-bold" data-action="create-sprint">
              <i class="fa-solid fa-plus me-1"></i> New Sprint
            </button>
          </div>
        </div>
      </div>

      <!-- Two-Pane Planning Grid -->
      <div class="row g-4">
        <!-- LEFT PANE: Backlog Repository -->
        <div class="col-lg-6">
          <div class="card shadow-sm border-0 h-100 bg-white">
            <div class="card-header bg-white py-3 px-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="d-flex align-items-center gap-2">
                <span class="font-bold text-dark" style="font-size: 1rem;">
                  <i class="fa-solid fa-inbox text-warning me-1"></i> Product Backlog
                </span>
                <span class="badge bg-secondary font-mono">${filteredBacklog.length} items</span>
              </div>

              <button class="btn btn-sm btn-outline-success font-semibold" data-action="create-backlog-item">
                <i class="fa-solid fa-plus me-1"></i> Add Backlog Item
              </button>
            </div>

            <!-- Filters Bar -->
            <div class="p-2 border-bottom bg-light d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="d-flex gap-2">
                <select class="form-select form-select-sm" id="backlog-filter-priority" style="width: 130px;">
                  <option value="all">All Priorities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select class="form-select form-select-sm" id="backlog-filter-type" style="width: 120px;">
                  <option value="all">All Types</option>
                  <option value="story">Stories</option>
                  <option value="task">Tasks</option>
                </select>
              </div>
              <div class="search-bar" style="max-width: 180px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="backlog-search-input" placeholder="Search..." value="${this.searchQuery}" />
              </div>
            </div>

            <!-- Bulk Action Bar -->
            <div id="backlog-bulk-bar" class="p-2 bg-primary-subtle text-primary border-bottom d-flex justify-content-between align-items-center ${this.selectedBacklogIds.size > 0 ? '' : 'd-none'}">
              <span class="font-bold" id="backlog-selected-count">${this.selectedBacklogIds.size} items selected</span>
              <button class="btn btn-sm btn-primary font-bold" data-action="bulk-add-to-sprint">
                <i class="fa-solid fa-arrow-right me-1"></i> Move to Selected Sprint
              </button>
            </div>

            <!-- Backlog Items List -->
            <div class="card-body p-2 d-flex flex-column gap-2" style="max-height: 640px; overflow-y: auto;">
              ${
                filteredBacklog.length === 0
                  ? `<div class="p-4 text-center text-muted">No items in the backlog matching current filters.</div>`
                  : filteredBacklog.map((item, idx) => this.renderBacklogItem(item, idx, filteredBacklog.length)).join('')
              }
            </div>
          </div>
        </div>

        <!-- RIGHT PANE: Sprint & Capacity Workspace -->
        <div class="col-lg-6">
          <div class="card shadow-sm border-0 h-100 bg-white">
            <div class="card-header bg-white py-3 px-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="d-flex align-items-center gap-2">
                <span class="font-bold text-dark" style="font-size: 1rem;">
                  <i class="fa-solid fa-person-running text-primary me-1"></i> Sprint Scope
                </span>
                <div class="dropdown">
                  <button class="btn btn-sm btn-outline-dark dropdown-toggle font-bold" type="button" data-bs-toggle="dropdown">
                    ${sprint ? `${sprint.name} (${sprint.status})` : 'Select Sprint'}
                  </button>
                  <ul class="dropdown-menu shadow">
                    ${this.sprints
                      .map(
                        (s) => `
                      <li>
                        <a class="dropdown-item d-flex justify-content-between align-items-center ${sprint && s.id === sprint.id ? 'active' : ''}" href="#" data-action="switch-sprint" data-sprint-id="${s.id}">
                          <span>${s.name}</span>
                          <span class="badge ${s.status === 'active' ? 'bg-success' : s.status === 'completed' ? 'bg-secondary' : 'bg-warning text-dark'} ms-2" style="font-size: 0.65rem;">${s.status}</span>
                        </a>
                      </li>
                    `
                      )
                      .join('')}
                  </ul>
                </div>
              </div>

              ${
                sprint && sprint.status === 'planning'
                  ? `
                <button class="btn btn-sm btn-success font-bold" data-action="start-sprint">
                  <i class="fa-solid fa-play me-1"></i> Start Sprint
                </button>
              `
                  : ''
              }
            </div>

            ${
              !sprint
                ? `<div class="p-5 text-center text-muted">No sprint selected. Create or select a sprint to plan scope.</div>`
                : `
              <!-- Sprint Metadata & Capacity Bar -->
              <div class="p-3 border-bottom bg-light">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <span class="badge bg-light text-dark border font-mono font-bold">${sprint.code}</span>
                    <span class="badge ${sprint.status === 'active' ? 'bg-success' : sprint.status === 'completed' ? 'bg-secondary' : 'bg-warning text-dark'} ms-1">
                      ${sprint.status.toUpperCase()}
                    </span>
                    <span class="text-muted ms-2" style="font-size: 0.8rem;">
                      <i class="fa-regular fa-calendar me-1"></i> ${sprint.startDate} to ${sprint.endDate}
                    </span>
                  </div>
                  <div class="text-end font-mono font-bold" style="font-size: 0.85rem;">
                    <span>Committed: <strong class="text-primary">${committedPoints}</strong> / ${sprint.capacityPoints || 40} pts</span>
                  </div>
                </div>

                <div class="progress mb-2" style="height: 10px;">
                  <div class="progress-bar ${isOverCap ? 'bg-danger' : 'bg-primary'}" role="progressbar" style="width: ${Math.min(100, Math.round((committedPoints / (sprint.capacityPoints || 40)) * 100))}%"></div>
                </div>

                ${
                  isOverCap
                    ? `
                  <div class="alert alert-danger py-1 px-2 mb-0 d-flex align-items-center gap-2" style="font-size: 0.75rem;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span><strong>Over Capacity Warning:</strong> Committed points (${committedPoints}) exceed sprint target capacity (${sprint.capacityPoints || 40} pts).</span>
                  </div>
                `
                    : ''
                }

                <div class="d-flex justify-content-between mt-2 pt-2 border-top text-muted" style="font-size: 0.75rem;">
                  <span><strong>Goal:</strong> ${sprint.goal || 'No goal set'}</span>
                  <span><strong>Hours:</strong> ${committedHours} / ${sprint.capacityHours || 160}h</span>
                </div>
              </div>

              <!-- Sprint Items Scope List -->
              <div class="card-body p-2 d-flex flex-column gap-2" style="max-height: 520px; overflow-y: auto;">
                ${
                  sprintStories.length === 0 && sprintTasks.length === 0
                    ? `<div class="p-5 text-center text-muted">
                        <i class="fa-solid fa-basket-shopping fa-2x mb-2 text-secondary" style="opacity: 0.4;"></i>
                        <p>Sprint scope is empty.<br>Add items from the backlog on the left to build sprint commitment.</p>
                      </div>`
                    : `
                    <!-- Stories in Sprint -->
                    ${sprintStories.map((story) => this.renderSprintItem(story, 'story')).join('')}
                    <!-- Tasks in Sprint -->
                    ${sprintTasks.map((task) => this.renderSprintItem(task, 'task')).join('')}
                  `
                }
              </div>
            `
            }
          </div>
        </div>
      </div>
    `;

    this.bindPlanningInteractions();
  },

  renderBacklogItem(item, index, totalLength) {
    const isStory = item.itemType === 'story';
    const code = item.code || (isStory ? 'STR' : 'TSK');
    const priority = item.priority || 'medium';
    const pointsOrHours = isStory ? `${item.storyPoints || 0} pts` : `${item.estimatedEffortHrs || 0}h`;

    const priorityBadgeClass =
      priority === 'critical' ? 'bg-danger' : priority === 'high' ? 'bg-warning text-dark' : priority === 'medium' ? 'bg-info text-dark' : 'bg-secondary';

    return `
      <div class="card p-2 shadow-sm border rounded bg-white backlog-item-card">
        <div class="d-flex align-items-center gap-2">
          <!-- Reorder & Selection controls -->
          <input type="checkbox" class="form-check-input backlog-select-checkbox" data-item-id="${item.id}" ${this.selectedBacklogIds.has(item.id) ? 'checked' : ''} />
          
          <div class="d-flex flex-column">
            <button class="btn btn-sm btn-link p-0 text-muted" data-action="move-backlog-up" data-item-id="${item.id}" ${index === 0 ? 'disabled' : ''} title="Move Up">
              <i class="fa-solid fa-caret-up"></i>
            </button>
            <button class="btn btn-sm btn-link p-0 text-muted" data-action="move-backlog-down" data-item-id="${item.id}" ${index === totalLength - 1 ? 'disabled' : ''} title="Move Down">
              <i class="fa-solid fa-caret-down"></i>
            </button>
          </div>

          <div class="flex-grow-1 ms-1">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <div class="d-flex align-items-center gap-1">
                <span class="badge ${isStory ? 'bg-primary' : 'bg-success'}" style="font-size: 0.65rem;">${code}</span>
                <span class="badge ${priorityBadgeClass}" style="font-size: 0.6rem;">${priority}</span>
              </div>
              <span class="badge bg-light text-dark border font-mono" style="font-size: 0.65rem;">${pointsOrHours}</span>
            </div>

            <div class="font-bold text-dark" style="font-size: 0.85rem;">${item.title}</div>
            
            <div class="d-flex justify-content-between align-items-center mt-1 text-muted" style="font-size: 0.7rem;">
              <span>${item.featureName ? `<i class="fa-solid fa-puzzle-piece text-info me-1"></i>${item.featureName}` : 'No Feature'}</span>
              <span><i class="fa-solid fa-user me-1"></i>${item.assigneeName || 'Unassigned'}</span>
            </div>
          </div>

          <!-- Add to sprint button -->
          <button class="btn btn-sm btn-outline-primary ms-2" data-action="add-to-sprint" data-item-id="${item.id}" data-item-type="${item.itemType}" title="Move to Sprint">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>
    `;
  },

  renderSprintItem(item, itemType) {
    const isStory = itemType === 'story';
    const code = item.code || (isStory ? 'STR' : 'TSK');
    const priority = item.priority || 'medium';
    const pointsOrHours = isStory ? `${item.storyPoints || 0} pts` : `${item.estimatedEffortHrs || 0}h`;

    return `
      <div class="card p-2 shadow-sm border rounded bg-white">
        <div class="d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <span class="badge ${isStory ? 'bg-primary' : 'bg-success'}" style="font-size: 0.65rem;">${code}</span>
            <div>
              <div class="font-bold text-dark" style="font-size: 0.85rem;">${item.title}</div>
              <span class="text-muted" style="font-size: 0.7rem;">${item.assigneeName || 'Unassigned'} &bull; Status: ${item.status}</span>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-light text-dark border font-mono">${pointsOrHours}</span>
            <button class="btn btn-sm btn-outline-danger p-1" data-action="remove-from-sprint" data-item-id="${item.id}" data-item-type="${itemType}" title="Return to Backlog">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  filterBacklog() {
    return this.backlogItems.filter((item) => {
      if (this.filterProjectId !== 'all' && item.projectId !== this.filterProjectId) return false;
      if (this.filterPriority !== 'all' && item.priority !== this.filterPriority) return false;
      if (this.filterType !== 'all' && item.itemType !== this.filterType) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesCode = item.code?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCode) return false;
      }
      return true;
    });
  },

  bindPlanningInteractions() {
    document.getElementById('planning-filter-project')?.addEventListener('change', async (e) => {
      this.filterProjectId = e.target.value;
      await this.loadData();
      this.render();
    });

    document.getElementById('backlog-filter-priority')?.addEventListener('change', (e) => {
      this.filterPriority = e.target.value;
      this.render();
    });

    document.getElementById('backlog-filter-type')?.addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.render();
    });

    document.getElementById('backlog-search-input')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
    });
  },

  openCreateSprintModal() {
    const defaultStart = new Date().toISOString().split('T')[0];
    const defaultEnd = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    const bodyHtml = `
      <div>
        <div class="mb-3">
          <label class="form-label font-bold">Project</label>
          <select class="form-select" id="new-sprint-project" required>
            ${this.projects.map((p) => `<option value="${p.id}">${p.name} (${p.code})</option>`).join('')}
          </select>
        </div>

        <div class="mb-3">
          <label class="form-label font-bold">Sprint Name</label>
          <input type="text" class="form-control" id="new-sprint-name" placeholder="e.g., Sprint 24 — RTOS Kernel & Flight Protocols" required />
        </div>

        <div class="mb-3">
          <label class="form-label font-bold">Sprint Goal</label>
          <textarea class="form-control" id="new-sprint-goal" rows="2" placeholder="Primary delivery objective for this sprint..."></textarea>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-md-6">
            <label class="form-label font-bold">Start Date</label>
            <input type="date" class="form-control" id="new-sprint-start" value="${defaultStart}" required />
          </div>
          <div class="col-md-6">
            <label class="form-label font-bold">End Date</label>
            <input type="date" class="form-control" id="new-sprint-end" value="${defaultEnd}" required />
          </div>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-md-6">
            <label class="form-label font-bold">Capacity (Story Points)</label>
            <input type="number" class="form-control" id="new-sprint-cap-points" value="40" min="1" max="500" />
          </div>
          <div class="col-md-6">
            <label class="form-label font-bold">Capacity (Hours)</label>
            <input type="number" class="form-control" id="new-sprint-cap-hours" value="160" min="1" max="2000" />
          </div>
        </div>
      </div>
    `;

    this.app?.openModal('Create New Sprint', bodyHtml, async () => {
      const projectId = document.getElementById('new-sprint-project')?.value;
      const name = document.getElementById('new-sprint-name')?.value?.trim();
      const goal = document.getElementById('new-sprint-goal')?.value?.trim();
      const startDate = document.getElementById('new-sprint-start')?.value;
      const endDate = document.getElementById('new-sprint-end')?.value;
      const capacityPoints = parseInt(document.getElementById('new-sprint-cap-points')?.value, 10) || 40;
      const capacityHours = parseInt(document.getElementById('new-sprint-cap-hours')?.value, 10) || 160;

      if (!name || !projectId || !startDate || !endDate) {
        this.app?.showToast('Please fill in all required fields', 'warning');
        return false;
      }

      try {
        const created = await SprintService.createSprint({
          name,
          projectId,
          goal,
          startDate,
          endDate,
          capacityPoints,
          capacityHours,
        });

        this.app?.showToast(`Sprint "${created.name}" created successfully`, 'success');
        await this.loadData();
        this.selectedSprint = created;
        await this.loadSprintDetails(created.id);
        this.render();
      } catch (err) {
        this.app?.showToast(`Failed to create sprint: ${err.message}`, 'danger');
      }
    });
  },

  openCreateBacklogItemModal() {
    const bodyHtml = `
      <div>
        <div class="mb-3">
          <label class="form-label font-bold">Item Type</label>
          <div class="d-flex gap-3">
            <div class="form-check">
              <input class="form-check-input" type="radio" name="backlogItemType" id="b-type-story" value="story" checked>
              <label class="form-check-label font-semibold" for="b-type-story">User Story</label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="radio" name="backlogItemType" id="b-type-task" value="task">
              <label class="form-check-label font-semibold" for="b-type-task">Engineering Task</label>
            </div>
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label font-bold">Project</label>
          <select class="form-select" id="new-item-project" required>
            ${this.projects.map((p) => `<option value="${p.id}">${p.name} (${p.code})</option>`).join('')}
          </select>
        </div>

        <div class="mb-3">
          <label class="form-label font-bold">Parent Feature (Optional)</label>
          <select class="form-select" id="new-item-feature">
            <option value="">None (Top-level item)</option>
            ${this.features.map((f) => `<option value="${f.id}">${f.code} &bull; ${f.name}</option>`).join('')}
          </select>
        </div>

        <div class="mb-3">
          <label class="form-label font-bold">Title</label>
          <input type="text" class="form-control" id="new-item-title" placeholder="e.g., Guidance vector deviation threshold detector" required />
        </div>

        <div class="row g-2 mb-3">
          <div class="col-md-6">
            <label class="form-label font-bold">Story Points / Est Hours</label>
            <input type="number" class="form-control" id="new-item-points" value="5" min="1" max="100" />
          </div>
          <div class="col-md-6">
            <label class="form-label font-bold">Priority</label>
            <select class="form-select" id="new-item-priority">
              <option value="critical">Critical</option>
              <option value="high" selected>High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label font-bold">Assignee</label>
          <select class="form-select" id="new-item-assignee">
            <option value="">Unassigned</option>
            ${this.users.map((u) => `<option value="${u.id}">${u.firstName} ${u.lastName} (${u.role})</option>`).join('')}
          </select>
        </div>
      </div>
    `;

    this.app?.openModal('New Backlog Work Item', bodyHtml, async () => {
      const type = document.querySelector('input[name="backlogItemType"]:checked')?.value || 'story';
      const projectId = document.getElementById('new-item-project')?.value;
      const featureId = document.getElementById('new-item-feature')?.value || null;
      const title = document.getElementById('new-item-title')?.value?.trim();
      const points = parseInt(document.getElementById('new-item-points')?.value, 10) || 5;
      const priority = document.getElementById('new-item-priority')?.value || 'medium';
      const assigneeId = document.getElementById('new-item-assignee')?.value || null;

      if (!title || !projectId) {
        this.app?.showToast('Title and Project are required', 'warning');
        return false;
      }

      try {
        await BacklogService.createBacklogItem({
          type,
          title,
          projectId,
          featureId,
          storyPoints: points,
          estimatedEffortHrs: points * 4,
          priority,
          assigneeId,
        });

        this.app?.showToast('Item created in backlog', 'success');
        await this.loadData();
        this.render();
      } catch (err) {
        this.app?.showToast(`Failed creating backlog item: ${err.message}`, 'danger');
      }
    });
  },

  async openVelocityModal() {
    const projectId = this.filterProjectId !== 'all' ? this.filterProjectId : undefined;

    const bodyHtml = `
      <div>
        <div class="mb-3">
          <h6 class="font-bold">Historical Velocity & Throughput</h6>
          <p class="text-muted" style="font-size: 0.8rem;">Committed vs completed story points across closed sprints</p>
        </div>

        <div style="height: 300px; position: relative;">
          <canvas id="modal-velocity-chart"></canvas>
        </div>
      </div>
    `;

    this.app?.openModal('Team Velocity History', bodyHtml);

    try {
      const records = await VelocityService.getVelocity(projectId);
      AgileMetrics.renderVelocityChart('modal-velocity-chart', records);
    } catch (err) {
      console.error('Velocity chart error:', err);
    }
  },
};
