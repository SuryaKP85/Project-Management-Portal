/**
 * Agile Execution Board Module (Scrum / Kanban) for Surya PM Portal V2.0
 * Connects directly to V2 delivery hierarchy (Story -> Feature -> Epic -> Project)
 */

import { SprintService } from './services/sprintService.js';
import { StoryService } from './services/storyService.js';
import { TaskService } from './services/taskService.js';
import { ProjectService } from './services/projectService.js';
import { UserService } from './services/userService.js';
import { DeliveryService } from './services/deliveryService.js';
import { AgileMetrics } from './agileMetrics.js';

export const AgileBoardModule = {
  app: null,
  sprints: [],
  activeSprint: null,
  projects: [],
  users: [],
  stories: [],
  tasks: [],
  viewMode: 'swimlanes', // 'swimlanes' | 'assignee' | 'flat'
  filterAssignee: 'all',
  filterPriority: 'all',
  filterType: 'all', // 'all' | 'story' | 'task'
  searchQuery: '',

  COLUMNS: [
    { id: 'ready', label: 'Ready / To Do', icon: 'fa-regular fa-circle', color: 'secondary' },
    { id: 'in-progress', label: 'In Progress', icon: 'fa-solid fa-spinner fa-spin-pulse', color: 'primary' },
    { id: 'in-review', label: 'In Review / Blocked', icon: 'fa-solid fa-eye', color: 'warning' },
    { id: 'testing', label: 'Testing & QA', icon: 'fa-solid fa-vial-circle-check', color: 'info' },
    { id: 'done', label: 'Done & Accepted', icon: 'fa-solid fa-circle-check', color: 'success' },
  ],

  async init(appInstance) {
    this.app = appInstance;
    await this.loadData();
    this.setupEvents();
    this.render();
  },

  async loadData() {
    try {
      const [sprints, projects, users] = await Promise.all([
        SprintService.getSprints().catch(() => []),
        ProjectService.getProjects().catch(() => []),
        UserService.getUsers().catch(() => []),
      ]);

      this.sprints = sprints || [];
      this.projects = projects || [];
      this.users = users || [];

      // Pick active sprint or first sprint available
      if (!this.activeSprint && this.sprints.length > 0) {
        this.activeSprint = this.sprints.find((s) => s.status === 'active') || this.sprints[0];
      }

      if (this.activeSprint) {
        await this.loadSprintItems(this.activeSprint.id);
      }
    } catch (err) {
      console.error('[AgileBoardModule] loadData error:', err);
    }
  },

  async loadSprintItems(sprintId) {
    try {
      const res = await SprintService.getSprintItems(sprintId);
      if (res) {
        this.stories = res.stories || [];
        this.tasks = res.tasks || [];
        if (res.sprint) this.activeSprint = res.sprint;
      }
    } catch (err) {
      console.error('[AgileBoardModule] loadSprintItems error:', err);
    }
  },

  setupEvents() {
    // Global delegated events for Agile Board
    const container = document.getElementById('agile-board-workspace');
    if (!container || container.dataset.eventsBound) return;
    container.dataset.eventsBound = 'true';

    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button, a');
      if (!btn) return;

      const action = btn.dataset.action;
      if (!action) return;

      if (action === 'switch-sprint') {
        const id = btn.dataset.sprintId;
        this.activeSprint = this.sprints.find((s) => s.id === id);
        if (this.activeSprint) {
          await this.loadSprintItems(this.activeSprint.id);
          this.render();
        }
      } else if (action === 'start-sprint') {
        await this.handleStartSprint();
      } else if (action === 'complete-sprint') {
        this.openCompleteSprintModal();
      } else if (action === 'view-burndown') {
        this.openBurndownModal();
      } else if (action === 'view-capacity') {
        this.openCapacityModal();
      } else if (action === 'quick-add') {
        const status = btn.dataset.status;
        this.openQuickAddModal(status);
      } else if (action === 'move-item') {
        const itemId = btn.dataset.itemId;
        const itemType = btn.dataset.itemType;
        const newStatus = btn.dataset.newStatus;
        await this.updateItemStatus(itemId, itemType, newStatus);
      } else if (action === 'view-card') {
        const itemId = btn.dataset.itemId;
        const itemType = btn.dataset.itemType;
        this.openCardDetails(itemId, itemType);
      }
    });
  },

  async updateItemStatus(itemId, itemType, newStatus) {
    try {
      if (itemType === 'task') {
        await TaskService.updateTask(itemId, { status: newStatus });
      } else {
        await StoryService.updateStory(itemId, { status: newStatus });
      }
      this.app?.showToast(`Item status updated to ${newStatus}`, 'success');
      await this.loadSprintItems(this.activeSprint.id);
      this.render();
    } catch (err) {
      this.app?.showToast(`Failed to update status: ${err.message}`, 'danger');
    }
  },

  async handleStartSprint() {
    if (!this.activeSprint) return;
    try {
      await SprintService.startSprint(this.activeSprint.id);
      this.app?.showToast(`Sprint "${this.activeSprint.name}" is now Active!`, 'success');
      await this.loadData();
      this.render();
    } catch (err) {
      this.app?.showToast(err.message || 'Failed to start sprint', 'danger');
    }
  },

  render() {
    const container = document.getElementById('agile-board-workspace');
    if (!container) return;

    if (this.sprints.length === 0) {
      container.innerHTML = `
        <div class="enterprise-card p-5 text-center text-muted">
          <i class="fa-solid fa-person-running fa-3x mb-3 text-primary" style="opacity: 0.5;"></i>
          <h4>No Sprints Found</h4>
          <p>Create your first sprint in Sprint Planning to start agile execution.</p>
          <button class="btn-enterprise btn-enterprise-primary mt-2" onclick="window.portalAppInstance?.switchPage('sprint-planning')">
            <i class="fa-solid fa-plus me-1"></i> Go to Sprint Planning
          </button>
        </div>
      `;
      return;
    }

    const sprint = this.activeSprint || this.sprints[0];
    const totalPoints = this.stories.reduce((s, st) => s + (st.storyPoints || 0), 0);
    const completedPoints = this.stories.filter((st) => st.status === 'done').reduce((s, st) => s + (st.storyPoints || 0), 0);
    const progressPct = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

    const totalHours = this.tasks.reduce((s, t) => s + (t.estimatedEffortHrs || 0), 0);
    const completedHours = this.tasks.filter((t) => t.status === 'done').reduce((s, t) => s + (t.actualEffortHrs || t.estimatedEffortHrs || 0), 0);

    const isSprintActive = sprint.status === 'active';
    const isSprintPlanning = sprint.status === 'planning';
    const isSprintCompleted = sprint.status === 'completed';

    // Calculate days remaining
    let daysRemainingText = 'Not started';
    if (sprint.endDate) {
      const diffDays = Math.ceil((new Date(sprint.endDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
      daysRemainingText = diffDays > 0 ? `${diffDays} days remaining` : (diffDays === 0 ? 'Ends today' : `${Math.abs(diffDays)} days overdue`);
    }

    container.innerHTML = `
      <!-- Top Sprint Controls Bar -->
      <div class="card shadow-sm border-0 mb-4 p-3 bg-white">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <label class="form-label mb-0 font-bold text-muted" style="font-size: 0.8rem; text-transform: uppercase;">Active Sprint:</label>
            <div class="dropdown">
              <button class="btn btn-outline-dark dropdown-toggle font-bold d-flex align-items-center gap-2" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="fa-solid fa-person-running text-primary"></i>
                <span>${sprint.name}</span>
                <span class="badge ${sprint.status === 'active' ? 'bg-success' : sprint.status === 'completed' ? 'bg-secondary' : 'bg-warning text-dark'} ms-1">
                  ${sprint.status.toUpperCase()}
                </span>
              </button>
              <ul class="dropdown-menu shadow">
                ${this.sprints
                  .map(
                    (s) => `
                  <li>
                    <a class="dropdown-item d-flex justify-content-between align-items-center ${s.id === sprint.id ? 'active' : ''}" href="#" data-action="switch-sprint" data-sprint-id="${s.id}">
                      <span>${s.name} (${s.code})</span>
                      <span class="badge ${s.status === 'active' ? 'bg-success' : s.status === 'completed' ? 'bg-secondary' : 'bg-warning text-dark'} ms-2" style="font-size: 0.65rem;">
                        ${s.status}
                      </span>
                    </a>
                  </li>
                `
                  )
                  .join('')}
                <li><hr class="dropdown-divider"></li>
                <li>
                  <a class="dropdown-item text-primary font-semibold" href="#" onclick="window.portalAppInstance?.switchPage('sprint-planning')">
                    <i class="fa-solid fa-sliders me-1"></i> Manage All Sprints
                  </a>
                </li>
              </ul>
            </div>

            <!-- View switchers -->
            <div class="btn-group ms-3" role="group">
              <button type="button" class="btn btn-sm ${this.viewMode === 'swimlanes' ? 'btn-primary' : 'btn-outline-secondary'}" id="btn-view-swimlanes" title="Group by Story">
                <i class="fa-solid fa-bars-staggered me-1"></i> Story Lanes
              </button>
              <button type="button" class="btn btn-sm ${this.viewMode === 'assignee' ? 'btn-primary' : 'btn-outline-secondary'}" id="btn-view-assignee" title="Group by Assignee">
                <i class="fa-solid fa-users me-1"></i> Assignee Lanes
              </button>
              <button type="button" class="btn btn-sm ${this.viewMode === 'flat' ? 'btn-primary' : 'btn-outline-secondary'}" id="btn-view-flat" title="Flat Board">
                <i class="fa-solid fa-table-columns me-1"></i> Flat Board
              </button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <button class="btn btn-sm btn-outline-primary" data-action="view-burndown">
              <i class="fa-solid fa-chart-line me-1"></i> Burndown Chart
            </button>
            <button class="btn btn-sm btn-outline-info" data-action="view-capacity">
              <i class="fa-solid fa-scale-balanced me-1"></i> Capacity (${sprint.capacityPoints || 40} pts)
            </button>
            ${
              isSprintPlanning
                ? `
              <button class="btn btn-sm btn-success font-bold" data-action="start-sprint">
                <i class="fa-solid fa-play me-1"></i> Start Sprint
              </button>
            `
                : ''
            }
            ${
              isSprintActive
                ? `
              <button class="btn btn-sm btn-primary font-bold" data-action="complete-sprint">
                <i class="fa-solid fa-flag-checkered me-1"></i> Complete Sprint
              </button>
            `
                : ''
            }
          </div>
        </div>

        <!-- Sprint Goal & Metrics Header Bar -->
        <div class="row g-3 mt-2 pt-2 border-top align-items-center">
          <div class="col-md-5">
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-light text-dark font-mono font-bold">${sprint.code}</span>
              <p class="mb-0 text-muted fst-italic" style="font-size: 0.9rem;">
                <strong>Goal:</strong> ${sprint.goal || 'No goal set for this sprint.'}
              </p>
            </div>
            <div class="text-muted mt-1" style="font-size: 0.75rem;">
              <i class="fa-regular fa-calendar me-1"></i> ${sprint.startDate} to ${sprint.endDate} &bull; 
              <span class="font-semibold text-dark">${daysRemainingText}</span>
            </div>
          </div>

          <div class="col-md-4">
            <div class="d-flex justify-content-between mb-1" style="font-size: 0.75rem;">
              <span class="font-bold">Story Points Delivery</span>
              <span class="font-mono font-bold text-primary">${completedPoints} / ${totalPoints} pts (${progressPct}%)</span>
            </div>
            <div class="progress" style="height: 8px;">
              <div class="progress-bar bg-success" role="progressbar" style="width: ${progressPct}%"></div>
            </div>
          </div>

          <div class="col-md-3 text-end">
            <div class="d-inline-flex gap-3 text-start">
              <div>
                <span class="text-muted d-block" style="font-size: 0.7rem; text-transform: uppercase;">Stories</span>
                <span class="font-bold text-dark" style="font-size: 1.1rem;">${this.stories.length}</span>
              </div>
              <div>
                <span class="text-muted d-block" style="font-size: 0.7rem; text-transform: uppercase;">Tasks</span>
                <span class="font-bold text-dark" style="font-size: 1.1rem;">${this.tasks.length}</span>
              </div>
              <div>
                <span class="text-muted d-block" style="font-size: 0.7rem; text-transform: uppercase;">Hours</span>
                <span class="font-bold text-dark" style="font-size: 1.1rem;">${completedHours}/${totalHours}h</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Agile Board Filter Strip -->
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <select class="form-select form-select-sm" id="agile-filter-assignee" style="width: 160px;">
            <option value="all">All Assignees</option>
            ${this.users.map((u) => `<option value="${u.id}" ${this.filterAssignee === u.id ? 'selected' : ''}>${u.firstName} ${u.lastName}</option>`).join('')}
          </select>
          <select class="form-select form-select-sm" id="agile-filter-priority" style="width: 140px;">
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select class="form-select form-select-sm" id="agile-filter-type" style="width: 130px;">
            <option value="all">All Types</option>
            <option value="story">Stories Only</option>
            <option value="task">Tasks Only</option>
          </select>
        </div>
        <div class="search-bar" style="max-width: 220px;">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" id="agile-search-input" placeholder="Filter cards..." value="${this.searchQuery}" />
        </div>
      </div>

      <!-- Agile Kanban Columns View Area -->
      <div class="agile-board-columns-wrapper" id="agile-columns-container">
        ${this.renderBoardContent()}
      </div>
    `;

    this.bindBoardInteractions();
  },

  renderBoardContent() {
    if (this.viewMode === 'swimlanes') {
      return this.renderStorySwimlanes();
    } else if (this.viewMode === 'assignee') {
      return this.renderAssigneeSwimlanes();
    } else {
      return this.renderFlatKanban();
    }
  },

  renderStorySwimlanes() {
    const filteredStories = this.filterItems(this.stories);

    if (filteredStories.length === 0) {
      return `
        <div class="enterprise-card p-4 text-center text-muted bg-white">
          <p class="mb-0">No stories currently in this sprint. You can add stories from the Backlog in Sprint Planning.</p>
        </div>
      `;
    }

    return filteredStories
      .map((story) => {
        const childTasks = this.tasks.filter((t) => t.storyId === story.id);
        const storyTasksFiltered = this.filterItems(childTasks);

        return `
        <div class="card mb-4 shadow-sm border-0 bg-light">
          <!-- Swimlane Story Header -->
          <div class="card-header bg-white d-flex justify-content-between align-items-center py-2 px-3 border-bottom">
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-primary-subtle text-primary font-mono font-bold">${story.code}</span>
              <a href="#" class="font-bold text-dark text-decoration-none" data-action="view-card" data-item-id="${story.id}" data-item-type="story">
                ${story.title}
              </a>
              <span class="badge bg-secondary font-bold" style="font-size: 0.75rem;">${story.storyPoints || 0} pts</span>
              ${story.featureName ? `<span class="badge bg-light text-muted border font-normal"><i class="fa-solid fa-puzzle-piece text-info me-1"></i>${story.featureName}</span>` : ''}
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="badge ${this.getStatusBadge(story.status)}">${story.status}</span>
              <span class="text-muted" style="font-size: 0.75rem;">${story.assigneeName || 'Unassigned'}</span>
            </div>
          </div>

          <!-- Swimlane 5-Column Grid -->
          <div class="p-2">
            <div class="row g-2">
              ${this.COLUMNS.map((col) => {
                // If column matches story status, show the story card or its tasks
                const colTasks = storyTasksFiltered.filter((t) => t.status === col.id);
                const storyMatchesCol = story.status === col.id;

                return `
                  <div class="col-md" style="min-width: 200px;">
                    <div class="p-2 bg-white rounded border h-100 agile-drop-target" data-column-id="${col.id}" data-story-id="${story.id}">
                      <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
                        <span class="font-bold text-muted" style="font-size: 0.75rem;">
                          <i class="${col.icon} me-1 text-${col.color}"></i> ${col.label}
                        </span>
                        <span class="badge bg-light text-dark font-mono" style="font-size: 0.65rem;">
                          ${colTasks.length + (storyMatchesCol ? 1 : 0)}
                        </span>
                      </div>

                      <div class="agile-cards-list d-flex flex-column gap-2" style="min-height: 80px;">
                        ${storyMatchesCol ? this.renderCard(story, 'story') : ''}
                        ${colTasks.map((task) => this.renderCard(task, 'task')).join('')}
                      </div>

                      <button class="btn btn-sm btn-link text-muted w-100 text-start p-1 mt-2 text-decoration-none font-semibold" style="font-size: 0.75rem;" data-action="quick-add" data-status="${col.id}" data-story-id="${story.id}">
                        <i class="fa-solid fa-plus me-1"></i> Add Task
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  },

  renderFlatKanban() {
    const allItems = [
      ...this.filterItems(this.stories).map((s) => ({ ...s, itemType: 'story' })),
      ...this.filterItems(this.tasks).map((t) => ({ ...t, itemType: 'task' })),
    ];

    return `
      <div class="row g-3">
        ${this.COLUMNS.map((col) => {
          const colItems = allItems.filter((i) => i.status === col.id);

          return `
            <div class="col" style="min-width: 240px;">
              <div class="card shadow-sm border-0 h-100 bg-light agile-drop-target" data-column-id="${col.id}">
                <div class="card-header bg-white d-flex justify-content-between align-items-center py-2 px-3 border-bottom">
                  <span class="font-bold text-dark" style="font-size: 0.85rem;">
                    <i class="${col.icon} me-1 text-${col.color}"></i> ${col.label}
                  </span>
                  <span class="badge bg-secondary font-mono">${colItems.length}</span>
                </div>

                <div class="card-body p-2 d-flex flex-column gap-2 agile-cards-list" style="min-height: 400px;">
                  ${colItems.map((item) => this.renderCard(item, item.itemType)).join('')}
                </div>

                <div class="card-footer bg-white border-top p-2">
                  <button class="btn btn-sm btn-outline-secondary w-100 font-semibold" style="font-size: 0.8rem;" data-action="quick-add" data-status="${col.id}">
                    <i class="fa-solid fa-plus me-1"></i> Add Card
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  renderAssigneeSwimlanes() {
    const allItems = [
      ...this.filterItems(this.stories).map((s) => ({ ...s, itemType: 'story' })),
      ...this.filterItems(this.tasks).map((t) => ({ ...t, itemType: 'task' })),
    ];

    // Group by Assignee
    const assigneeMap = new Map();
    assigneeMap.set('unassigned', { name: 'Unassigned', items: [] });
    this.users.forEach((u) => {
      assigneeMap.set(u.id, { name: `${u.firstName} ${u.lastName}`, items: [] });
    });

    allItems.forEach((item) => {
      const key = item.assigneeId || 'unassigned';
      if (!assigneeMap.has(key)) {
        assigneeMap.set(key, { name: item.assigneeName || 'Assigned', items: [] });
      }
      assigneeMap.get(key).items.push(item);
    });

    return Array.from(assigneeMap.entries())
      .filter(([_, data]) => data.items.length > 0)
      .map(([userId, data]) => {
        return `
        <div class="card mb-3 shadow-sm border-0 bg-light">
          <div class="card-header bg-white py-2 px-3 d-flex justify-content-between align-items-center">
            <span class="font-bold text-dark">
              <i class="fa-solid fa-user-circle text-primary me-2"></i> ${data.name}
            </span>
            <span class="badge bg-secondary">${data.items.length} items</span>
          </div>

          <div class="p-2">
            <div class="row g-2">
              ${this.COLUMNS.map((col) => {
                const colItems = data.items.filter((i) => i.status === col.id);
                return `
                  <div class="col-md" style="min-width: 200px;">
                    <div class="p-2 bg-white rounded border h-100 agile-drop-target" data-column-id="${col.id}">
                      <div class="agile-cards-list d-flex flex-column gap-2" style="min-height: 60px;">
                        ${colItems.map((item) => this.renderCard(item, item.itemType)).join('')}
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  },

  renderCard(item, itemType) {
    const isStory = itemType === 'story';
    const code = item.code || (isStory ? 'STR' : 'TSK');
    const title = item.title || 'Untitled Item';
    const priority = item.priority || 'medium';
    const pointsOrHours = isStory ? `${item.storyPoints || 0} pts` : `${item.estimatedEffortHrs || 0}h`;

    const priorityBadgeClass =
      priority === 'critical' ? 'bg-danger' : priority === 'high' ? 'bg-warning text-dark' : priority === 'medium' ? 'bg-info text-dark' : 'bg-secondary';

    return `
      <div class="card shadow-sm border rounded p-2 agile-card bg-white" draggable="true" data-item-id="${item.id}" data-item-type="${itemType}" style="cursor: grab; border-left: 3px solid ${isStory ? '#3b82f6' : '#10b981'} !important;">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="d-flex align-items-center gap-1">
            <span class="badge ${isStory ? 'bg-primary' : 'bg-success'}" style="font-size: 0.65rem;">
              <i class="fa-solid ${isStory ? 'fa-book-open' : 'fa-list-check'} me-1"></i>${code}
            </span>
            <span class="badge ${priorityBadgeClass}" style="font-size: 0.6rem;">${priority}</span>
          </div>
          <span class="badge bg-light text-dark border font-mono" style="font-size: 0.65rem;">${pointsOrHours}</span>
        </div>

        <a href="#" class="font-bold text-dark text-decoration-none mb-1 text-truncate-2" style="font-size: 0.85rem;" data-action="view-card" data-item-id="${item.id}" data-item-type="${itemType}">
          ${title}
        </a>

        ${
          item.featureName
            ? `
          <div class="text-muted text-truncate mb-2" style="font-size: 0.7rem;">
            <i class="fa-solid fa-puzzle-piece text-info me-1"></i>${item.featureName}
          </div>
        `
            : ''
        }

        <div class="d-flex justify-content-between align-items-center pt-2 border-top mt-1">
          <div class="d-flex align-items-center gap-1" style="font-size: 0.75rem;">
            <div class="avatar-circle-sm bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 22px; height: 22px; font-size: 0.65rem;">
              ${(item.assigneeName || 'U').charAt(0)}
            </div>
            <span class="text-muted text-truncate" style="max-width: 100px;">${item.assigneeName || 'Unassigned'}</span>
          </div>

          <!-- Quick Move Dropdown -->
          <div class="dropdown">
            <button class="btn btn-sm btn-light p-1" type="button" data-bs-toggle="dropdown" title="Move card">
              <i class="fa-solid fa-arrow-right-arrow-left" style="font-size: 0.75rem;"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow" style="font-size: 0.8rem;">
              ${this.COLUMNS.map(
                (c) => `
                <li>
                  <a class="dropdown-item ${item.status === c.id ? 'active' : ''}" href="#" data-action="move-item" data-item-id="${item.id}" data-item-type="${itemType}" data-new-status="${c.id}">
                    <i class="${c.icon} me-1 text-${c.color}"></i> ${c.label}
                  </a>
                </li>
              `
              ).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;
  },

  getStatusBadge(status) {
    const col = this.COLUMNS.find((c) => c.id === status);
    return col ? `bg-${col.color}` : 'bg-secondary';
  },

  filterItems(items) {
    return items.filter((item) => {
      if (this.filterAssignee !== 'all' && item.assigneeId !== this.filterAssignee) return false;
      if (this.filterPriority !== 'all' && item.priority !== this.filterPriority) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesCode = item.code?.toLowerCase().includes(q);
        const matchesDesc = item.description?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCode && !matchesDesc) return false;
      }
      return true;
    });
  },

  bindBoardInteractions() {
    // View mode switches
    document.getElementById('btn-view-swimlanes')?.addEventListener('click', () => {
      this.viewMode = 'swimlanes';
      this.render();
    });
    document.getElementById('btn-view-assignee')?.addEventListener('click', () => {
      this.viewMode = 'assignee';
      this.render();
    });
    document.getElementById('btn-view-flat')?.addEventListener('click', () => {
      this.viewMode = 'flat';
      this.render();
    });

    // Filters
    document.getElementById('agile-filter-assignee')?.addEventListener('change', (e) => {
      this.filterAssignee = e.target.value;
      this.render();
    });
    document.getElementById('agile-filter-priority')?.addEventListener('change', (e) => {
      this.filterPriority = e.target.value;
      this.render();
    });
    document.getElementById('agile-filter-type')?.addEventListener('change', (e) => {
      this.filterType = e.target.value;
      this.render();
    });
    document.getElementById('agile-search-input')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.render();
    });

    // HTML5 Drag & Drop
    const cards = document.querySelectorAll('.agile-card');
    cards.forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
          itemId: card.dataset.itemId,
          itemType: card.dataset.itemType,
        }));
        card.classList.add('opacity-50');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('opacity-50');
      });
    });

    const dropTargets = document.querySelectorAll('.agile-drop-target');
    dropTargets.forEach((target) => {
      target.addEventListener('dragover', (e) => {
        e.preventDefault();
        target.classList.add('border-primary');
      });

      target.addEventListener('dragleave', () => {
        target.classList.remove('border-primary');
      });

      target.addEventListener('drop', async (e) => {
        e.preventDefault();
        target.classList.remove('border-primary');
        try {
          const raw = e.dataTransfer.getData('text/plain');
          if (!raw) return;
          const { itemId, itemType } = JSON.parse(raw);
          const newStatus = target.dataset.columnId;
          if (itemId && newStatus) {
            await this.updateItemStatus(itemId, itemType, newStatus);
          }
        } catch (err) {
          console.error('Drop handling error:', err);
        }
      });
    });
  },

  openCompleteSprintModal() {
    if (!this.activeSprint) return;
    const sprint = this.activeSprint;

    const completedStories = this.stories.filter((s) => s.status === 'done');
    const incompleteStories = this.stories.filter((s) => s.status !== 'done');
    const incompleteTasks = this.tasks.filter((t) => t.status !== 'done');
    const incompleteCount = incompleteStories.length + incompleteTasks.length;

    const otherSprints = this.sprints.filter((s) => s.id !== sprint.id && s.status !== 'completed');

    const bodyHtml = `
      <div>
        <div class="alert alert-info py-2 mb-3">
          <i class="fa-solid fa-flag-checkered me-1"></i> Completing sprint <strong>${sprint.name}</strong> (${sprint.code})
        </div>

        <div class="row g-2 mb-3">
          <div class="col-6">
            <div class="p-3 bg-light rounded text-center">
              <span class="text-success font-bold d-block" style="font-size: 1.4rem;">${completedStories.length}</span>
              <span class="text-muted" style="font-size: 0.75rem;">Stories Delivered</span>
            </div>
          </div>
          <div class="col-6">
            <div class="p-3 bg-light rounded text-center">
              <span class="text-warning font-bold d-block" style="font-size: 1.4rem;">${incompleteCount}</span>
              <span class="text-muted" style="font-size: 0.75rem;">Incomplete Items</span>
            </div>
          </div>
        </div>

        ${
          incompleteCount > 0
            ? `
          <label class="form-label font-bold">What should happen to incomplete items?</label>
          <div class="d-flex flex-column gap-2 mb-3">
            <div class="form-check">
              <input class="form-check-input" type="radio" name="carryoverAction" id="action-carryover" value="carryover" checked>
              <label class="form-check-label" for="action-carryover">
                <strong>Move to next planned sprint</strong>
              </label>
            </div>
            <select class="form-select form-select-sm ms-4" id="complete-target-sprint" style="max-width: 320px;">
              ${
                otherSprints.length > 0
                  ? otherSprints.map((s) => `<option value="${s.id}">${s.name} (${s.status})</option>`).join('')
                  : '<option value="">No other sprint (Will be unassigned)</option>'
              }
            </select>

            <div class="form-check mt-2">
              <input class="form-check-input" type="radio" name="carryoverAction" id="action-backlog" value="backlog">
              <label class="form-check-label" for="action-backlog">
                <strong>Return to Backlog</strong> (Items reset to ready status)
              </label>
            </div>

            <div class="form-check">
              <input class="form-check-input" type="radio" name="carryoverAction" id="action-cancelled" value="cancelled">
              <label class="form-check-label" for="action-cancelled">
                <strong>Mark as Cancelled</strong>
              </label>
            </div>
          </div>
        `
            : '<p class="text-success font-semibold"><i class="fa-solid fa-circle-check me-1"></i> Amazing! All items committed to this sprint were completed!</p>'
        }
      </div>
    `;

    this.app?.openModal('Complete Sprint', bodyHtml, async () => {
      const carryoverAction = document.querySelector('input[name="carryoverAction"]:checked')?.value || 'backlog';
      const targetSprintId = document.getElementById('complete-target-sprint')?.value || null;

      try {
        await SprintService.completeSprint(sprint.id, {
          carryoverAction,
          targetSprintId,
        });
        this.app?.showToast(`Sprint "${sprint.name}" completed successfully! Velocity recorded.`, 'success');
        await this.loadData();
        this.render();
      } catch (err) {
        this.app?.showToast(err.message || 'Failed to complete sprint', 'danger');
      }
    });
  },

  async openBurndownModal() {
    if (!this.activeSprint) return;
    const sprint = this.activeSprint;

    const bodyHtml = `
      <div>
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h6 class="mb-0 font-bold">${sprint.name} Burndown</h6>
            <span class="text-muted" style="font-size: 0.75rem;">${sprint.startDate} to ${sprint.endDate}</span>
          </div>
          <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-primary active" id="burndown-metric-points">Points</button>
            <button type="button" class="btn btn-outline-primary" id="burndown-metric-hours">Hours</button>
          </div>
        </div>

        <div style="height: 320px; position: relative;">
          <canvas id="modal-burndown-chart"></canvas>
        </div>
      </div>
    `;

    this.app?.openModal('Sprint Burndown Chart', bodyHtml);

    try {
      const burndown = await SprintService.getSprintBurndown(sprint.id);
      AgileMetrics.renderBurndownChart('modal-burndown-chart', burndown, 'points');

      document.getElementById('burndown-metric-points')?.addEventListener('click', (e) => {
        e.target.classList.add('active');
        document.getElementById('burndown-metric-hours')?.classList.remove('active');
        AgileMetrics.renderBurndownChart('modal-burndown-chart', burndown, 'points');
      });

      document.getElementById('burndown-metric-hours')?.addEventListener('click', (e) => {
        e.target.classList.add('active');
        document.getElementById('burndown-metric-points')?.classList.remove('active');
        AgileMetrics.renderBurndownChart('modal-burndown-chart', burndown, 'hours');
      });
    } catch (err) {
      console.error('Burndown load error:', err);
    }
  },

  async openCapacityModal() {
    if (!this.activeSprint) return;
    const sprint = this.activeSprint;

    try {
      const cap = await SprintService.getSprintCapacity(sprint.id);

      const bodyHtml = `
        <div>
          <div class="row g-3 mb-3">
            <div class="col-md-3">
              <div class="p-2 bg-light rounded text-center">
                <span class="text-muted d-block" style="font-size: 0.7rem; text-transform: uppercase;">Team Members</span>
                <span class="font-bold text-dark" style="font-size: 1.2rem;">${cap.teamMembersCount}</span>
              </div>
            </div>
            <div class="col-md-3">
              <div class="p-2 bg-light rounded text-center">
                <span class="text-muted d-block" style="font-size: 0.7rem; text-transform: uppercase;">Working Days</span>
                <span class="font-bold text-dark" style="font-size: 1.2rem;">${cap.workingDays}</span>
              </div>
            </div>
            <div class="col-md-3">
              <div class="p-2 bg-light rounded text-center">
                <span class="text-muted d-block" style="font-size: 0.7rem; text-transform: uppercase;">Available Hours</span>
                <span class="font-bold text-dark" style="font-size: 1.2rem;">${cap.availableHours}h</span>
              </div>
            </div>
            <div class="col-md-3">
              <div class="p-2 bg-light rounded text-center">
                <span class="text-muted d-block" style="font-size: 0.7rem; text-transform: uppercase;">Hours Utilization</span>
                <span class="font-bold ${cap.isOverCapacity ? 'text-danger' : 'text-success'}" style="font-size: 1.2rem;">${cap.hoursUtilization}%</span>
              </div>
            </div>
          </div>

          ${
            cap.isOverCapacity
              ? `<div class="alert alert-danger py-2 mb-3"><i class="fa-solid fa-triangle-exclamation me-1"></i> <strong>Warning:</strong> Sprint scope committed (${cap.committedHours}h) exceeds available team capacity (${cap.availableHours}h).</div>`
              : `<div class="alert alert-success py-2 mb-3"><i class="fa-solid fa-circle-check me-1"></i> Team capacity is well balanced within available hours.</div>`
          }

          <h6 class="font-bold mb-2">Member Breakdown</h6>
          <div class="table-responsive">
            <table class="table table-sm table-hover align-middle">
              <thead class="table-light">
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Available</th>
                  <th>Committed</th>
                  <th>Remaining</th>
                  <th>Utilization</th>
                </tr>
              </thead>
              <tbody>
                ${(cap.memberBreakdown || [])
                  .map(
                    (m) => `
                  <tr>
                    <td class="font-bold">${m.userName}</td>
                    <td class="text-muted" style="font-size: 0.8rem;">${m.role}</td>
                    <td>${m.availableHours}h</td>
                    <td>${m.committedHours}h</td>
                    <td>${m.remainingHours}h</td>
                    <td>
                      <span class="badge ${m.isOverAllocated ? 'bg-danger' : m.utilizationPct > 80 ? 'bg-warning text-dark' : 'bg-success'}">
                        ${m.utilizationPct}%
                      </span>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      this.app?.openModal(`Sprint Capacity: ${sprint.name}`, bodyHtml);
    } catch (err) {
      this.app?.showToast(`Failed loading capacity: ${err.message}`, 'danger');
    }
  },

  openQuickAddModal(status = 'ready') {
    const sprint = this.activeSprint;
    const bodyHtml = `
      <div>
        <div class="mb-3">
          <label class="form-label font-bold">Item Type</label>
          <div class="d-flex gap-3">
            <div class="form-check">
              <input class="form-check-input" type="radio" name="quickAddType" id="type-story" value="story" checked>
              <label class="form-check-label font-semibold" for="type-story">User Story</label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="radio" name="quickAddType" id="type-task" value="task">
              <label class="form-check-label font-semibold" for="type-task">Engineering Task</label>
            </div>
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label font-bold">Title</label>
          <input type="text" class="form-control" id="quick-add-title" placeholder="e.g., Implement real-time websocket heartbeat" required />
        </div>

        <div class="row g-2 mb-3">
          <div class="col-md-6" id="field-points-group">
            <label class="form-label font-bold">Story Points</label>
            <input type="number" class="form-control" id="quick-add-points" value="5" min="1" max="100" />
          </div>
          <div class="col-md-6">
            <label class="form-label font-bold">Priority</label>
            <select class="form-select" id="quick-add-priority">
              <option value="critical">Critical</option>
              <option value="high" selected>High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label font-bold">Assignee</label>
          <select class="form-select" id="quick-add-assignee">
            <option value="">Unassigned</option>
            ${this.users.map((u) => `<option value="${u.id}">${u.firstName} ${u.lastName} (${u.role})</option>`).join('')}
          </select>
        </div>
      </div>
    `;

    this.app?.openModal('Quick Add Work Item', bodyHtml, async () => {
      const type = document.querySelector('input[name="quickAddType"]:checked')?.value || 'story';
      const title = document.getElementById('quick-add-title')?.value?.trim();
      const points = parseInt(document.getElementById('quick-add-points')?.value, 10) || 3;
      const priority = document.getElementById('quick-add-priority')?.value || 'medium';
      const assigneeId = document.getElementById('quick-add-assignee')?.value || null;

      if (!title) {
        this.app?.showToast('Title is required', 'warning');
        return false;
      }

      try {
        if (type === 'task') {
          await TaskService.createTask({
            title,
            projectId: sprint.projectId,
            sprintId: sprint.id,
            sprint: sprint.name,
            status,
            priority,
            assigneeId,
            estimatedEffortHrs: points * 4,
          });
        } else {
          await StoryService.createStory({
            title,
            projectId: sprint.projectId,
            sprintId: sprint.id,
            sprint: sprint.name,
            status,
            priority,
            assigneeId,
            storyPoints: points,
            acceptanceCriteria: [],
          });
        }

        this.app?.showToast('Item created and added to sprint', 'success');
        await this.loadSprintItems(sprint.id);
        this.render();
      } catch (err) {
        this.app?.showToast(`Failed adding item: ${err.message}`, 'danger');
      }
    });
  },

  async openCardDetails(itemId, itemType) {
    try {
      let item = null;
      let trace = null;

      if (itemType === 'task') {
        item = await TaskService.getTaskById(itemId);
        trace = await DeliveryService.getTraceability('task', itemId).catch(() => null);
      } else {
        item = await StoryService.getStoryById(itemId);
        trace = await DeliveryService.getTraceability('story', itemId).catch(() => null);
      }

      if (!item) return;

      const bodyHtml = `
        <div>
          <!-- Hierarchy Lineage Badge Strip -->
          <div class="p-2 bg-light rounded mb-3 border font-mono" style="font-size: 0.75rem;">
            <i class="fa-solid fa-route text-primary me-1"></i>
            <strong>Hierarchy Path:</strong> 
            ${trace?.ancestors?.map((a) => `<span class="badge bg-white text-dark border mx-1">${a.entityType}: ${a.name}</span>`).join('&rarr;') || 'Standalone'}
          </div>

          <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
              <span class="badge ${itemType === 'story' ? 'bg-primary' : 'bg-success'} me-1">${item.code}</span>
              <span class="badge bg-secondary">${item.status}</span>
              <span class="badge bg-light text-dark border ms-1">${item.priority}</span>
            </div>
            <span class="font-bold text-primary">${itemType === 'story' ? `${item.storyPoints || 0} pts` : `${item.estimatedEffortHrs || 0}h`}</span>
          </div>

          <h5 class="font-bold mb-2">${item.title}</h5>
          <p class="text-muted mb-3" style="font-size: 0.9rem;">${item.description || 'No description provided.'}</p>

          ${
            item.userStory
              ? `
            <div class="card p-3 mb-3 bg-light border-0">
              <span class="font-bold text-primary mb-1" style="font-size: 0.75rem; text-transform: uppercase;">User Story Specification:</span>
              <p class="mb-1" style="font-size: 0.85rem;"><strong>As a</strong> ${item.userStory.asA}</p>
              <p class="mb-1" style="font-size: 0.85rem;"><strong>I want</strong> ${item.userStory.iWant}</p>
              <p class="mb-0" style="font-size: 0.85rem;"><strong>So that</strong> ${item.userStory.soThat}</p>
            </div>
          `
              : ''
          }

          <div class="row g-2 mb-3">
            <div class="col-6">
              <label class="form-label font-bold" style="font-size: 0.75rem;">Assignee</label>
              <div class="p-2 border rounded bg-white text-muted" style="font-size: 0.85rem;">
                <i class="fa-solid fa-user me-1"></i> ${item.assigneeName || 'Unassigned'}
              </div>
            </div>
            <div class="col-6">
              <label class="form-label font-bold" style="font-size: 0.75rem;">Sprint</label>
              <div class="p-2 border rounded bg-white text-muted" style="font-size: 0.85rem;">
                <i class="fa-solid fa-person-running me-1"></i> ${item.sprint || 'None'}
              </div>
            </div>
          </div>
        </div>
      `;

      this.app?.openModal(`Work Item Details: ${item.code}`, bodyHtml);
    } catch (err) {
      this.app?.showToast(`Error opening item: ${err.message}`, 'danger');
    }
  },
};
