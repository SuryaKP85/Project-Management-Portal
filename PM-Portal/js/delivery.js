/**
 * Delivery Management Module for Surya PM Portal V2.0
 * Manages Epics, Features, Stories, Tasks, Subtasks & End-to-End Traceability
 * Hierarchy: Portfolio -> Product -> Project -> Epic -> Feature -> Story -> Task -> Subtask
 */

import { EpicService } from './services/epicService.js';
import { FeatureService } from './services/featureService.js';
import { StoryService } from './services/storyService.js';
import { TaskService } from './services/taskService.js';
import { SubtaskService } from './services/subtaskService.js';
import { DeliveryService } from './services/deliveryService.js';
import { AuthService } from './services/authService.js';
import { ProjectService } from './services/projectService.js';
import { ProductService } from './services/productService.js';
import { PortfolioService } from './services/portfolioService.js';
import { UserService } from './services/userService.js';
import { escapeHtml, cssToken, percent, dataArgs, readDataArgs } from './safeHtml.js';
import { jiraLinkHtml, loadJiraLinkConfig, getJiraBaseUrl, normalizeJiraKey, safeJiraUrl, keyFromJiraUrl, escapeHtml as escapeJira } from './jiraLinks.js';

// Sprint 19: Story editor choices. A stored value outside these is kept as its own option.
const STORY_POINT_CHOICES = [[1, '1 Point'], [2, '2 Points'], [3, '3 Points'], [5, '5 Points'], [8, '8 Points'], [13, '13 Points']];
const STORY_STATUS_CHOICES = [['backlog', 'Backlog'], ['ready', 'Ready for Sprint'], ['in-progress', 'In Progress'], ['review', 'In Review'], ['done', 'Done'], ['blocked', 'Blocked']];
const STORY_PRIORITY_CHOICES = [['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
const MAX_STORY_CRITERIA = 50;

/** A criterion's text, whatever shape older data used. */
const criterionText = (c) => (typeof c === 'string' ? c : c && typeof c.text === 'string' ? c.text : '');

export const DeliveryModule = {
  app: null,
  activeTab: 'hierarchy', // 'hierarchy' | 'epics' | 'features' | 'stories' | 'tasks' | 'traceability'
  epics: [],
  features: [],
  stories: [],
  tasks: [],
  subtasks: [],
  projects: [],
  products: [],
  portfolios: [],
  users: [],
  summary: null,

  // Filters
  filterProjectId: 'all',
  filterStatus: 'all',
  filterPriority: 'all',
  searchQuery: '',
  selectedTrace: null,

  async init(appInstance) {
    this.app = appInstance;
    // Sprint 15A: the Jira base URL (if configured) turns bare Jira keys into links.
    await loadJiraLinkConfig();
    await this.loadData();
    this.setupEventListeners();
    this.render();
  },

  async loadData() {
    try {
      const [epics, features, stories, tasks, subtasks, projects, products, portfolios, users, summary] =
        await Promise.all([
          EpicService.getEpics().catch(() => []),
          FeatureService.getFeatures().catch(() => []),
          StoryService.getStories().catch(() => []),
          TaskService.getTasks().catch(() => []),
          SubtaskService.getSubtasks().catch(() => []),
          ProjectService.getProjects().catch(() => []),
          ProductService.getProducts().catch(() => []),
          PortfolioService.getPortfolios().catch(() => []),
          UserService.getUsers().catch(() => []),
          DeliveryService.getSummary().catch(() => null),
        ]);
      // Sprint 19: the signed-in user, to offer Refine with AI only where the server allows it.
      if (!this.me) this.me = await AuthService.getCurrentUser().catch(() => null);

      this.epics = epics || [];
      this.features = features || [];
      this.stories = stories || [];
      this.tasks = tasks || [];
      this.subtasks = subtasks || [];
      this.projects = projects || [];
      this.products = products || [];
      this.portfolios = portfolios || [];
      this.users = users || [];
      this.summary = summary;
    } catch (err) {
      console.error('[DeliveryModule] Failed loading data:', err);
    }
  },

  setupEventListeners() {
    // Tab switching
    const tabsContainer = document.getElementById('delivery-tabs-nav');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-tab]');
        if (!btn) return;
        tabsContainer.querySelectorAll('button[data-tab]').forEach((b) => b.classList.remove('active', 'btn-primary'));
        tabsContainer.querySelectorAll('button[data-tab]').forEach((b) => b.classList.add('btn-light'));
        btn.classList.add('active', 'btn-primary');
        btn.classList.remove('btn-light');
        this.activeTab = btn.getAttribute('data-tab');
        this.renderTabContent();
      });
    }

    // Filter by Project
    const projectFilter = document.getElementById('delivery-filter-project');
    if (projectFilter) {
      projectFilter.addEventListener('change', (e) => {
        this.filterProjectId = e.target.value;
        this.renderTabContent();
      });
    }

    // Filter by Status
    const statusFilter = document.getElementById('delivery-filter-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.filterStatus = e.target.value;
        this.renderTabContent();
      });
    }

    // Filter by Search
    const searchInp = document.getElementById('delivery-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTabContent();
      });
    }

    // Create buttons dropdown or action
    const btnAddWorkItem = document.getElementById('btn-delivery-add-item');
    if (btnAddWorkItem) {
      btnAddWorkItem.addEventListener('click', () => {
        if (this.activeTab === 'epics') this.openEpicModal();
        else if (this.activeTab === 'features') this.openFeatureModal();
        else if (this.activeTab === 'stories') this.openStoryModal();
        else if (this.activeTab === 'tasks') this.openTaskModal();
        else this.openNewItemSelectorModal();
      });
    }

    // Quick Trace button
    const btnQuickTrace = document.getElementById('btn-delivery-quick-trace');
    if (btnQuickTrace) {
      btnQuickTrace.addEventListener('click', () => {
        this.activeTab = 'traceability';
        const tabBtn = document.querySelector(`button[data-tab="traceability"]`);
        if (tabBtn) tabBtn.click();
        else this.renderTabContent();
      });
    }
  },

  render() {
    this.populateProjectFilter();
    this.renderKPIs();
    this.renderTabContent();
  },

  populateProjectFilter() {
    const filter = document.getElementById('delivery-filter-project');
    if (!filter) return;
    const currentVal = this.filterProjectId;
    filter.innerHTML = `
      <option value="all">All Projects</option>
      ${this.projects
        .map(
          (p) => `<option value="${escapeHtml(p.id)}" ${p.id === currentVal ? 'selected' : ''}>${escapeHtml(p.name || p.id)}</option>`
        )
        .join('')}
    `;
  },

  renderKPIs() {
    const totalEpicsEl = document.getElementById('delivery-kpi-epics');
    const totalFeaturesEl = document.getElementById('delivery-kpi-features');
    const totalStoriesEl = document.getElementById('delivery-kpi-stories');
    const totalTasksEl = document.getElementById('delivery-kpi-tasks');
    const blockedCountEl = document.getElementById('delivery-kpi-blocked');
    const completionEl = document.getElementById('delivery-kpi-completion');

    if (totalEpicsEl) totalEpicsEl.textContent = this.epics.length;
    if (totalFeaturesEl) totalFeaturesEl.textContent = this.features.length;
    if (totalStoriesEl) totalStoriesEl.textContent = this.stories.length;
    if (totalTasksEl) totalTasksEl.textContent = this.tasks.length;

    const blockedItems = [
      ...this.epics.filter((e) => e.status === 'blocked'),
      ...this.features.filter((f) => f.status === 'blocked'),
      ...this.stories.filter((s) => s.status === 'blocked'),
      ...this.tasks.filter((t) => t.status === 'blocked'),
      ...this.subtasks.filter((st) => st.status === 'blocked'),
    ];
    if (blockedCountEl) blockedCountEl.textContent = blockedItems.length;

    const totalTasks = this.tasks.length;
    const completedTasks = this.tasks.filter((t) => t.status === 'done').length;
    const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    if (completionEl) completionEl.textContent = `${percent}%`;
  },

  renderTabContent() {
    const container = document.getElementById('delivery-tab-content-area');
    if (!container) return;

    switch (this.activeTab) {
      case 'hierarchy':
        this.renderHierarchyTree(container);
        break;
      case 'epics':
        this.renderEpicsView(container);
        break;
      case 'features':
        this.renderFeaturesView(container);
        break;
      case 'stories':
        this.renderStoriesView(container);
        break;
      case 'tasks':
        this.renderTasksView(container);
        break;
      case 'traceability':
        this.renderTraceabilityView(container);
        break;
      default:
        this.renderHierarchyTree(container);
    }
  },

  // ================= 1. FULL HIERARCHY TREE VIEW =================
  renderHierarchyTree(container) {
    const filteredProjects = this.projects.filter((p) => {
      if (this.filterProjectId !== 'all' && p.id !== this.filterProjectId) return false;
      if (this.searchQuery && !p.name?.toLowerCase().includes(this.searchQuery)) return false;
      return true;
    });

    if (filteredProjects.length === 0) {
      container.innerHTML = `
        <div class="card p-5 text-center shadow-sm border-0">
          <div class="mb-3 text-muted"><i class="fa-solid fa-sitemap fa-3x" style="opacity: 0.3;"></i></div>
          <h5 class="fw-bold">No Projects or Delivery Items Found</h5>
          <p class="text-muted">Adjust filters or create your first Epic to begin structured delivery management.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 class="fw-bold m-0"><i class="fa-solid fa-folder-tree text-primary me-2"></i>Strategic Delivery Hierarchy Tree</h5>
          <span class="text-muted small">Nested breakdown: Project &rarr; Epic &rarr; Feature &rarr; Story &rarr; Task &rarr; Subtask with live rollups</span>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" id="btn-tree-expand-all"><i class="fa-solid fa-maximize me-1"></i> Expand All</button>
          <button class="btn btn-outline-secondary btn-sm" id="btn-tree-collapse-all"><i class="fa-solid fa-minimize me-1"></i> Collapse All</button>
        </div>
      </div>
      <div class="delivery-tree-wrapper">
        ${filteredProjects
          .map((project) => {
            const projectEpics = this.epics.filter((e) => e.projectId === project.id);
            return `
            <div class="card mb-3 shadow-sm border-0 delivery-tree-project">
              <div class="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2 px-3">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-primary-subtle text-primary fw-bold">${escapeHtml(project.code || 'PRJ')}</span>
                  <strong class="fs-6 text-dark">${escapeHtml(project.name || project.id)}</strong>
                  <span class="badge bg-light text-secondary border small">${projectEpics.length} Epics</span>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <button class="btn btn-sm btn-outline-primary py-0 px-2" data-dv-action="openEpicModal" data-args="${dataArgs(null, project.id)}">
                    <i class="fa-solid fa-plus me-1"></i> Add Epic
                  </button>
                  <button class="btn btn-sm btn-outline-secondary py-0 px-2" data-dv-action="inspectTrace" data-args="${dataArgs('project', project.id)}">
                    <i class="fa-solid fa-route me-1"></i> Trace
                  </button>
                </div>
              </div>
              <div class="card-body p-2">
                ${
                  projectEpics.length === 0
                    ? `<div class="p-3 text-muted text-center small">No Epics defined for this project. <a href="#" data-dv-action="openEpicModal" data-args="${dataArgs(null, project.id)}">Create Epic</a></div>`
                    : projectEpics
                        .map((epic) => {
                          const epicFeatures = this.features.filter((f) => f.epicId === epic.id);
                          return `
                        <div class="border rounded p-2.5 mb-2 bg-light bg-opacity-50 ms-2">
                          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div class="d-flex align-items-center gap-2">
                              <span class="badge bg-purple-subtle text-purple fw-bold" style="background-color: rgba(139, 92, 246, 0.15); color: #7c3aed;">
                                <i class="fa-solid fa-crown me-1"></i>${escapeHtml(epic.code || 'EPIC')}
                              </span>
                              <span class="fw-bold text-dark">${escapeHtml(epic.name)}</span>
                              ${this.getStatusBadge(epic.status)}
                              ${this.getPriorityBadge(epic.priority)}
                              ${this.jiraChip(epic, false)}
                            </div>
                            <div class="d-flex align-items-center gap-3">
                              <div class="d-flex align-items-center gap-2" style="width: 140px;">
                                <div class="progress flex-grow-1" style="height: 6px;">
                                  <div class="progress-bar bg-success" style="width: ${percent(epic.progress)}%"></div>
                                </div>
                                <span class="small text-muted fw-bold">${percent(epic.progress)}%</span>
                              </div>
                              <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary btn-sm py-0 px-1.5" title="Add Feature" data-dv-action="openFeatureModal" data-args="${dataArgs(null, epic.id, project.id)}">
                                  <i class="fa-solid fa-plus"></i> Feature
                                </button>
                                <button class="btn btn-outline-secondary btn-sm py-0 px-1.5" title="Inspect Traceability" data-dv-action="inspectTrace" data-args="${dataArgs('epic', epic.id)}">
                                  <i class="fa-solid fa-route"></i>
                                </button>
                                <button class="btn btn-outline-secondary btn-sm py-0 px-1.5" title="Edit Epic" data-dv-action="openEpicModal" data-args="${dataArgs(epic.id, project.id)}">
                                  <i class="fa-solid fa-pen"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                          
                          <!-- Child Features list -->
                          ${
                            epicFeatures.length > 0
                              ? `
                            <div class="mt-2 pt-2 border-top ms-3">
                              ${epicFeatures
                                .map((feature) => {
                                  const featureStories = this.stories.filter((s) => s.featureId === feature.id);
                                  return `
                                <div class="border-start border-3 border-info ps-2.5 mb-2 py-1 bg-white rounded shadow-2xs">
                                  <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                                    <div class="d-flex align-items-center gap-2">
                                      <span class="badge bg-info-subtle text-info fw-bold"><i class="fa-solid fa-puzzle-piece me-1"></i>${escapeHtml(feature.code || 'FEAT')}</span>
                                      <span class="fw-semibold">${escapeHtml(feature.name)}</span>
                                      ${this.getStatusBadge(feature.status)}
                                      ${this.jiraChip(feature, false)}
                                    </div>
                                    <div class="d-flex align-items-center gap-2">
                                      <span class="small text-muted">${percent(feature.progress)}%</span>
                                      <button class="btn btn-outline-primary btn-xs py-0 px-1.5 text-xs" data-dv-action="openStoryModal" data-args="${dataArgs(null, feature.id, project.id)}">
                                        <i class="fa-solid fa-plus"></i> Story
                                      </button>
                                      <button class="btn btn-outline-secondary btn-xs py-0 px-1.5 text-xs" data-dv-action="inspectTrace" data-args="${dataArgs('feature', feature.id)}">
                                        <i class="fa-solid fa-route"></i>
                                      </button>
                                    </div>
                                  </div>
                                  
                                  <!-- Child Stories -->
                                  ${
                                    featureStories.length > 0
                                      ? `
                                    <div class="mt-1 ms-3 pt-1 border-top">
                                      ${featureStories
                                        .map((story) => {
                                          const storyTasks = this.tasks.filter((t) => t.storyId === story.id);
                                          return `
                                        <div class="d-flex justify-content-between align-items-center py-1 border-bottom border-light">
                                          <div class="d-flex align-items-center gap-2">
                                            <span class="badge bg-warning-subtle text-warning fw-bold small"><i class="fa-solid fa-book-open me-1"></i>${escapeHtml(story.code || 'STR')}</span>
                                            <span class="small fw-semibold text-dark">${escapeHtml(story.title)}</span>
                                            ${story.storyPoints ? `<span class="badge bg-light text-secondary border small">${escapeHtml(story.storyPoints)} pts</span>` : ''}
                                            ${this.getStatusBadge(story.status)}
                                            ${this.jiraChip(story, false)}
                                          </div>
                                          <div class="d-flex align-items-center gap-2">
                                            <span class="small text-muted">${storyTasks.length} tasks</span>
                                            <button class="btn btn-outline-primary btn-xs py-0 px-1 text-xs" data-dv-action="openTaskModal" data-args="${dataArgs(null, story.id, project.id)}">
                                              <i class="fa-solid fa-plus"></i> Task
                                            </button>
                                            <button class="btn btn-outline-secondary btn-xs py-0 px-1 text-xs" data-dv-action="inspectTrace" data-args="${dataArgs('story', story.id)}">
                                              <i class="fa-solid fa-route"></i>
                                            </button>
                                          </div>
                                        </div>
                                      `;
                                        })
                                        .join('')}
                                    </div>
                                  `
                                      : ''
                                  }
                                </div>
                              `;
                                })
                                .join('')}
                            </div>
                          `
                              : ''
                          }
                        </div>
                      `;
                        })
                        .join('')
                }
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `;

    // Expand/Collapse buttons
    const btnExpand = document.getElementById('btn-tree-expand-all');
    const btnCollapse = document.getElementById('btn-tree-collapse-all');
    if (btnExpand) {
      btnExpand.onclick = () => {
        container.querySelectorAll('.card-body').forEach((b) => (b.style.display = 'block'));
      };
    }
    if (btnCollapse) {
      btnCollapse.onclick = () => {
        container.querySelectorAll('.card-body').forEach((b) => (b.style.display = 'none'));
      };
    }
  },

  // ================= 2. EPICS VIEW =================
  renderEpicsView(container) {
    const filtered = this.epics.filter((epic) => {
      if (this.filterProjectId !== 'all' && epic.projectId !== this.filterProjectId) return false;
      if (this.filterStatus !== 'all' && epic.status !== this.filterStatus) return false;
      if (this.searchQuery && !epic.name.toLowerCase().includes(this.searchQuery) && !epic.code?.toLowerCase().includes(this.searchQuery)) return false;
      return true;
    });

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="fw-bold m-0"><i class="fa-solid fa-crown text-warning me-2"></i>Epics Registry (${filtered.length})</h5>
        <button class="btn btn-primary btn-sm" data-dv-action="openEpicModal" data-args="${dataArgs()}">
          <i class="fa-solid fa-plus me-1"></i> Create Epic
        </button>
      </div>
      <div class="table-responsive bg-white rounded shadow-sm border">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light text-secondary text-uppercase small font-bold">
            <tr>
              <th>Epic Code</th>
              <th>Epic Name & Scope</th>
              <th>Project</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Progress</th>
              <th>Target Release</th>
              <th>Features</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="9" class="text-center py-4 text-muted">No Epics match the current filters.</td></tr>`
                : filtered
                    .map((epic) => {
                      const project = this.projects.find((p) => p.id === epic.projectId);
                      const featuresCount = this.features.filter((f) => f.epicId === epic.id).length;
                      return `
                  <tr>
                    <td><span class="badge bg-purple-subtle text-purple fw-bold font-monospace" style="background-color: rgba(139, 92, 246, 0.15); color: #7c3aed;">${escapeHtml(epic.code || 'EPC')}</span></td>
                    <td>
                      <div class="fw-bold text-dark">${escapeHtml(epic.name)}</div>
                      ${this.jiraChip(epic)}
                      <div class="text-muted small text-truncate" style="max-width: 280px;">${escapeHtml(epic.description || 'No description provided')}</div>
                    </td>
                    <td><span class="small fw-semibold">${escapeHtml(project?.name || epic.projectId || '-')}</span></td>
                    <td>${this.getStatusBadge(epic.status)}</td>
                    <td>${this.getPriorityBadge(epic.priority)}</td>
                    <td>
                      <div class="d-flex align-items-center gap-2" style="width: 120px;">
                        <div class="progress flex-grow-1" style="height: 6px;">
                          <div class="progress-bar bg-success" style="width: ${percent(epic.progress)}%"></div>
                        </div>
                        <span class="small fw-bold">${percent(epic.progress)}%</span>
                      </div>
                    </td>
                    <td><span class="small">${escapeHtml(epic.targetRelease || '-')}</span></td>
                    <td><span class="badge bg-light text-dark border">${featuresCount} Features</span></td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" title="Trace Lineage" data-dv-action="inspectTrace" data-args="${dataArgs('epic', epic.id)}">
                          <i class="fa-solid fa-route"></i>
                        </button>
                        <button class="btn btn-outline-primary" title="Add Feature" data-dv-action="openFeatureModal" data-args="${dataArgs(null, epic.id, epic.projectId)}">
                          <i class="fa-solid fa-plus"></i>
                        </button>
                        <button class="btn btn-outline-secondary" title="Edit" data-dv-action="openEpicModal" data-args="${dataArgs(epic.id)}">
                          <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-outline-danger" title="Delete" data-dv-action="deleteEpic" data-args="${dataArgs(epic.id)}">
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;
  },

  // ================= 3. FEATURES VIEW =================
  renderFeaturesView(container) {
    const filtered = this.features.filter((feat) => {
      if (this.filterProjectId !== 'all' && feat.projectId !== this.filterProjectId) return false;
      if (this.filterStatus !== 'all' && feat.status !== this.filterStatus) return false;
      if (this.searchQuery && !feat.name.toLowerCase().includes(this.searchQuery) && !feat.code?.toLowerCase().includes(this.searchQuery)) return false;
      return true;
    });

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="fw-bold m-0"><i class="fa-solid fa-puzzle-piece text-info me-2"></i>Features Registry (${filtered.length})</h5>
        <button class="btn btn-primary btn-sm" data-dv-action="openFeatureModal" data-args="${dataArgs()}">
          <i class="fa-solid fa-plus me-1"></i> Create Feature
        </button>
      </div>
      <div class="table-responsive bg-white rounded shadow-sm border">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light text-secondary text-uppercase small font-bold">
            <tr>
              <th>Feature Code</th>
              <th>Name & Purpose</th>
              <th>Parent Epic</th>
              <th>Project</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Complexity</th>
              <th>Progress</th>
              <th>Stories</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="10" class="text-center py-4 text-muted">No Features match the current filters.</td></tr>`
                : filtered
                    .map((feat) => {
                      const epic = this.epics.find((e) => e.id === feat.epicId);
                      const project = this.projects.find((p) => p.id === feat.projectId);
                      const storiesCount = this.stories.filter((s) => s.featureId === feat.id).length;
                      return `
                  <tr>
                    <td><span class="badge bg-info-subtle text-info fw-bold font-monospace">${escapeHtml(feat.code || 'FEAT')}</span></td>
                    <td>
                      <div class="fw-bold text-dark">${escapeHtml(feat.name)}</div>
                      ${this.jiraChip(feat)}
                      <div class="text-muted small text-truncate" style="max-width: 250px;">${escapeHtml(feat.description || 'No description provided')}</div>
                    </td>
                    <td><span class="small fw-semibold text-purple">${escapeHtml(epic?.name || 'Unassigned')}</span></td>
                    <td><span class="small text-muted">${escapeHtml(project?.name || feat.projectId || '-')}</span></td>
                    <td>${this.getStatusBadge(feat.status)}</td>
                    <td>${this.getPriorityBadge(feat.priority)}</td>
                    <td><span class="badge bg-light text-secondary border small text-capitalize">${escapeHtml(feat.complexity || 'medium')}</span></td>
                    <td>
                      <div class="d-flex align-items-center gap-2" style="width: 110px;">
                        <div class="progress flex-grow-1" style="height: 6px;">
                          <div class="progress-bar bg-info" style="width: ${percent(feat.progress)}%"></div>
                        </div>
                        <span class="small fw-bold">${percent(feat.progress)}%</span>
                      </div>
                    </td>
                    <td><span class="badge bg-light text-dark border">${storiesCount} Stories</span></td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" title="Trace Lineage" data-dv-action="inspectTrace" data-args="${dataArgs('feature', feat.id)}">
                          <i class="fa-solid fa-route"></i>
                        </button>
                        <button class="btn btn-outline-primary" title="Add Story" data-dv-action="openStoryModal" data-args="${dataArgs(null, feat.id, feat.projectId)}">
                          <i class="fa-solid fa-plus"></i>
                        </button>
                        <button class="btn btn-outline-secondary" title="Edit" data-dv-action="openFeatureModal" data-args="${dataArgs(feat.id)}">
                          <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-outline-danger" title="Delete" data-dv-action="deleteFeature" data-args="${dataArgs(feat.id)}">
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;
  },

  // ================= 4. STORIES VIEW =================
  renderStoriesView(container) {
    const filtered = this.stories.filter((story) => {
      if (this.filterProjectId !== 'all' && story.projectId !== this.filterProjectId) return false;
      if (this.filterStatus !== 'all' && story.status !== this.filterStatus) return false;
      if (this.searchQuery && !story.title.toLowerCase().includes(this.searchQuery) && !story.code?.toLowerCase().includes(this.searchQuery)) return false;
      return true;
    });

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="fw-bold m-0"><i class="fa-solid fa-book-open text-warning me-2"></i>User Stories (${filtered.length})</h5>
        <button class="btn btn-primary btn-sm" data-dv-action="openStoryModal" data-args="${dataArgs()}">
          <i class="fa-solid fa-plus me-1"></i> Create Story
        </button>
      </div>
      <div class="row g-3">
        ${
          filtered.length === 0
            ? `<div class="col-12"><div class="card p-5 text-center shadow-sm border-0 text-muted">No User Stories match current filters.</div></div>`
            : filtered
                .map((story) => {
                  const feature = this.features.find((f) => f.id === story.featureId);
                  const tasksCount = this.tasks.filter((t) => t.storyId === story.id).length;
                  const assignee = this.users.find((u) => u.id === story.assigneeId);
                  return `
              <div class="col-md-6 col-lg-4">
                <div class="card h-100 shadow-sm border-0 story-card">
                  <div class="card-header bg-white border-bottom-0 pb-0 pt-3 d-flex justify-content-between align-items-center">
                    <span class="badge bg-warning-subtle text-warning fw-bold font-monospace">${escapeHtml(story.code || 'STR')}</span>
                    <div class="d-flex align-items-center gap-1">
                      ${story.storyPoints ? `<span class="badge bg-light text-dark border">${escapeHtml(story.storyPoints)} pts</span>` : ''}
                      ${this.jiraChip(story, false)}
                      ${this.getStatusBadge(story.status)}
                    </div>
                  </div>
                  <div class="card-body py-2">
                    <h6 class="fw-bold mb-1 text-dark">${escapeHtml(story.title)}</h6>
                    ${
                      story.userStory && (story.userStory.asA || story.userStory.iWant || story.userStory.soThat)
                        ? `
                      <div class="p-2 rounded bg-light small mb-2 text-secondary font-monospace" style="font-size: 0.8rem;">
                        <strong>As a</strong> ${escapeHtml(story.userStory.asA || '—')},<br/>
                        <strong>I want</strong> ${escapeHtml(story.userStory.iWant || '—')},<br/>
                        <strong>So that</strong> ${escapeHtml(story.userStory.soThat || '—')}.
                      </div>
                    `
                        : ''
                    }
                    <div class="small text-muted mb-2">
                      <i class="fa-solid fa-puzzle-piece text-info me-1"></i> Feature: <span class="fw-semibold text-dark">${escapeHtml(feature?.name || 'Unlinked')}</span>
                    </div>
                    ${
                      story.acceptanceCriteria && story.acceptanceCriteria.length > 0
                        ? `
                      <div class="small text-muted mb-2">
                        <span class="fw-bold d-block mb-1">Acceptance Criteria:</span>
                        <ul class="list-unstyled ps-2 mb-0 small text-secondary">
                          ${story.acceptanceCriteria.slice(0, 3).map((c) => `<li><i class="fa-solid ${c && c.completed ? 'fa-circle-check text-success' : 'fa-circle text-secondary'} me-1"></i>${escapeHtml(criterionText(c))}</li>`).join('')}
                        </ul>
                      </div>
                    `
                        : ''
                    }
                  </div>
                  <div class="card-footer bg-white border-top-0 pt-0 pb-3 d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-1.5 small text-muted">
                      <i class="fa-solid fa-user-circle"></i>
                      <span>${assignee ? `${escapeHtml(assignee.firstName)} ${escapeHtml(assignee.lastName)}` : 'Unassigned'}</span>
                      <span class="ms-2 badge bg-light text-secondary border">${tasksCount} Tasks</span>
                    </div>
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-outline-secondary btn-xs py-0 px-1.5" title="Trace Lineage" data-dv-action="inspectTrace" data-args="${dataArgs('story', story.id)}">
                        <i class="fa-solid fa-route"></i>
                      </button>
                      <button class="btn btn-outline-primary btn-xs py-0 px-1.5" title="Add Task" data-dv-action="openTaskModal" data-args="${dataArgs(null, story.id, story.projectId)}">
                        <i class="fa-solid fa-plus"></i>
                      </button>
                      <button class="btn btn-outline-secondary btn-xs py-0 px-1.5" title="Edit" data-dv-action="openStoryModal" data-args="${dataArgs(story.id)}">
                        <i class="fa-solid fa-pen"></i>
                      </button>
                      <button class="btn btn-outline-danger btn-xs py-0 px-1.5" title="Delete" data-dv-action="deleteStory" data-args="${dataArgs(story.id)}">
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            `;
                })
                .join('')
        }
      </div>
    `;
  },

  // ================= 5. TASKS VIEW =================
  renderTasksView(container) {
    const filtered = this.tasks.filter((task) => {
      if (this.filterProjectId !== 'all' && task.projectId !== this.filterProjectId) return false;
      if (this.filterStatus !== 'all' && task.status !== this.filterStatus) return false;
      if (this.searchQuery && !task.title.toLowerCase().includes(this.searchQuery) && !task.code?.toLowerCase().includes(this.searchQuery)) return false;
      return true;
    });

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="fw-bold m-0"><i class="fa-solid fa-list-check text-primary me-2"></i>Execution Tasks (${filtered.length})</h5>
        <button class="btn btn-primary btn-sm" data-dv-action="openTaskModal" data-args="${dataArgs()}">
          <i class="fa-solid fa-plus me-1"></i> Create Task
        </button>
      </div>
      <div class="table-responsive bg-white rounded shadow-sm border">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light text-secondary text-uppercase small font-bold">
            <tr>
              <th>Task Code</th>
              <th>Task Deliverable</th>
              <th>Parent Story</th>
              <th>Assignee</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Hours (Est / Spent)</th>
              <th>Progress</th>
              <th>Subtasks</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="10" class="text-center py-4 text-muted">No Tasks match the current filters.</td></tr>`
                : filtered
                    .map((task) => {
                      const story = this.stories.find((s) => s.id === task.storyId);
                      const assignee = this.users.find((u) => u.id === task.assigneeId);
                      const taskSubtasks = this.subtasks.filter((st) => st.taskId === task.id);
                      const completedSubs = taskSubtasks.filter((st) => st.status === 'done').length;
                      return `
                  <tr>
                    <td><span class="badge bg-primary-subtle text-primary fw-bold font-monospace">${escapeHtml(task.code || 'TSK')}</span></td>
                    <td>
                      <div class="fw-bold text-dark">${escapeHtml(task.title)}</div>
                      <div class="text-muted small text-truncate" style="max-width: 250px;">${escapeHtml(task.description || 'No description')}</div>
                    </td>
                    <td><span class="small fw-semibold text-warning">${escapeHtml(story?.title || 'Unlinked')}</span></td>
                    <td><span class="small">${assignee ? `${escapeHtml(assignee.firstName)} ${escapeHtml(assignee.lastName)}` : 'Unassigned'}</span></td>
                    <td>${this.getStatusBadge(task.status)}</td>
                    <td>${this.getPriorityBadge(task.priority)}</td>
                    <td><span class="small">${escapeHtml(task.estimatedHours || 0)}h / ${escapeHtml(task.spentHours || 0)}h</span></td>
                    <td>
                      <div class="d-flex align-items-center gap-2" style="width: 100px;">
                        <div class="progress flex-grow-1" style="height: 6px;">
                          <div class="progress-bar bg-primary" style="width: ${percent(task.progress)}%"></div>
                        </div>
                        <span class="small fw-bold">${percent(task.progress)}%</span>
                      </div>
                    </td>
                    <td>
                      <button class="btn btn-outline-secondary btn-xs py-0 px-2 small" data-dv-action="openSubtasksManager" data-args="${dataArgs(task.id)}">
                        <i class="fa-solid fa-list-check me-1"></i> ${completedSubs}/${taskSubtasks.length}
                      </button>
                    </td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" title="Trace Lineage" data-dv-action="inspectTrace" data-args="${dataArgs('task', task.id)}">
                          <i class="fa-solid fa-route"></i>
                        </button>
                        <button class="btn btn-outline-secondary" title="Edit" data-dv-action="openTaskModal" data-args="${dataArgs(task.id)}">
                          <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-outline-danger" title="Delete" data-dv-action="deleteTask" data-args="${dataArgs(task.id)}">
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;
  },

  // ================= 6. TRACEABILITY INSPECTOR VIEW =================
  async renderTraceabilityView(container, directEntity) {
    let traceData = this.selectedTrace;

    if (directEntity) {
      try {
        traceData = await DeliveryService.getTrace(directEntity.type, directEntity.id);
        this.selectedTrace = traceData;
      } catch (err) {
        console.error('Failed fetching trace:', err);
      }
    }

    container.innerHTML = `
      <div class="card p-3 mb-4 shadow-sm border-0">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h5 class="fw-bold m-0"><i class="fa-solid fa-route text-primary me-2"></i>End-to-End Delivery Traceability Inspector</h5>
            <span class="text-muted small">Select any delivery artifact to inspect its full upward strategic lineage and downstream deliverables.</span>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <select class="form-select form-select-sm" id="trace-select-type" style="width: 140px;">
              <option value="task">Task</option>
              <option value="subtask">Subtask</option>
              <option value="story">Story</option>
              <option value="feature">Feature</option>
              <option value="epic">Epic</option>
              <option value="project">Project</option>
            </select>
            <select class="form-select form-select-sm" id="trace-select-item" style="min-width: 240px;">
              <!-- Populated dynamically -->
            </select>
            <button class="btn btn-primary btn-sm" id="btn-run-trace">
              <i class="fa-solid fa-magnifying-glass me-1"></i> Inspect Lineage
            </button>
          </div>
        </div>
      </div>
      
      <div id="trace-display-container">
        ${
          !traceData
            ? `
          <div class="card p-5 text-center shadow-sm border-0">
            <div class="mb-3 text-muted"><i class="fa-solid fa-route fa-3x" style="opacity: 0.3;"></i></div>
            <h5 class="fw-bold">No Work Item Selected for Lineage Audit</h5>
            <p class="text-muted">Choose an artifact above or click "Trace" on any Epic, Feature, Story, or Task to visualize its vertical connections.</p>
          </div>
        `
            : this.renderTraceLineageTree(traceData)
        }
      </div>
    `;

    // Populate the dropdown selector
    const typeSelect = document.getElementById('trace-select-type');
    const itemSelect = document.getElementById('trace-select-item');
    const btnRun = document.getElementById('btn-run-trace');

    const updateItemOptions = () => {
      const type = typeSelect.value;
      let items = [];
      if (type === 'task') items = this.tasks.map((t) => ({ id: t.id, label: `${escapeHtml(t.code || 'TSK')}: ${escapeHtml(t.title)}` }));
      else if (type === 'subtask') items = this.subtasks.map((st) => ({ id: st.id, label: `Subtask: ${escapeHtml(st.title)}` }));
      else if (type === 'story') items = this.stories.map((s) => ({ id: s.id, label: `${escapeHtml(s.code || 'STR')}: ${escapeHtml(s.title)}` }));
      else if (type === 'feature') items = this.features.map((f) => ({ id: f.id, label: `${escapeHtml(f.code || 'FEAT')}: ${escapeHtml(f.name)}` }));
      else if (type === 'epic') items = this.epics.map((e) => ({ id: e.id, label: `${escapeHtml(e.code || 'EPC')}: ${escapeHtml(e.name)}` }));
      else if (type === 'project') items = this.projects.map((p) => ({ id: p.id, label: `${escapeHtml(p.code || 'PRJ')}: ${escapeHtml(p.name)}` }));

      itemSelect.innerHTML = items.map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.label)}</option>`).join('');
    };

    if (typeSelect) {
      typeSelect.addEventListener('change', updateItemOptions);
      updateItemOptions();
    }

    if (btnRun) {
      btnRun.onclick = async () => {
        const type = typeSelect.value;
        const id = itemSelect.value;
        if (!id) return;
        try {
          const trace = await DeliveryService.getTrace(type, id);
          this.selectedTrace = trace;
          const displayEl = document.getElementById('trace-display-container');
          if (displayEl) displayEl.innerHTML = this.renderTraceLineageTree(trace);
        } catch (err) {
          this.app?.showToast('Failed loading traceability chain', 'danger');
        }
      };
    }
  },

  renderTraceLineageTree(trace) {
    const node = trace.node;
    const ancestors = trace.ancestors || [];
    const children = trace.children || [];

    return `
      <div class="row g-4">
        <!-- UPWARD STRATEGIC ANCESTORS (Breadcrumb / Path) -->
        <div class="col-lg-6">
          <div class="card shadow-sm border-0 h-100">
            <div class="card-header bg-body-tertiary fw-bold py-2.5">
              <i class="fa-solid fa-arrow-up-right-from-square text-primary me-2"></i>Upward Strategic Lineage (Parent Chain)
            </div>
            <div class="card-body p-3">
              ${
                ancestors.length === 0
                  ? `<div class="text-muted small">This is a top-level entity with no parent container.</div>`
                  : `
                <div class="trace-ancestors-timeline position-relative ps-3">
                  ${ancestors
                    .map((a, idx) => {
                      const icon =
                        a.type === 'goal' ? 'fa-bullseye text-danger' :
                        a.type === 'portfolio' ? 'fa-briefcase text-info' :
                        a.type === 'product' ? 'fa-cube text-primary' :
                        a.type === 'project' ? 'fa-diagram-project text-success' :
                        a.type === 'epic' ? 'fa-crown text-purple' :
                        a.type === 'feature' ? 'fa-puzzle-piece text-info' :
                        a.type === 'story' ? 'fa-book-open text-warning' : 'fa-list-check text-primary';
                      return `
                      <div class="d-flex align-items-start gap-3 mb-3 position-relative">
                        <div class="rounded-circle p-2 bg-light border d-flex align-items-center justify-content-center" style="width: 36px; height: 36px;">
                          <i class="fa-solid ${icon}"></i>
                        </div>
                        <div class="flex-grow-1">
                          <div class="d-flex justify-content-between align-items-center">
                            <span class="badge bg-light text-secondary border text-uppercase small">${escapeHtml(a.type)}</span>
                            ${a.status ? this.getStatusBadge(a.status) : ''}
                          </div>
                          <strong class="d-block text-dark mt-0.5">${a.code ? `[${escapeHtml(a.code)}] ` : ''}${escapeHtml(a.name)}</strong>
                          ${a.progress !== undefined ? `<div class="small text-muted">Progress: ${escapeHtml(a.progress)}%</div>` : ''}
                        </div>
                      </div>
                    `;
                    })
                    .join('')}
                </div>
              `
              }
            </div>
          </div>
        </div>

        <!-- CURRENT INSPECTED NODE & DOWNWARD CHILDREN -->
        <div class="col-lg-6">
          <div class="card shadow-sm border-0 mb-3 border-start border-4 border-primary">
            <div class="card-header bg-white fw-bold py-2.5 d-flex justify-content-between align-items-center">
              <span><i class="fa-solid fa-bullseye text-primary me-2"></i>Active Focus Entity</span>
              <span class="badge bg-primary text-uppercase">${escapeHtml(node.type)}</span>
            </div>
            <div class="card-body p-3">
              <h5 class="fw-bold text-dark mb-1">${node.code ? `[${escapeHtml(node.code)}] ` : ''}${escapeHtml(node.name)}</h5>
              <div class="d-flex align-items-center gap-2 mb-2">
                ${node.status ? this.getStatusBadge(node.status) : ''}
                ${node.priority ? this.getPriorityBadge(node.priority) : ''}
                ${node.progress !== undefined ? `<span class="small fw-bold text-muted">${escapeHtml(node.progress)}% Progress</span>` : ''}
              </div>
              <p class="text-muted small mb-0">${escapeHtml(node.description || 'No detailed specification provided.')}</p>
            </div>
          </div>

          <!-- Downward Children Breakdown -->
          <div class="card shadow-sm border-0">
            <div class="card-header bg-body-tertiary fw-bold py-2.5">
              <i class="fa-solid fa-arrow-down-wide-short text-success me-2"></i>Child Deliverables (${children.length})
            </div>
            <div class="card-body p-2" style="max-height: 360px; overflow-y: auto;">
              ${
                children.length === 0
                  ? `<div class="text-muted small p-3 text-center">No child items linked under this deliverable.</div>`
                  : children
                      .map(
                        (c) => `
                    <div class="p-2 border-bottom d-flex justify-content-between align-items-center">
                      <div class="d-flex align-items-center gap-2">
                        <span class="badge bg-light text-secondary border text-uppercase small">${escapeHtml(c.type)}</span>
                        <span class="fw-semibold small text-dark">${c.code ? `[${escapeHtml(c.code)}] ` : ''}${escapeHtml(c.name)}</span>
                      </div>
                      <div class="d-flex align-items-center gap-2">
                        ${c.status ? this.getStatusBadge(c.status) : ''}
                        <button class="btn btn-outline-secondary btn-xs py-0 px-1 text-xs" data-dv-action="inspectTrace" data-args="${dataArgs(c.type, c.id)}">
                          <i class="fa-solid fa-route"></i>
                        </button>
                      </div>
                    </div>
                  `
                      )
                      .join('')
              }
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async inspectTrace(entityType, entityId) {
    try {
      this.selectedTrace = await DeliveryService.getTrace(entityType, entityId);
      this.activeTab = 'traceability';
      const tabBtn = document.querySelector(`button[data-tab="traceability"]`);
      if (tabBtn) {
        tabBtn.click();
      } else {
        this.renderTabContent();
      }
    } catch (err) {
      console.error('Failed inspecting trace:', err);
      this.app?.showToast('Error generating traceability chain', 'danger');
    }
  },

  // ================= MODALS & CRUD OPERATIONS =================

  // --- EPIC MODAL ---
  /** Sprint 15A: a Jira reference (escaped link opening Jira in a new tab), or '' when there is none. */
  jiraChip(record, block = true) {
    const html = jiraLinkHtml(record || {}, { prefix: false });
    return html && block ? `<div class="mt-1">${html}</div>` : html;
  },

  /**
   * Sprint 15A: Jira reference inputs. The key is the normal input: with
   * JIRA_BASE_URL configured it alone makes the link, so the link field is only
   * shown when there is no base URL or the record already has a custom link.
   * Stored values are filled through the DOM (fillJiraFields).
   */
  jiraFieldsHtml(prefix, record) {
    const base = getJiraBaseUrl();
    const showUrl = !base || !!(record && record.jiraUrl);
    const keyHint = base
      ? `A reference only: opens ${escapeJira(base)}/browse/&lt;KEY&gt; in Jira.`
      : 'A reference only: add the Jira link to make the key clickable.';
    return `
        <div class="${showUrl ? 'col-md-4' : 'col-12'}">
          <label class="form-label fw-semibold" for="${prefix}-jira-key">Jira key</label>
          <input type="text" id="${prefix}-jira-key" class="form-control" maxlength="64" placeholder="e.g. PROJ-123" autocomplete="off" />
          ${showUrl ? '' : `<div class="invalid-feedback" id="${prefix}-jira-error"></div><div class="form-text">${keyHint}</div>`}
        </div>${showUrl ? `
        <div class="col-md-8">
          <label class="form-label fw-semibold" for="${prefix}-jira-url">Jira link (${base ? 'custom' : 'optional'})</label>
          <input type="url" id="${prefix}-jira-url" class="form-control" maxlength="2048" placeholder="https://company.atlassian.net/browse/PROJ-123" />
          <div class="invalid-feedback" id="${prefix}-jira-error"></div>
          <div class="form-text">A reference only: it opens the issue in Jira. ${base ? 'Clear it to use the link built from the key.' : 'Or set JIRA_BASE_URL on the server so the key alone is enough.'}</div>
        </div>` : ''}`;
  },

  /** Sprint 16: sets form values through the DOM ({ elementId: value }). */
  fillFormValues(values) {
    for (const [id, value] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (el) el.value = value === undefined || value === null ? '' : String(value);
    }
  },

  fillJiraFields(prefix, record) {
    const key = document.getElementById(`${prefix}-jira-key`);
    const url = document.getElementById(`${prefix}-jira-url`);
    if (key) key.value = (record && record.jiraKey) || '';
    if (url) url.value = (record && record.jiraUrl) || '';
  },

  /** The Jira fields to send; jiraUrl only when its input is shown, so a hidden one never changes. */
  readJiraFields(prefix) {
    const fields = { jiraKey: document.getElementById(`${prefix}-jira-key`)?.value.trim() || '' };
    const urlEl = document.getElementById(`${prefix}-jira-url`);
    if (urlEl) fields.jiraUrl = urlEl.value.trim();
    return fields;
  },

  /**
   * Validates the Jira inputs with the server's rules, marking invalid ones.
   * Runs synchronously inside the modal's save callback, so an invalid
   * reference keeps the modal (and the user's input) open.
   */
  jiraFieldsValid(prefix) {
    const keyEl = document.getElementById(`${prefix}-jira-key`);
    const urlEl = document.getElementById(`${prefix}-jira-url`);
    const errorEl = document.getElementById(`${prefix}-jira-error`);
    const { jiraKey, jiraUrl = '' } = this.readJiraFields(prefix);
    let message = '';
    const key = jiraKey ? normalizeJiraKey(jiraKey) : null;
    const url = jiraUrl ? safeJiraUrl(jiraUrl) : null;
    keyEl?.classList.toggle('is-invalid', !!jiraKey && !key);
    urlEl?.classList.toggle('is-invalid', !!jiraUrl && !url);
    if (jiraKey && !key) message = 'The Jira key must look like PROJ-123.';
    else if (jiraUrl && !url) message = 'The Jira link must be an https link to your Jira site.';
    else if (key && url && keyFromJiraUrl(url) && keyFromJiraUrl(url) !== key) {
      urlEl?.classList.add('is-invalid');
      message = `The Jira link points to ${keyFromJiraUrl(url)}, not ${key}.`;
    }
    if (errorEl) errorEl.textContent = message;
    if (message) this.app.showToast('Check the Jira key and link.', 'warning');
    return !message;
  },

  openEpicModal(epicId = null, defaultProjectId = null) {
    const epic = epicId ? this.epics.find((e) => e.id === epicId) : null;
    const isEdit = !!epic;

    const bodyHtml = `
      <form id="form-epic-modal" class="row g-3">
        <div class="col-12">
          <label class="form-label fw-semibold">Epic Name <span class="text-danger">*</span></label>
          <input type="text" id="epic-name" class="form-control" required placeholder="e.g. Core Authentication & Identity Engine" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Target Project <span class="text-danger">*</span></label>
          <select id="epic-project" class="form-select" required>
            ${this.projects.map((p) => `<option value="${escapeHtml(p.id)}" ${epic && epic.projectId === p.id ? 'selected' : (!epic && defaultProjectId === p.id ? 'selected' : '')}>${escapeHtml(p.name || p.id)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Target Release</label>
          <input type="text" id="epic-release" class="form-control" placeholder="e.g. Release 2.5 / Sprint 14" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Status</label>
          <select id="epic-status" class="form-select">
            <option value="planning" ${epic?.status === 'planning' ? 'selected' : ''}>Planning</option>
            <option value="in-progress" ${epic?.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${epic?.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="blocked" ${epic?.status === 'blocked' ? 'selected' : ''}>Blocked</option>
            <option value="on-hold" ${epic?.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Priority</label>
          <select id="epic-priority" class="form-select">
            <option value="critical" ${epic?.priority === 'critical' ? 'selected' : ''}>Critical</option>
            <option value="high" ${epic?.priority === 'high' ? 'selected' : ''}>High</option>
            <option value="medium" ${epic?.priority === 'medium' || !epic ? 'selected' : ''}>Medium</option>
            <option value="low" ${epic?.priority === 'low' ? 'selected' : ''}>Low</option>
          </select>
        </div>
${this.jiraFieldsHtml('epic', epic)}
        <div class="col-12">
          <label class="form-label fw-semibold">Description & Objectives</label>
          <textarea id="epic-desc" class="form-control" rows="3" placeholder="Strategic delivery goals and business requirements..."></textarea>
        </div>
      </form>
    `;

    // Sprint 15A: the Jira check runs first and synchronously; returning false keeps the modal open.
    this.app.openModal(isEdit ? 'Edit Epic' : 'Create New Epic', bodyHtml, () => this.jiraFieldsValid('epic') && (async () => {
      const name = document.getElementById('epic-name')?.value.trim();
      const projectId = document.getElementById('epic-project')?.value;
      if (!name || !projectId) {
        this.app.showToast('Please specify Epic Name and Project', 'warning');
        return false;
      }

      const payload = {
        name,
        projectId,
        description: document.getElementById('epic-desc')?.value.trim() || '',
        targetRelease: document.getElementById('epic-release')?.value.trim() || '',
        status: document.getElementById('epic-status')?.value || 'planning',
        priority: document.getElementById('epic-priority')?.value || 'medium',
        ...this.readJiraFields('epic'),
      };

      try {
        if (isEdit) {
          await EpicService.updateEpic(epic.id, payload);
          this.app.showToast('Epic updated successfully', 'success');
        } else {
          await EpicService.createEpic(payload);
          this.app.showToast('Epic created successfully', 'success');
        }
        await this.loadData();
        this.render();
      } catch (err) {
        this.app.showToast('Failed saving Epic', 'danger');
      }
    })());
    this.fillJiraFields('epic', epic);
    // Sprint 16: stored values are set as properties, never interpolated into markup.
    this.fillFormValues({
      'epic-name': epic ? epic.name : '',
      'epic-release': epic?.targetRelease || 'Q3-2026',
      'epic-desc': epic?.description || '',
    });
  },

  async deleteEpic(id) {
    if (!confirm('Are you sure you want to delete this Epic? Child Features may become orphaned.')) return;
    try {
      await EpicService.deleteEpic(id);
      this.app.showToast('Epic deleted successfully', 'success');
      await this.loadData();
      this.render();
    } catch (err) {
      this.app.showToast('Failed deleting Epic', 'danger');
    }
  },

  // --- FEATURE MODAL ---
  openFeatureModal(featureId = null, defaultEpicId = null, defaultProjectId = null) {
    const feature = featureId ? this.features.find((f) => f.id === featureId) : null;
    const isEdit = !!feature;

    const bodyHtml = `
      <form id="form-feature-modal" class="row g-3">
        <div class="col-12">
          <label class="form-label fw-semibold">Feature Name <span class="text-danger">*</span></label>
          <input type="text" id="feat-name" class="form-control" required placeholder="e.g. Multi-Factor Authentication (MFA)" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Parent Epic</label>
          <select id="feat-epic" class="form-select">
            <option value="">-- No Epic (Unlinked) --</option>
            ${this.epics.map((e) => `<option value="${escapeHtml(e.id)}" ${feature && feature.epicId === e.id ? 'selected' : (!feature && defaultEpicId === e.id ? 'selected' : '')}>[${escapeHtml(e.code || 'EPC')}] ${escapeHtml(e.name)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Project <span class="text-danger">*</span></label>
          <select id="feat-project" class="form-select" required>
            ${this.projects.map((p) => `<option value="${escapeHtml(p.id)}" ${feature && feature.projectId === p.id ? 'selected' : (!feature && defaultProjectId === p.id ? 'selected' : '')}>${escapeHtml(p.name || p.id)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Status</label>
          <select id="feat-status" class="form-select">
            <option value="planning" ${feature?.status === 'planning' ? 'selected' : ''}>Planning</option>
            <option value="in-progress" ${feature?.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${feature?.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="blocked" ${feature?.status === 'blocked' ? 'selected' : ''}>Blocked</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Priority</label>
          <select id="feat-priority" class="form-select">
            <option value="critical" ${feature?.priority === 'critical' ? 'selected' : ''}>Critical</option>
            <option value="high" ${feature?.priority === 'high' ? 'selected' : ''}>High</option>
            <option value="medium" ${feature?.priority === 'medium' || !feature ? 'selected' : ''}>Medium</option>
            <option value="low" ${feature?.priority === 'low' ? 'selected' : ''}>Low</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Complexity</label>
          <select id="feat-complexity" class="form-select">
            <option value="low" ${feature?.complexity === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${feature?.complexity === 'medium' || !feature ? 'selected' : ''}>Medium</option>
            <option value="high" ${feature?.complexity === 'high' ? 'selected' : ''}>High</option>
          </select>
        </div>
${this.jiraFieldsHtml('feat', feature)}
        <div class="col-12">
          <label class="form-label fw-semibold">Description</label>
          <textarea id="feat-desc" class="form-control" rows="3" placeholder="Technical specifications and criteria..."></textarea>
        </div>
      </form>
    `;

    // Sprint 15A: the Jira check runs first and synchronously; returning false keeps the modal open.
    this.app.openModal(isEdit ? 'Edit Feature' : 'Create New Feature', bodyHtml, () => this.jiraFieldsValid('feat') && (async () => {
      const name = document.getElementById('feat-name')?.value.trim();
      const projectId = document.getElementById('feat-project')?.value;
      if (!name || !projectId) {
        this.app.showToast('Please specify Feature Name and Project', 'warning');
        return false;
      }

      const payload = {
        name,
        projectId,
        epicId: document.getElementById('feat-epic')?.value || null,
        description: document.getElementById('feat-desc')?.value.trim() || '',
        status: document.getElementById('feat-status')?.value || 'planning',
        priority: document.getElementById('feat-priority')?.value || 'medium',
        complexity: document.getElementById('feat-complexity')?.value || 'medium',
        ...this.readJiraFields('feat'),
      };

      try {
        if (isEdit) {
          await FeatureService.updateFeature(feature.id, payload);
          this.app.showToast('Feature updated successfully', 'success');
        } else {
          await FeatureService.createFeature(payload);
          this.app.showToast('Feature created successfully', 'success');
        }
        await this.loadData();
        this.render();
      } catch (err) {
        this.app.showToast('Failed saving Feature', 'danger');
      }
    })());
    this.fillJiraFields('feat', feature);
    // Sprint 16: stored values are set as properties, never interpolated into markup.
    this.fillFormValues({
      'feat-name': feature ? feature.name : '',
      'feat-desc': feature?.description || '',
    });
  },

  async deleteFeature(id) {
    if (!confirm('Are you sure you want to delete this Feature?')) return;
    try {
      await FeatureService.deleteFeature(id);
      this.app.showToast('Feature deleted successfully', 'success');
      await this.loadData();
      this.render();
    } catch (err) {
      this.app.showToast('Failed deleting Feature', 'danger');
    }
  },

  // --- STORY MODAL ---
  // Sprint 19: canonical details (userStory {asA, iWant, soThat}; acceptanceCriteria [{id, text, completed}]),
  // a row editor for criteria, values that are never silently reset, synchronous validation that keeps the
  // modal open, and "Refine with AI" (a proposal that fills the editor; nothing is saved until Save).
  openStoryModal(storyId = null, defaultFeatureId = null, defaultProjectId = null) {
    const story = storyId ? this.stories.find((s) => s.id === storyId) : null;
    const isEdit = !!story;
    this.storyEditorId = story ? story.id : null;
    const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    // A stored value outside the usual choices is kept as its own option, so saving never changes it.
    const choices = (list, current, fallback) => {
      const chosen = current === undefined || current === null || current === '' ? fallback : current;
      const known = list.some(([v]) => String(v) === String(chosen));
      return (known ? '' : option(chosen, `${chosen} (current)`, true)) + list.map(([v, l]) => option(v, l, String(v) === String(chosen))).join('');
    };
    const hasPoints = story ? typeof story.storyPoints === 'number' : true;
    this.storyCriteria = (story?.acceptanceCriteria || []).map((c) =>
      (typeof c === 'string' ? { text: c, completed: false } : { id: c.id, text: String(c.text ?? ''), completed: c.completed === true }));

    const bodyHtml = `
      <form id="form-story-modal" class="row g-3" novalidate>
        <div class="col-12">
          <label class="form-label fw-semibold" for="story-title">Story Title <span class="text-danger">*</span></label>
          <input type="text" id="story-title" class="form-control" maxlength="255" placeholder="e.g. Enforce MFA at sign-in" />
        </div>
        <div class="col-12 small text-muted" id="story-origin" aria-live="polite"></div>
        <div class="col-md-6">
          <label class="form-label fw-semibold" for="story-feature">Parent Feature</label>
          <select id="story-feature" class="form-select">
            <option value="">-- No Feature (Unlinked) --</option>
            ${this.features.map((f) => `<option value="${escapeHtml(f.id)}" ${story && story.featureId === f.id ? 'selected' : (!story && defaultFeatureId === f.id ? 'selected' : '')}>[${escapeHtml(f.code || 'FEAT')}] ${escapeHtml(f.name)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold" for="story-project">Project <span class="text-danger">*</span></label>
          <select id="story-project" class="form-select">
            ${this.projects.map((p) => `<option value="${escapeHtml(p.id)}" ${story && story.projectId === p.id ? 'selected' : (!story && defaultProjectId === p.id ? 'selected' : '')}>${escapeHtml(p.name || p.id)}</option>`).join('')}
          </select>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold" for="story-description">Description</label>
          <textarea id="story-description" class="form-control" rows="3" maxlength="50000"></textarea>
        </div>
        <div class="col-12 p-3 bg-light rounded border">
          <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
            <div class="fw-bold small text-secondary">User Story</div>
            ${isEdit && this.canRefineStory(story.projectId) ? '<button type="button" class="btn btn-sm btn-outline-primary" id="story-refine-btn" data-dv-action="refineStoryWithAi"><i class="fa-solid fa-wand-magic-sparkles me-1"></i>Refine with AI</button>' : ''}
          </div>
          <div id="story-ai-note" class="small mb-2" role="status"></div>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label small mb-1" for="story-as-a">As a</label>
              <input type="text" id="story-as-a" class="form-control form-control-sm" maxlength="2000" placeholder="e.g. System Administrator" />
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-1" for="story-i-want">I want</label>
              <input type="text" id="story-i-want" class="form-control form-control-sm" maxlength="2000" placeholder="e.g. to require TOTP verification" />
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-1" for="story-so-that">So that</label>
              <input type="text" id="story-so-that" class="form-control form-control-sm" maxlength="2000" placeholder="e.g. credential theft is prevented" />
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold" for="story-points">Story Points</label>
          <select id="story-points" class="form-select">
            ${hasPoints ? choices(STORY_POINT_CHOICES, story?.storyPoints, 3) : option('', 'Not estimated', true) + STORY_POINT_CHOICES.map(([v, l]) => option(v, l, false)).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold" for="story-status">Status</label>
          <select id="story-status" class="form-select">${choices(STORY_STATUS_CHOICES, story?.status, 'backlog')}</select>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold" for="story-priority">Priority</label>
          <select id="story-priority" class="form-select">${choices(STORY_PRIORITY_CHOICES, story?.priority, 'medium')}</select>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold" for="story-assignee">Assignee</label>
          <select id="story-assignee" class="form-select">
            <option value="">-- Unassigned --</option>
            ${this.users.map((u) => `<option value="${escapeHtml(u.id)}" ${story?.assigneeId === u.id ? 'selected' : ''}>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</option>`).join('')}
          </select>
        </div>
${this.jiraFieldsHtml('story', story)}
        <div class="col-12">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="form-label fw-semibold mb-0">Acceptance Criteria</span>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0" id="story-criteria-add" data-dv-action="addCriterion"><i class="fa-solid fa-plus me-1"></i>Add criterion</button>
          </div>
          <div id="story-criteria-list"></div>
        </div>
        <div class="col-12 text-danger small" id="story-form-error" role="alert"></div>
      </form>
    `;

    let saving = false;
    this.app.openModal(isEdit ? 'Edit User Story' : 'Create User Story', bodyHtml, (overlay) => {
      // Synchronous checks first: returning false keeps the modal open and sends nothing.
      if (saving || !this.jiraFieldsValid('story')) return false;
      const errorBox = document.getElementById('story-form-error');
      const value = (id) => document.getElementById(id)?.value ?? '';
      this.syncCriteriaFromDom();
      const title = value('story-title').trim();
      const projectId = value('story-project');
      const problems = [];
      if (!title) problems.push('a title');
      if (!projectId) problems.push('a project');
      if (this.storyCriteria.some((c) => !c.text.trim())) problems.push('text for every acceptance criterion (or remove the empty ones)');
      if (problems.length) {
        if (errorBox) errorBox.textContent = `Please provide ${problems.join(', ')}.`;
        return false;
      }
      const points = value('story-points');
      const payload = {
        title,
        projectId,
        featureId: value('story-feature') || null,
        description: value('story-description'),
        userStory: { asA: value('story-as-a').trim(), iWant: value('story-i-want').trim(), soThat: value('story-so-that').trim() },
        status: value('story-status'),
        priority: value('story-priority'),
        assigneeId: value('story-assignee') || null,
        acceptanceCriteria: this.storyCriteria.map((c) => (c.id ? { id: c.id, text: c.text.trim(), completed: c.completed } : { text: c.text.trim(), completed: c.completed })),
        ...(points !== '' ? { storyPoints: Number(points) } : {}),
        ...this.readJiraFields('story'),
      };
      saving = true;
      const saveBtn = overlay?.querySelector('#global-modal-save-btn');
      if (saveBtn) saveBtn.disabled = true;
      if (errorBox) errorBox.textContent = '';
      (isEdit ? StoryService.updateStory(story.id, payload) : StoryService.createStory(payload))
        .then(async () => {
          overlay?.classList.remove('show');
          this.app.showToast(isEdit ? 'Story updated successfully' : 'Story created successfully', 'success');
          await this.loadData();
          this.render();
        })
        .catch((err) => {
          if (errorBox) errorBox.textContent = (err && err.message) || 'The story could not be saved.';
        })
        .finally(() => {
          saving = false;
          if (saveBtn) saveBtn.disabled = false;
        });
      return false;
    });
    this.fillJiraFields('story', story);
    // Sprint 16: stored values are set as properties, never interpolated into markup.
    this.fillFormValues({
      'story-title': story ? story.title : '',
      'story-description': story?.description || '',
      'story-as-a': story?.userStory?.asA || '',
      'story-i-want': story?.userStory?.iWant || '',
      'story-so-that': story?.userStory?.soThat || '',
    });
    this.renderCriteriaRows();
    if (isEdit) this.showStoryOrigin(story.id);
  },

  /** Refine with AI: admin, project or product manager who manages or belongs to the project (the server re-checks). */
  canRefineStory(projectId) {
    const me = this.me;
    if (!me || !['admin', 'project-manager', 'product-manager'].includes(me.role)) return false;
    if (me.role === 'admin') return true;
    const p = this.projects.find((x) => x.id === projectId);
    return !!p && (p.managerId === me.id || (p.members || []).some((m) => m && m.userId === me.id));
  },

  /** Criteria rows: markup carries no criterion text; values go in through the DOM. */
  renderCriteriaRows() {
    const list = document.getElementById('story-criteria-list');
    if (!list) return;
    const rows = this.storyCriteria || [];
    list.innerHTML = rows.length
      ? rows.map((_, i) => `
        <div class="input-group input-group-sm mb-1" data-criterion-row="${i}">
          <span class="input-group-text"><input class="form-check-input mt-0" type="checkbox" data-criterion-done="${i}" aria-label="Criterion ${i + 1} met"></span>
          <input type="text" class="form-control" data-criterion-text="${i}" maxlength="2000" aria-label="Criterion ${i + 1}">
          <button type="button" class="btn btn-outline-secondary" data-dv-action="moveCriterion" data-args="${dataArgs(String(i), 'up')}" aria-label="Move criterion ${i + 1} up" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-dv-action="moveCriterion" data-args="${dataArgs(String(i), 'down')}" aria-label="Move criterion ${i + 1} down" ${i === rows.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          <button type="button" class="btn btn-outline-danger" data-dv-action="removeCriterion" data-args="${dataArgs(String(i))}" aria-label="Remove criterion ${i + 1}"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('')
      : '<div class="small text-muted">No acceptance criteria yet.</div>';
    rows.forEach((c, i) => {
      const text = list.querySelector(`[data-criterion-text="${i}"]`);
      const done = list.querySelector(`[data-criterion-done="${i}"]`);
      if (text) text.value = c.text;
      if (done) done.checked = c.completed === true;
    });
    const add = document.getElementById('story-criteria-add');
    if (add) add.disabled = rows.length >= MAX_STORY_CRITERIA;
  },

  /** Reads the rows back into the editor state (text and done flag; ids stay with their rows). */
  syncCriteriaFromDom() {
    const list = document.getElementById('story-criteria-list');
    if (!list || !this.storyCriteria) return;
    this.storyCriteria.forEach((c, i) => {
      const text = list.querySelector(`[data-criterion-text="${i}"]`);
      const done = list.querySelector(`[data-criterion-done="${i}"]`);
      if (text) c.text = text.value;
      if (done) c.completed = !!done.checked;
    });
  },

  addCriterion() {
    this.syncCriteriaFromDom();
    if ((this.storyCriteria || []).length >= MAX_STORY_CRITERIA) return;
    this.storyCriteria.push({ text: '', completed: false });
    this.renderCriteriaRows();
  },

  moveCriterion(index, direction) {
    this.syncCriteriaFromDom();
    const list = this.storyCriteria || [];
    const from = Number(index);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (!Number.isInteger(from) || from < 0 || from >= list.length || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    this.renderCriteriaRows();
  },

  removeCriterion(index) {
    this.syncCriteriaFromDom();
    const i = Number(index);
    if (!Number.isInteger(i) || !this.storyCriteria || i < 0 || i >= this.storyCriteria.length) return;
    this.storyCriteria.splice(i, 1);
    this.renderCriteriaRows();
  },

  /** Fills the editor with an AI proposal; nothing is saved until the user presses Save. */
  async refineStoryWithAi() {
    const button = document.getElementById('story-refine-btn');
    const note = document.getElementById('story-ai-note');
    const storyId = this.storyEditorId;
    if (!storyId || !button) return;
    button.disabled = true;
    if (note) { note.className = 'small mb-2 text-muted'; note.textContent = 'Asking the AI for a proposal…'; }
    try {
      const proposal = await StoryService.proposeRefinement(storyId);
      if (this.storyEditorId !== storyId) return;
      this.fillFormValues({ 'story-as-a': proposal.userStory.asA, 'story-i-want': proposal.userStory.iWant, 'story-so-that': proposal.userStory.soThat });
      // The proposal replaces the criteria in the editor (new rows, not yet met); the story itself is unchanged.
      this.storyCriteria = proposal.acceptanceCriteria.map((c) => ({ text: String(c.text ?? ''), completed: false }));
      this.renderCriteriaRows();
      if (note) { note.className = 'small mb-2 text-warning'; note.textContent = `Proposal from ${proposal.provider}. AI output can be wrong. Review before saving.`; }
    } catch (err) {
      if (note) { note.className = 'small mb-2 text-danger'; note.textContent = (err && err.message) || 'The AI could not refine this story.'; }
    } finally {
      button.disabled = false;
    }
  },

  async showStoryOrigin(storyId) {
    this.storyEditorId = storyId;
    const box = document.getElementById('story-origin');
    if (!box) return;
    try {
      const requirement = await StoryService.getOrigin(storyId);
      if (this.storyEditorId !== storyId || !requirement) return;
      box.textContent = `Originating requirement: ${requirement.code} · ${requirement.title}`;
    } catch {
      // The story stays fully usable without its requirement.
    }
  },

  async deleteStory(id) {
    if (!confirm('Are you sure you want to delete this User Story?')) return;
    try {
      await StoryService.deleteStory(id);
      this.app.showToast('Story deleted successfully', 'success');
      await this.loadData();
      this.render();
    } catch (err) {
      this.app.showToast('Failed deleting Story', 'danger');
    }
  },

  // --- TASK MODAL ---
  openTaskModal(taskId = null, defaultStoryId = null, defaultProjectId = null) {
    const task = taskId ? this.tasks.find((t) => t.id === taskId) : null;
    const isEdit = !!task;

    const bodyHtml = `
      <form id="form-task-modal" class="row g-3">
        <div class="col-12">
          <label class="form-label fw-semibold">Task Deliverable <span class="text-danger">*</span></label>
          <input type="text" id="task-title" class="form-control" required placeholder="e.g. Implement TOTP verification endpoint" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Parent User Story</label>
          <select id="task-story" class="form-select">
            <option value="">-- No Story (Unlinked) --</option>
            ${this.stories.map((s) => `<option value="${escapeHtml(s.id)}" ${task && task.storyId === s.id ? 'selected' : (!task && defaultStoryId === s.id ? 'selected' : '')}>[${escapeHtml(s.code || 'STR')}] ${escapeHtml(s.title)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Project <span class="text-danger">*</span></label>
          <select id="task-project" class="form-select" required>
            ${this.projects.map((p) => `<option value="${escapeHtml(p.id)}" ${task && task.projectId === p.id ? 'selected' : (!task && defaultProjectId === p.id ? 'selected' : '')}>${escapeHtml(p.name || p.id)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Status</label>
          <select id="task-status" class="form-select">
            <option value="todo" ${task?.status === 'todo' ? 'selected' : ''}>To Do</option>
            <option value="in-progress" ${task?.status === 'in-progress' || !task ? 'selected' : ''}>In Progress</option>
            <option value="in-review" ${task?.status === 'in-review' ? 'selected' : ''}>In Review</option>
            <option value="done" ${task?.status === 'done' ? 'selected' : ''}>Done</option>
            <option value="blocked" ${task?.status === 'blocked' ? 'selected' : ''}>Blocked</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Priority</label>
          <select id="task-priority" class="form-select">
            <option value="critical" ${task?.priority === 'critical' ? 'selected' : ''}>Critical</option>
            <option value="high" ${task?.priority === 'high' ? 'selected' : ''}>High</option>
            <option value="medium" ${task?.priority === 'medium' || !task ? 'selected' : ''}>Medium</option>
            <option value="low" ${task?.priority === 'low' ? 'selected' : ''}>Low</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Assignee</label>
          <select id="task-assignee" class="form-select">
            <option value="">-- Unassigned --</option>
            ${this.users.map((u) => `<option value="${escapeHtml(u.id)}" ${task?.assigneeId === u.id ? 'selected' : ''}>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Estimated Hours</label>
          <input type="number" id="task-esthours" class="form-control" min="0" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Spent Hours</label>
          <input type="number" id="task-spent" class="form-control" min="0" />
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">Description & Acceptance Notes</label>
          <textarea id="task-desc" class="form-control" rows="2" placeholder="Task execution details..."></textarea>
        </div>
      </form>
    `;

    this.app.openModal(isEdit ? 'Edit Task' : 'Create Task', bodyHtml, async () => {
      const title = document.getElementById('task-title')?.value.trim();
      const projectId = document.getElementById('task-project')?.value;
      if (!title || !projectId) {
        this.app.showToast('Please specify Task Deliverable and Project', 'warning');
        return false;
      }

      const payload = {
        title,
        projectId,
        storyId: document.getElementById('task-story')?.value || null,
        status: document.getElementById('task-status')?.value || 'in-progress',
        priority: document.getElementById('task-priority')?.value || 'medium',
        assigneeId: document.getElementById('task-assignee')?.value || null,
        estimatedHours: parseFloat(document.getElementById('task-esthours')?.value) || 0,
        spentHours: parseFloat(document.getElementById('task-spent')?.value) || 0,
        description: document.getElementById('task-desc')?.value.trim() || '',
      };

      try {
        if (isEdit) {
          await TaskService.updateTask(task.id, payload);
          this.app.showToast('Task updated successfully', 'success');
        } else {
          await TaskService.createTask(payload);
          this.app.showToast('Task created successfully', 'success');
        }
        await this.loadData();
        this.render();
      } catch (err) {
        this.app.showToast('Failed saving Task', 'danger');
      }
    });
    // Sprint 16: stored values are set as properties, never interpolated into markup.
    this.fillFormValues({
      'task-title': task ? task.title : '',
      'task-esthours': task?.estimatedHours || 8,
      'task-spent': task?.spentHours || 0,
      'task-desc': task?.description || '',
    });
  },

  async deleteTask(id) {
    if (!confirm('Are you sure you want to delete this Task?')) return;
    try {
      await TaskService.deleteTask(id);
      this.app.showToast('Task deleted successfully', 'success');
      await this.loadData();
      this.render();
    } catch (err) {
      this.app.showToast('Failed deleting Task', 'danger');
    }
  },

  // --- SUBTASKS MANAGER MODAL ---
  openSubtasksManager(taskId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const taskSubtasks = this.subtasks.filter((st) => st.taskId === taskId);

    const bodyHtml = `
      <div>
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h6 class="fw-bold mb-0">${escapeHtml(task.title)}</h6>
            <span class="text-muted small">Parent Task: ${escapeHtml(task.code || 'TSK')} | Progress: ${percent(task.progress)}%</span>
          </div>
        </div>
        
        <!-- Add new subtask inline -->
        <div class="input-group mb-3">
          <input type="text" id="inline-subtask-title" class="form-control" placeholder="Add a new checklist subtask..." />
          <button class="btn btn-primary" id="btn-add-inline-subtask">
            <i class="fa-solid fa-plus me-1"></i> Add
          </button>
        </div>

        <!-- Subtasks list -->
        <div class="list-group" id="subtasks-list-group">
          ${
            taskSubtasks.length === 0
              ? `<div class="text-muted text-center py-3">No subtasks yet. Add one above!</div>`
              : taskSubtasks
                  .map(
                    (st) => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                  <div class="form-check m-0 d-flex align-items-center gap-2">
                    <input class="form-check-input" type="checkbox" id="chk-sub-${escapeHtml(st.id)}" ${st.status === 'done' ? 'checked' : ''} data-dv-toggle-subtask="${escapeHtml(st.id)}" />
                    <label class="form-check-label ${st.status === 'done' ? 'text-decoration-line-through text-muted' : 'fw-semibold'}" for="chk-sub-${escapeHtml(st.id)}">
                      ${escapeHtml(st.title)}
                    </label>
                  </div>
                  <div class="d-flex align-items-center gap-2">
                    <span class="badge ${st.status === 'done' ? 'bg-success' : 'bg-light text-secondary'} small">${escapeHtml(st.status)}</span>
                    <button class="btn btn-outline-danger btn-xs py-0 px-1 text-xs" data-dv-action="deleteSubtask" data-args="${dataArgs(st.id, taskId)}">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                </div>
              `
                  )
                  .join('')
          }
        </div>
      </div>
    `;

    this.app.openModal('Subtasks Checklist Manager', bodyHtml, () => {
      // Finished
    });

    const addBtn = document.getElementById('btn-add-inline-subtask');
    const inputTitle = document.getElementById('inline-subtask-title');
    if (addBtn && inputTitle) {
      addBtn.onclick = async () => {
        const title = inputTitle.value.trim();
        if (!title) return;
        try {
          await SubtaskService.createSubtask({
            taskId,
            title,
            status: 'todo',
          });
          await this.loadData();
          this.render();
          this.openSubtasksManager(taskId); // Refresh modal view
        } catch (err) {
          this.app.showToast('Failed adding subtask', 'danger');
        }
      };
    }
  },

  async toggleSubtaskStatus(subtaskId, isChecked) {
    try {
      const status = isChecked ? 'done' : 'in-progress';
      await SubtaskService.updateSubtask(subtaskId, { status });
      await this.loadData();
      this.render();
    } catch (err) {
      console.error('Failed toggling subtask:', err);
    }
  },

  async deleteSubtask(subtaskId, taskId) {
    try {
      await SubtaskService.deleteSubtask(subtaskId);
      await this.loadData();
      this.render();
      this.openSubtasksManager(taskId);
    } catch (err) {
      console.error('Failed deleting subtask:', err);
    }
  },

  openNewItemSelectorModal() {
    const bodyHtml = `
      <div class="row g-3 text-center">
        <div class="col-6">
          <div class="card p-3 border hover-shadow" style="cursor: pointer;" data-dv-action="openEpicModal" data-args="${dataArgs()}">
            <i class="fa-solid fa-crown text-purple fa-2x mb-2" style="color: #7c3aed;"></i>
            <h6 class="fw-bold">Epic</h6>
            <span class="text-muted small">Major initiative spanning multiple sprints</span>
          </div>
        </div>
        <div class="col-6">
          <div class="card p-3 border hover-shadow" style="cursor: pointer;" data-dv-action="openFeatureModal" data-args="${dataArgs()}">
            <i class="fa-solid fa-puzzle-piece text-info fa-2x mb-2"></i>
            <h6 class="fw-bold">Feature</h6>
            <span class="text-muted small">Distinct capability satisfying customer need</span>
          </div>
        </div>
        <div class="col-6">
          <div class="card p-3 border hover-shadow" style="cursor: pointer;" data-dv-action="openStoryModal" data-args="${dataArgs()}">
            <i class="fa-solid fa-book-open text-warning fa-2x mb-2"></i>
            <h6 class="fw-bold">User Story</h6>
            <span class="text-muted small">Deliverable described from end-user perspective</span>
          </div>
        </div>
        <div class="col-6">
          <div class="card p-3 border hover-shadow" style="cursor: pointer;" data-dv-action="openTaskModal" data-args="${dataArgs()}">
            <i class="fa-solid fa-list-check text-primary fa-2x mb-2"></i>
            <h6 class="fw-bold">Execution Task</h6>
            <span class="text-muted small">Engineering work unit with hours and subtasks</span>
          </div>
        </div>
      </div>
    `;
    this.app.openModal('Select Delivery Artifact to Create', bodyHtml, () => {});
  },

  // Helper formatting badges
  getStatusBadge(status) {
    const map = {
      planning: 'bg-secondary-subtle text-secondary',
      backlog: 'bg-light text-secondary border',
      ready: 'bg-info-subtle text-info',
      'in-progress': 'bg-primary-subtle text-primary',
      'in-review': 'bg-warning-subtle text-warning',
      review: 'bg-warning-subtle text-warning',
      completed: 'bg-success-subtle text-success',
      done: 'bg-success-subtle text-success',
      blocked: 'bg-danger-subtle text-danger',
      'on-hold': 'bg-secondary-subtle text-muted',
    };
    // Sprint 16: class from the known map only; the label is escaped text.
    const cls = Object.prototype.hasOwnProperty.call(map, status) ? map[status] : 'bg-light text-dark';
    return `<span class="badge ${cls} text-capitalize">${escapeHtml(status || 'unknown')}</span>`;
  },

  getPriorityBadge(priority) {
    const map = {
      critical: 'bg-danger text-white',
      high: 'bg-danger-subtle text-danger',
      medium: 'bg-warning-subtle text-warning',
      low: 'bg-info-subtle text-info',
    };
    const cls = Object.prototype.hasOwnProperty.call(map, priority) ? map[priority] : 'bg-light text-dark';
    return `<span class="badge ${cls} text-capitalize">${escapeHtml(priority || 'medium')}</span>`;
  },
};

// Expose globally for inline DOM click handlers
/**
 * Sprint 16: one delegated click handler for delivery actions. Buttons carry
 * data-dv-action (an allowlisted method) and data-args (a JSON array written
 * by dataArgs), so record ids travel as data and are never interpolated into
 * inline JavaScript. Covers the delivery views and the project breakdown.
 */
const DELIVERY_ACTIONS = new Set([
  'openEpicModal', 'openFeatureModal', 'openStoryModal', 'openTaskModal', 'openSubtasksManager',
  'inspectTrace', 'deleteEpic', 'deleteFeature', 'deleteStory', 'deleteTask', 'deleteSubtask',
  // Sprint 19: Story editor criteria rows and AI refinement.
  'addCriterion', 'moveCriterion', 'removeCriterion', 'refineStoryWithAi',
]);
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', (event) => {
    const el = event.target && event.target.closest ? event.target.closest('[data-dv-action]') : null;
    if (!el) return;
    const action = el.getAttribute('data-dv-action');
    if (!DELIVERY_ACTIONS.has(action) || typeof DeliveryModule[action] !== 'function') return;
    event.preventDefault();
    DeliveryModule[action](...readDataArgs(el));
  });
  document.addEventListener('change', (event) => {
    const el = event.target && event.target.closest ? event.target.closest('[data-dv-toggle-subtask]') : null;
    if (el) DeliveryModule.toggleSubtaskStatus(el.getAttribute('data-dv-toggle-subtask'), el.checked);
  });
}

window.portalDeliveryModule = DeliveryModule;
