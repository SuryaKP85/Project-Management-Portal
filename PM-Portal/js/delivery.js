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
import { ProjectService } from './services/projectService.js';
import { ProductService } from './services/productService.js';
import { PortfolioService } from './services/portfolioService.js';
import { UserService } from './services/userService.js';

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
          (p) => `<option value="${p.id}" ${p.id === currentVal ? 'selected' : ''}>${p.name || p.id}</option>`
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
                  <span class="badge bg-primary-subtle text-primary fw-bold">${project.code || 'PRJ'}</span>
                  <strong class="fs-6 text-dark">${project.name || project.id}</strong>
                  <span class="badge bg-light text-secondary border small">${projectEpics.length} Epics</span>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="window.portalDeliveryModule.openEpicModal(null, '${project.id}')">
                    <i class="fa-solid fa-plus me-1"></i> Add Epic
                  </button>
                  <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="window.portalDeliveryModule.inspectTrace('project', '${project.id}')">
                    <i class="fa-solid fa-route me-1"></i> Trace
                  </button>
                </div>
              </div>
              <div class="card-body p-2">
                ${
                  projectEpics.length === 0
                    ? `<div class="p-3 text-muted text-center small">No Epics defined for this project. <a href="#" onclick="window.portalDeliveryModule.openEpicModal(null, '${project.id}'); return false;">Create Epic</a></div>`
                    : projectEpics
                        .map((epic) => {
                          const epicFeatures = this.features.filter((f) => f.epicId === epic.id);
                          return `
                        <div class="border rounded p-2.5 mb-2 bg-light bg-opacity-50 ms-2">
                          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div class="d-flex align-items-center gap-2">
                              <span class="badge bg-purple-subtle text-purple fw-bold" style="background-color: rgba(139, 92, 246, 0.15); color: #7c3aed;">
                                <i class="fa-solid fa-crown me-1"></i>${epic.code || 'EPIC'}
                              </span>
                              <span class="fw-bold text-dark">${epic.name}</span>
                              ${this.getStatusBadge(epic.status)}
                              ${this.getPriorityBadge(epic.priority)}
                            </div>
                            <div class="d-flex align-items-center gap-3">
                              <div class="d-flex align-items-center gap-2" style="width: 140px;">
                                <div class="progress flex-grow-1" style="height: 6px;">
                                  <div class="progress-bar bg-success" style="width: ${epic.progress || 0}%"></div>
                                </div>
                                <span class="small text-muted fw-bold">${epic.progress || 0}%</span>
                              </div>
                              <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-primary btn-sm py-0 px-1.5" title="Add Feature" onclick="window.portalDeliveryModule.openFeatureModal(null, '${epic.id}', '${project.id}')">
                                  <i class="fa-solid fa-plus"></i> Feature
                                </button>
                                <button class="btn btn-outline-secondary btn-sm py-0 px-1.5" title="Inspect Traceability" onclick="window.portalDeliveryModule.inspectTrace('epic', '${epic.id}')">
                                  <i class="fa-solid fa-route"></i>
                                </button>
                                <button class="btn btn-outline-secondary btn-sm py-0 px-1.5" title="Edit Epic" onclick="window.portalDeliveryModule.openEpicModal('${epic.id}', '${project.id}')">
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
                                      <span class="badge bg-info-subtle text-info fw-bold"><i class="fa-solid fa-puzzle-piece me-1"></i>${feature.code || 'FEAT'}</span>
                                      <span class="fw-semibold">${feature.name}</span>
                                      ${this.getStatusBadge(feature.status)}
                                    </div>
                                    <div class="d-flex align-items-center gap-2">
                                      <span class="small text-muted">${feature.progress || 0}%</span>
                                      <button class="btn btn-outline-primary btn-xs py-0 px-1.5 text-xs" onclick="window.portalDeliveryModule.openStoryModal(null, '${feature.id}', '${project.id}')">
                                        <i class="fa-solid fa-plus"></i> Story
                                      </button>
                                      <button class="btn btn-outline-secondary btn-xs py-0 px-1.5 text-xs" onclick="window.portalDeliveryModule.inspectTrace('feature', '${feature.id}')">
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
                                            <span class="badge bg-warning-subtle text-warning fw-bold small"><i class="fa-solid fa-book-open me-1"></i>${story.code || 'STR'}</span>
                                            <span class="small fw-semibold text-dark">${story.title}</span>
                                            ${story.storyPoints ? `<span class="badge bg-light text-secondary border small">${story.storyPoints} pts</span>` : ''}
                                            ${this.getStatusBadge(story.status)}
                                          </div>
                                          <div class="d-flex align-items-center gap-2">
                                            <span class="small text-muted">${storyTasks.length} tasks</span>
                                            <button class="btn btn-outline-primary btn-xs py-0 px-1 text-xs" onclick="window.portalDeliveryModule.openTaskModal(null, '${story.id}', '${project.id}')">
                                              <i class="fa-solid fa-plus"></i> Task
                                            </button>
                                            <button class="btn btn-outline-secondary btn-xs py-0 px-1 text-xs" onclick="window.portalDeliveryModule.inspectTrace('story', '${story.id}')">
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
        <button class="btn btn-primary btn-sm" onclick="window.portalDeliveryModule.openEpicModal()">
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
                    <td><span class="badge bg-purple-subtle text-purple fw-bold font-monospace" style="background-color: rgba(139, 92, 246, 0.15); color: #7c3aed;">${epic.code || 'EPC'}</span></td>
                    <td>
                      <div class="fw-bold text-dark">${epic.name}</div>
                      <div class="text-muted small text-truncate" style="max-width: 280px;">${epic.description || 'No description provided'}</div>
                    </td>
                    <td><span class="small fw-semibold">${project?.name || epic.projectId || '-'}</span></td>
                    <td>${this.getStatusBadge(epic.status)}</td>
                    <td>${this.getPriorityBadge(epic.priority)}</td>
                    <td>
                      <div class="d-flex align-items-center gap-2" style="width: 120px;">
                        <div class="progress flex-grow-1" style="height: 6px;">
                          <div class="progress-bar bg-success" style="width: ${epic.progress || 0}%"></div>
                        </div>
                        <span class="small fw-bold">${epic.progress || 0}%</span>
                      </div>
                    </td>
                    <td><span class="small">${epic.targetRelease || '-'}</span></td>
                    <td><span class="badge bg-light text-dark border">${featuresCount} Features</span></td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" title="Trace Lineage" onclick="window.portalDeliveryModule.inspectTrace('epic', '${epic.id}')">
                          <i class="fa-solid fa-route"></i>
                        </button>
                        <button class="btn btn-outline-primary" title="Add Feature" onclick="window.portalDeliveryModule.openFeatureModal(null, '${epic.id}', '${epic.projectId}')">
                          <i class="fa-solid fa-plus"></i>
                        </button>
                        <button class="btn btn-outline-secondary" title="Edit" onclick="window.portalDeliveryModule.openEpicModal('${epic.id}')">
                          <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-outline-danger" title="Delete" onclick="window.portalDeliveryModule.deleteEpic('${epic.id}')">
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
        <button class="btn btn-primary btn-sm" onclick="window.portalDeliveryModule.openFeatureModal()">
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
                    <td><span class="badge bg-info-subtle text-info fw-bold font-monospace">${feat.code || 'FEAT'}</span></td>
                    <td>
                      <div class="fw-bold text-dark">${feat.name}</div>
                      <div class="text-muted small text-truncate" style="max-width: 250px;">${feat.description || 'No description provided'}</div>
                    </td>
                    <td><span class="small fw-semibold text-purple">${epic?.name || 'Unassigned'}</span></td>
                    <td><span class="small text-muted">${project?.name || feat.projectId || '-'}</span></td>
                    <td>${this.getStatusBadge(feat.status)}</td>
                    <td>${this.getPriorityBadge(feat.priority)}</td>
                    <td><span class="badge bg-light text-secondary border small text-capitalize">${feat.complexity || 'medium'}</span></td>
                    <td>
                      <div class="d-flex align-items-center gap-2" style="width: 110px;">
                        <div class="progress flex-grow-1" style="height: 6px;">
                          <div class="progress-bar bg-info" style="width: ${feat.progress || 0}%"></div>
                        </div>
                        <span class="small fw-bold">${feat.progress || 0}%</span>
                      </div>
                    </td>
                    <td><span class="badge bg-light text-dark border">${storiesCount} Stories</span></td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" title="Trace Lineage" onclick="window.portalDeliveryModule.inspectTrace('feature', '${feat.id}')">
                          <i class="fa-solid fa-route"></i>
                        </button>
                        <button class="btn btn-outline-primary" title="Add Story" onclick="window.portalDeliveryModule.openStoryModal(null, '${feat.id}', '${feat.projectId}')">
                          <i class="fa-solid fa-plus"></i>
                        </button>
                        <button class="btn btn-outline-secondary" title="Edit" onclick="window.portalDeliveryModule.openFeatureModal('${feat.id}')">
                          <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-outline-danger" title="Delete" onclick="window.portalDeliveryModule.deleteFeature('${feat.id}')">
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
        <button class="btn btn-primary btn-sm" onclick="window.portalDeliveryModule.openStoryModal()">
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
                    <span class="badge bg-warning-subtle text-warning fw-bold font-monospace">${story.code || 'STR'}</span>
                    <div class="d-flex align-items-center gap-1">
                      ${story.storyPoints ? `<span class="badge bg-light text-dark border">${story.storyPoints} pts</span>` : ''}
                      ${this.getStatusBadge(story.status)}
                    </div>
                  </div>
                  <div class="card-body py-2">
                    <h6 class="fw-bold mb-1 text-dark">${story.title}</h6>
                    ${
                      story.userPersona || story.userAction || story.userBenefit
                        ? `
                      <div class="p-2 rounded bg-light small mb-2 text-secondary font-monospace" style="font-size: 0.8rem;">
                        <strong>As a</strong> ${story.userPersona || 'user'},<br/>
                        <strong>I want</strong> ${story.userAction || 'feature action'},<br/>
                        <strong>So that</strong> ${story.userBenefit || 'business benefit'}.
                      </div>
                    `
                        : ''
                    }
                    <div class="small text-muted mb-2">
                      <i class="fa-solid fa-puzzle-piece text-info me-1"></i> Feature: <span class="fw-semibold text-dark">${feature?.name || 'Unlinked'}</span>
                    </div>
                    ${
                      story.acceptanceCriteria && story.acceptanceCriteria.length > 0
                        ? `
                      <div class="small text-muted mb-2">
                        <span class="fw-bold d-block mb-1">Acceptance Criteria:</span>
                        <ul class="list-unstyled ps-2 mb-0 small text-secondary">
                          ${story.acceptanceCriteria.slice(0, 3).map((c) => `<li><i class="fa-solid fa-circle-check text-success me-1"></i>${c}</li>`).join('')}
                        </ul>
                      </div>
                    `
                        : ''
                    }
                  </div>
                  <div class="card-footer bg-white border-top-0 pt-0 pb-3 d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-1.5 small text-muted">
                      <i class="fa-solid fa-user-circle"></i>
                      <span>${assignee ? `${assignee.firstName} ${assignee.lastName}` : 'Unassigned'}</span>
                      <span class="ms-2 badge bg-light text-secondary border">${tasksCount} Tasks</span>
                    </div>
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-outline-secondary btn-xs py-0 px-1.5" title="Trace Lineage" onclick="window.portalDeliveryModule.inspectTrace('story', '${story.id}')">
                        <i class="fa-solid fa-route"></i>
                      </button>
                      <button class="btn btn-outline-primary btn-xs py-0 px-1.5" title="Add Task" onclick="window.portalDeliveryModule.openTaskModal(null, '${story.id}', '${story.projectId}')">
                        <i class="fa-solid fa-plus"></i>
                      </button>
                      <button class="btn btn-outline-secondary btn-xs py-0 px-1.5" title="Edit" onclick="window.portalDeliveryModule.openStoryModal('${story.id}')">
                        <i class="fa-solid fa-pen"></i>
                      </button>
                      <button class="btn btn-outline-danger btn-xs py-0 px-1.5" title="Delete" onclick="window.portalDeliveryModule.deleteStory('${story.id}')">
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
        <button class="btn btn-primary btn-sm" onclick="window.portalDeliveryModule.openTaskModal()">
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
                    <td><span class="badge bg-primary-subtle text-primary fw-bold font-monospace">${task.code || 'TSK'}</span></td>
                    <td>
                      <div class="fw-bold text-dark">${task.title}</div>
                      <div class="text-muted small text-truncate" style="max-width: 250px;">${task.description || 'No description'}</div>
                    </td>
                    <td><span class="small fw-semibold text-warning">${story?.title || 'Unlinked'}</span></td>
                    <td><span class="small">${assignee ? `${assignee.firstName} ${assignee.lastName}` : 'Unassigned'}</span></td>
                    <td>${this.getStatusBadge(task.status)}</td>
                    <td>${this.getPriorityBadge(task.priority)}</td>
                    <td><span class="small">${task.estimatedHours || 0}h / ${task.spentHours || 0}h</span></td>
                    <td>
                      <div class="d-flex align-items-center gap-2" style="width: 100px;">
                        <div class="progress flex-grow-1" style="height: 6px;">
                          <div class="progress-bar bg-primary" style="width: ${task.progress || 0}%"></div>
                        </div>
                        <span class="small fw-bold">${task.progress || 0}%</span>
                      </div>
                    </td>
                    <td>
                      <button class="btn btn-outline-secondary btn-xs py-0 px-2 small" onclick="window.portalDeliveryModule.openSubtasksManager('${task.id}')">
                        <i class="fa-solid fa-list-check me-1"></i> ${completedSubs}/${taskSubtasks.length}
                      </button>
                    </td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" title="Trace Lineage" onclick="window.portalDeliveryModule.inspectTrace('task', '${task.id}')">
                          <i class="fa-solid fa-route"></i>
                        </button>
                        <button class="btn btn-outline-secondary" title="Edit" onclick="window.portalDeliveryModule.openTaskModal('${task.id}')">
                          <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-outline-danger" title="Delete" onclick="window.portalDeliveryModule.deleteTask('${task.id}')">
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
      if (type === 'task') items = this.tasks.map((t) => ({ id: t.id, label: `${t.code || 'TSK'}: ${t.title}` }));
      else if (type === 'subtask') items = this.subtasks.map((st) => ({ id: st.id, label: `Subtask: ${st.title}` }));
      else if (type === 'story') items = this.stories.map((s) => ({ id: s.id, label: `${s.code || 'STR'}: ${s.title}` }));
      else if (type === 'feature') items = this.features.map((f) => ({ id: f.id, label: `${f.code || 'FEAT'}: ${f.name}` }));
      else if (type === 'epic') items = this.epics.map((e) => ({ id: e.id, label: `${e.code || 'EPC'}: ${e.name}` }));
      else if (type === 'project') items = this.projects.map((p) => ({ id: p.id, label: `${p.code || 'PRJ'}: ${p.name}` }));

      itemSelect.innerHTML = items.map((i) => `<option value="${i.id}">${i.label}</option>`).join('');
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
                            <span class="badge bg-light text-secondary border text-uppercase small">${a.type}</span>
                            ${a.status ? this.getStatusBadge(a.status) : ''}
                          </div>
                          <strong class="d-block text-dark mt-0.5">${a.code ? `[${a.code}] ` : ''}${a.name}</strong>
                          ${a.progress !== undefined ? `<div class="small text-muted">Progress: ${a.progress}%</div>` : ''}
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
              <span class="badge bg-primary text-uppercase">${node.type}</span>
            </div>
            <div class="card-body p-3">
              <h5 class="fw-bold text-dark mb-1">${node.code ? `[${node.code}] ` : ''}${node.name}</h5>
              <div class="d-flex align-items-center gap-2 mb-2">
                ${node.status ? this.getStatusBadge(node.status) : ''}
                ${node.priority ? this.getPriorityBadge(node.priority) : ''}
                ${node.progress !== undefined ? `<span class="small fw-bold text-muted">${node.progress}% Progress</span>` : ''}
              </div>
              <p class="text-muted small mb-0">${node.description || 'No detailed specification provided.'}</p>
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
                        <span class="badge bg-light text-secondary border text-uppercase small">${c.type}</span>
                        <span class="fw-semibold small text-dark">${c.code ? `[${c.code}] ` : ''}${c.name}</span>
                      </div>
                      <div class="d-flex align-items-center gap-2">
                        ${c.status ? this.getStatusBadge(c.status) : ''}
                        <button class="btn btn-outline-secondary btn-xs py-0 px-1 text-xs" onclick="window.portalDeliveryModule.inspectTrace('${c.type}', '${c.id}')">
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
  openEpicModal(epicId = null, defaultProjectId = null) {
    const epic = epicId ? this.epics.find((e) => e.id === epicId) : null;
    const isEdit = !!epic;

    const bodyHtml = `
      <form id="form-epic-modal" class="row g-3">
        <div class="col-12">
          <label class="form-label fw-semibold">Epic Name <span class="text-danger">*</span></label>
          <input type="text" id="epic-name" class="form-control" required value="${epic ? epic.name : ''}" placeholder="e.g. Core Authentication & Identity Engine" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Target Project <span class="text-danger">*</span></label>
          <select id="epic-project" class="form-select" required>
            ${this.projects.map((p) => `<option value="${p.id}" ${epic && epic.projectId === p.id ? 'selected' : (!epic && defaultProjectId === p.id ? 'selected' : '')}>${p.name || p.id}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Target Release</label>
          <input type="text" id="epic-release" class="form-control" value="${epic?.targetRelease || 'Q3-2026'}" placeholder="e.g. Release 2.5 / Sprint 14" />
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
        <div class="col-12">
          <label class="form-label fw-semibold">Description & Objectives</label>
          <textarea id="epic-desc" class="form-control" rows="3" placeholder="Strategic delivery goals and business requirements...">${epic?.description || ''}</textarea>
        </div>
      </form>
    `;

    this.app.openModal(isEdit ? 'Edit Epic' : 'Create New Epic', bodyHtml, async () => {
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
          <input type="text" id="feat-name" class="form-control" required value="${feature ? feature.name : ''}" placeholder="e.g. Multi-Factor Authentication (MFA)" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Parent Epic</label>
          <select id="feat-epic" class="form-select">
            <option value="">-- No Epic (Unlinked) --</option>
            ${this.epics.map((e) => `<option value="${e.id}" ${feature && feature.epicId === e.id ? 'selected' : (!feature && defaultEpicId === e.id ? 'selected' : '')}>[${e.code || 'EPC'}] ${e.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Project <span class="text-danger">*</span></label>
          <select id="feat-project" class="form-select" required>
            ${this.projects.map((p) => `<option value="${p.id}" ${feature && feature.projectId === p.id ? 'selected' : (!feature && defaultProjectId === p.id ? 'selected' : '')}>${p.name || p.id}</option>`).join('')}
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
        <div class="col-12">
          <label class="form-label fw-semibold">Description</label>
          <textarea id="feat-desc" class="form-control" rows="3" placeholder="Technical specifications and criteria...">${feature?.description || ''}</textarea>
        </div>
      </form>
    `;

    this.app.openModal(isEdit ? 'Edit Feature' : 'Create New Feature', bodyHtml, async () => {
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
  openStoryModal(storyId = null, defaultFeatureId = null, defaultProjectId = null) {
    const story = storyId ? this.stories.find((s) => s.id === storyId) : null;
    const isEdit = !!story;

    const bodyHtml = `
      <form id="form-story-modal" class="row g-3">
        <div class="col-12">
          <label class="form-label fw-semibold">Story Title <span class="text-danger">*</span></label>
          <input type="text" id="story-title" class="form-control" required value="${story ? story.title : ''}" placeholder="e.g. As an Admin, I want to enforce MFA logins" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Parent Feature</label>
          <select id="story-feature" class="form-select">
            <option value="">-- No Feature (Unlinked) --</option>
            ${this.features.map((f) => `<option value="${f.id}" ${story && story.featureId === f.id ? 'selected' : (!story && defaultFeatureId === f.id ? 'selected' : '')}>[${f.code || 'FEAT'}] ${f.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Project <span class="text-danger">*</span></label>
          <select id="story-project" class="form-select" required>
            ${this.projects.map((p) => `<option value="${p.id}" ${story && story.projectId === p.id ? 'selected' : (!story && defaultProjectId === p.id ? 'selected' : '')}>${p.name || p.id}</option>`).join('')}
          </select>
        </div>
        <div class="col-12 p-3 bg-light rounded border">
          <div class="fw-bold small text-secondary mb-2">Agile User Story Format:</div>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label small mb-1">As a (Persona):</label>
              <input type="text" id="story-persona" class="form-control form-control-sm" value="${story?.userPersona || ''}" placeholder="e.g. System Administrator" />
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-1">I want (Action):</label>
              <input type="text" id="story-action" class="form-control form-control-sm" value="${story?.userAction || ''}" placeholder="e.g. to require TOTP verification" />
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-1">So that (Benefit):</label>
              <input type="text" id="story-benefit" class="form-control form-control-sm" value="${story?.userBenefit || ''}" placeholder="e.g. credential theft is prevented" />
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Story Points (Fibonacci)</label>
          <select id="story-points" class="form-select">
            <option value="1" ${story?.storyPoints === 1 ? 'selected' : ''}>1 Point</option>
            <option value="2" ${story?.storyPoints === 2 ? 'selected' : ''}>2 Points</option>
            <option value="3" ${story?.storyPoints === 3 || !story ? 'selected' : ''}>3 Points</option>
            <option value="5" ${story?.storyPoints === 5 ? 'selected' : ''}>5 Points</option>
            <option value="8" ${story?.storyPoints === 8 ? 'selected' : ''}>8 Points</option>
            <option value="13" ${story?.storyPoints === 13 ? 'selected' : ''}>13 Points</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Status</label>
          <select id="story-status" class="form-select">
            <option value="backlog" ${story?.status === 'backlog' ? 'selected' : ''}>Backlog</option>
            <option value="ready" ${story?.status === 'ready' ? 'selected' : ''}>Ready for Sprint</option>
            <option value="in-progress" ${story?.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="review" ${story?.status === 'review' ? 'selected' : ''}>In Review</option>
            <option value="done" ${story?.status === 'done' ? 'selected' : ''}>Done</option>
            <option value="blocked" ${story?.status === 'blocked' ? 'selected' : ''}>Blocked</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Assignee</label>
          <select id="story-assignee" class="form-select">
            <option value="">-- Unassigned --</option>
            ${this.users.map((u) => `<option value="${u.id}" ${story?.assigneeId === u.id ? 'selected' : ''}>${u.firstName} ${u.lastName}</option>`).join('')}
          </select>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">Acceptance Criteria (One per line)</label>
          <textarea id="story-criteria" class="form-control" rows="3" placeholder="User can scan QR code with authenticator app&#10;Invalid codes return 401 error">${story?.acceptanceCriteria ? story.acceptanceCriteria.join('\n') : ''}</textarea>
        </div>
      </form>
    `;

    this.app.openModal(isEdit ? 'Edit User Story' : 'Create User Story', bodyHtml, async () => {
      const title = document.getElementById('story-title')?.value.trim();
      const projectId = document.getElementById('story-project')?.value;
      if (!title || !projectId) {
        this.app.showToast('Please specify Story Title and Project', 'warning');
        return false;
      }

      const criteriaText = document.getElementById('story-criteria')?.value.trim() || '';
      const acceptanceCriteria = criteriaText
        ? criteriaText
            .split('\n')
            .map((c) => c.trim())
            .filter((c) => c.length > 0)
        : [];

      const payload = {
        title,
        projectId,
        featureId: document.getElementById('story-feature')?.value || null,
        userPersona: document.getElementById('story-persona')?.value.trim() || null,
        userAction: document.getElementById('story-action')?.value.trim() || null,
        userBenefit: document.getElementById('story-benefit')?.value.trim() || null,
        storyPoints: parseInt(document.getElementById('story-points')?.value, 10) || 3,
        status: document.getElementById('story-status')?.value || 'backlog',
        assigneeId: document.getElementById('story-assignee')?.value || null,
        acceptanceCriteria,
      };

      try {
        if (isEdit) {
          await StoryService.updateStory(story.id, payload);
          this.app.showToast('Story updated successfully', 'success');
        } else {
          await StoryService.createStory(payload);
          this.app.showToast('Story created successfully', 'success');
        }
        await this.loadData();
        this.render();
      } catch (err) {
        this.app.showToast('Failed saving Story', 'danger');
      }
    });
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
          <input type="text" id="task-title" class="form-control" required value="${task ? task.title : ''}" placeholder="e.g. Implement TOTP verification endpoint" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Parent User Story</label>
          <select id="task-story" class="form-select">
            <option value="">-- No Story (Unlinked) --</option>
            ${this.stories.map((s) => `<option value="${s.id}" ${task && task.storyId === s.id ? 'selected' : (!task && defaultStoryId === s.id ? 'selected' : '')}>[${s.code || 'STR'}] ${s.title}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Project <span class="text-danger">*</span></label>
          <select id="task-project" class="form-select" required>
            ${this.projects.map((p) => `<option value="${p.id}" ${task && task.projectId === p.id ? 'selected' : (!task && defaultProjectId === p.id ? 'selected' : '')}>${p.name || p.id}</option>`).join('')}
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
            ${this.users.map((u) => `<option value="${u.id}" ${task?.assigneeId === u.id ? 'selected' : ''}>${u.firstName} ${u.lastName}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Estimated Hours</label>
          <input type="number" id="task-esthours" class="form-control" value="${task?.estimatedHours || 8}" min="0" />
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Spent Hours</label>
          <input type="number" id="task-spent" class="form-control" value="${task?.spentHours || 0}" min="0" />
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">Description & Acceptance Notes</label>
          <textarea id="task-desc" class="form-control" rows="2" placeholder="Task execution details...">${task?.description || ''}</textarea>
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
            <h6 class="fw-bold mb-0">${task.title}</h6>
            <span class="text-muted small">Parent Task: ${task.code || 'TSK'} | Progress: ${task.progress || 0}%</span>
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
                    <input class="form-check-input" type="checkbox" id="chk-sub-${st.id}" ${st.status === 'done' ? 'checked' : ''} onchange="window.portalDeliveryModule.toggleSubtaskStatus('${st.id}', this.checked)" />
                    <label class="form-check-label ${st.status === 'done' ? 'text-decoration-line-through text-muted' : 'fw-semibold'}" for="chk-sub-${st.id}">
                      ${st.title}
                    </label>
                  </div>
                  <div class="d-flex align-items-center gap-2">
                    <span class="badge ${st.status === 'done' ? 'bg-success' : 'bg-light text-secondary'} small">${st.status}</span>
                    <button class="btn btn-outline-danger btn-xs py-0 px-1 text-xs" onclick="window.portalDeliveryModule.deleteSubtask('${st.id}', '${taskId}')">
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
          <div class="card p-3 border hover-shadow" style="cursor: pointer;" onclick="window.portalDeliveryModule.openEpicModal();">
            <i class="fa-solid fa-crown text-purple fa-2x mb-2" style="color: #7c3aed;"></i>
            <h6 class="fw-bold">Epic</h6>
            <span class="text-muted small">Major initiative spanning multiple sprints</span>
          </div>
        </div>
        <div class="col-6">
          <div class="card p-3 border hover-shadow" style="cursor: pointer;" onclick="window.portalDeliveryModule.openFeatureModal();">
            <i class="fa-solid fa-puzzle-piece text-info fa-2x mb-2"></i>
            <h6 class="fw-bold">Feature</h6>
            <span class="text-muted small">Distinct capability satisfying customer need</span>
          </div>
        </div>
        <div class="col-6">
          <div class="card p-3 border hover-shadow" style="cursor: pointer;" onclick="window.portalDeliveryModule.openStoryModal();">
            <i class="fa-solid fa-book-open text-warning fa-2x mb-2"></i>
            <h6 class="fw-bold">User Story</h6>
            <span class="text-muted small">Deliverable described from end-user perspective</span>
          </div>
        </div>
        <div class="col-6">
          <div class="card p-3 border hover-shadow" style="cursor: pointer;" onclick="window.portalDeliveryModule.openTaskModal();">
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
    const cls = map[status] || 'bg-light text-dark';
    return `<span class="badge ${cls} text-capitalize">${status || 'unknown'}</span>`;
  },

  getPriorityBadge(priority) {
    const map = {
      critical: 'bg-danger text-white',
      high: 'bg-danger-subtle text-danger',
      medium: 'bg-warning-subtle text-warning',
      low: 'bg-info-subtle text-info',
    };
    const cls = map[priority] || 'bg-light text-dark';
    return `<span class="badge ${cls} text-capitalize">${priority || 'medium'}</span>`;
  },
};

// Expose globally for inline DOM click handlers
window.portalDeliveryModule = DeliveryModule;
