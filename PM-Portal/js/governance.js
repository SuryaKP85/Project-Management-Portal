/**
 * Governance & Delivery Control Module (Sprint 5)
 * Unifies Risks, Issues, Dependencies, Milestones, Releases and Traceability into a connected governance layer.
 */

import { GovernanceService } from './services/governanceService.js';
import { RiskService } from './services/riskService.js';
import { IssueService } from './services/issueService.js';
import { DependencyService } from './services/dependencyService.js';
import { MilestoneService } from './services/milestoneService.js';
import { ReleaseService } from './services/releaseService.js';
import { ProjectService } from './services/projectService.js';
import { UserService } from './services/userService.js';
import { DeliveryService } from './services/deliveryService.js';

export const GovernanceModule = {
  app: null,
  activeTab: 'dashboard', // 'dashboard' | 'risks' | 'issues' | 'dependencies' | 'milestones' | 'releases' | 'traceability'

  // Data cache
  summary: null,
  risks: [],
  issues: [],
  dependencies: [],
  milestones: [],
  releases: [],
  projects: [],
  users: [],
  deliveryItems: [],

  // Filters
  filterProjectId: 'all',
  filterSeverity: 'all',
  filterStatus: 'all',
  searchQuery: '',
  selectedTrace: null,
  selectedEntityForChain: '',

  async init(appInstance, defaultTab = 'dashboard') {
    this.app = appInstance;
    this.activeTab = defaultTab;
    await this.loadData();
    this.setupEventListeners();
    this.render();
  },

  async loadData() {
    try {
      const [summary, risks, issues, dependencies, milestones, releases, projects, users] = await Promise.all([
        GovernanceService.getSummary().catch(() => null),
        RiskService.getRisks().catch(() => []),
        IssueService.getIssues().catch(() => []),
        DependencyService.getDependencies().catch(() => []),
        MilestoneService.getMilestones().catch(() => []),
        ReleaseService.getReleases().catch(() => []),
        ProjectService.getProjects().catch(() => []),
        UserService.getUsers().catch(() => []),
      ]);

      this.summary = summary;
      this.risks = risks || [];
      this.issues = issues || [];
      this.dependencies = dependencies || [];
      this.milestones = milestones || [];
      this.releases = releases || [];
      this.projects = projects || [];
      this.users = users || [];

      // Fetch delivery items for linking
      const deliverySummary = await DeliveryService.getSummary().catch(() => null);
      if (deliverySummary && deliverySummary.recentItems) {
        this.deliveryItems = deliverySummary.recentItems;
      }
    } catch (err) {
      console.error('Failed to load governance data', err);
      if (this.app) this.app.showToast('Failed to load governance data', 'danger');
    }
  },

  setupEventListeners() {
    const container = document.getElementById('page-governance');
    if (!container) return;

    // Tab buttons
    container.querySelectorAll('.gov-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = btn.getAttribute('data-tab');
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    // Project filter
    const projFilter = container.querySelector('#gov-filter-project');
    if (projFilter) {
      projFilter.addEventListener('change', (e) => {
        this.filterProjectId = e.target.value;
        this.renderTabContent();
      });
    }

    // Search input
    const searchInput = container.querySelector('#gov-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTabContent();
      });
    }

    // Action buttons
    const btnNewRisk = container.querySelector('#gov-btn-new-risk');
    if (btnNewRisk) btnNewRisk.addEventListener('click', () => this.openRiskModal());

    const btnNewIssue = container.querySelector('#gov-btn-new-issue');
    if (btnNewIssue) btnNewIssue.addEventListener('click', () => this.openIssueModal());

    const btnNewDep = container.querySelector('#gov-btn-new-dep');
    if (btnNewDep) btnNewDep.addEventListener('click', () => this.openDependencyModal());

    const btnNewMilestone = container.querySelector('#gov-btn-new-milestone');
    if (btnNewMilestone) btnNewMilestone.addEventListener('click', () => this.openMilestoneModal());

    const btnNewRelease = container.querySelector('#gov-btn-new-release');
    if (btnNewRelease) btnNewRelease.addEventListener('click', () => this.openReleaseModal());

    const btnAudit = container.querySelector('#gov-btn-run-audit');
    if (btnAudit) {
      btnAudit.addEventListener('click', async () => {
        const pId = this.filterProjectId !== 'all' ? this.filterProjectId : this.projects[0]?.id;
        if (!pId) {
          this.app?.showToast('Please select a project to run risk audit scan', 'warning');
          return;
        }
        try {
          btnAudit.disabled = true;
          btnAudit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Auditing...';
          const audit = await RiskService.runProjectAudit(pId);
          this.app?.showToast(`Audit scan complete. Health score: ${audit.healthScore}/100`, 'info');
          await this.loadData();
          this.render();
        } catch (err) {
          this.app?.showToast('Error executing audit scan', 'danger');
        } finally {
          btnAudit.disabled = false;
          btnAudit.innerHTML = '<i class="fa-solid fa-arrows-spin"></i> Run Risk Audit Scan';
        }
      });
    }
  },

  switchTab(tab) {
    this.activeTab = tab;
    const container = document.getElementById('page-governance');
    if (!container) return;

    container.querySelectorAll('.gov-tab-btn').forEach((b) => {
      if (b.getAttribute('data-tab') === tab) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    this.renderTabContent();
  },

  render() {
    this.populateProjectFilter();
    this.renderTabContent();
  },

  populateProjectFilter() {
    const sel = document.getElementById('gov-filter-project');
    if (!sel) return;
    const currentVal = this.filterProjectId;
    sel.innerHTML = `
      <option value="all">All Projects</option>
      ${this.projects.map((p) => `<option value="${p.id}" ${p.id === currentVal ? 'selected' : ''}>[${p.code || p.id}] ${p.name}</option>`).join('')}
    `;
  },

  renderTabContent() {
    const container = document.getElementById('gov-tab-content-area');
    if (!container) return;

    switch (this.activeTab) {
      case 'dashboard':
        this.renderDashboardTab(container);
        break;
      case 'risks':
        this.renderRisksTab(container);
        break;
      case 'issues':
        this.renderIssuesTab(container);
        break;
      case 'dependencies':
        this.renderDependenciesTab(container);
        break;
      case 'milestones':
        this.renderMilestonesTab(container);
        break;
      case 'releases':
        this.renderReleasesTab(container);
        break;
      case 'traceability':
        this.renderTraceabilityTab(container);
        break;
      default:
        this.renderDashboardTab(container);
    }
  },

  // =========================================================================
  // 1. EXECUTIVE GOVERNANCE DASHBOARD TAB
  // =========================================================================
  renderDashboardTab(container) {
    const kpis = this.summary?.kpis || {
      criticalRisksCount: this.risks.filter((r) => r.severity === 'Critical' && r.status !== 'Closed').length,
      highRisksCount: this.risks.filter((r) => r.severity === 'High' && r.status !== 'Closed').length,
      openIssuesCount: this.issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed').length,
      criticalIssuesCount: this.issues.filter((i) => i.severity === 'Critical' && i.status !== 'Resolved').length,
      blockingDependenciesCount: this.dependencies.filter((d) => d.dependencyType === 'Blocks' && d.status !== 'Resolved').length,
      upcomingMilestonesCount: this.milestones.filter((m) => m.status !== 'Completed').length,
      atRiskMilestonesCount: this.milestones.filter((m) => m.health === 'At Risk' || m.health === 'Critical').length,
      activeReleasesCount: this.releases.filter((r) => r.status !== 'Released').length,
      atRiskReleasesCount: this.releases.filter((r) => r.health === 'At Risk' || r.health === 'Off Track').length,
    };

    const scorecards = this.summary?.projectScorecards || [];
    const activities = this.summary?.recentActivities || [];

    container.innerHTML = `
      <!-- KPI Top Summary Grid -->
      <div class="stats-grid mb-4">
        <div class="kpi-card" style="border: 1px solid var(--border-color); border-radius: var(--border-radius-md); background-color: var(--bg-card); cursor: pointer;" onclick="window.GovernanceModule.switchTab('risks')">
          <div class="kpi-header">
            <span class="kpi-title">Critical & High Risks</span>
            <div class="kpi-icon-wrapper" style="background-color: rgba(239, 68, 68, 0.1); color: var(--brand-danger);">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
          </div>
          <div>
            <h3 class="kpi-value mb-0 text-danger">${kpis.criticalRisksCount} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-secondary);">(${kpis.highRisksCount} High)</span></h3>
            <div class="text-xs text-secondary mt-1">Active risks threatening project milestones</div>
          </div>
        </div>

        <div class="kpi-card" style="border: 1px solid var(--border-color); border-radius: var(--border-radius-md); background-color: var(--bg-card); cursor: pointer;" onclick="window.GovernanceModule.switchTab('issues')">
          <div class="kpi-header">
            <span class="kpi-title">Active Issues</span>
            <div class="kpi-icon-wrapper" style="background-color: rgba(245, 158, 11, 0.1); color: var(--brand-warning);">
              <i class="fa-solid fa-circle-exclamation"></i>
            </div>
          </div>
          <div>
            <h3 class="kpi-value mb-0 text-warning">${kpis.openIssuesCount} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-secondary);">(${kpis.criticalIssuesCount} Severe)</span></h3>
            <div class="text-xs text-secondary mt-1">Impediments currently impacting sprint progress</div>
          </div>
        </div>

        <div class="kpi-card" style="border: 1px solid var(--border-color); border-radius: var(--border-radius-md); background-color: var(--bg-card); cursor: pointer;" onclick="window.GovernanceModule.switchTab('dependencies')">
          <div class="kpi-header">
            <span class="kpi-title">Blocking Dependencies</span>
            <div class="kpi-icon-wrapper" style="background-color: rgba(79, 70, 229, 0.1); color: var(--brand-primary);">
              <i class="fa-solid fa-arrows-split-up-and-left"></i>
            </div>
          </div>
          <div>
            <h3 class="kpi-value mb-0 text-primary">${kpis.blockingDependenciesCount}</h3>
            <div class="text-xs text-secondary mt-1">Cross-team or inter-story blocking relationships</div>
          </div>
        </div>

        <div class="kpi-card" style="border: 1px solid var(--border-color); border-radius: var(--border-radius-md); background-color: var(--bg-card); cursor: pointer;" onclick="window.GovernanceModule.switchTab('milestones')">
          <div class="kpi-header">
            <span class="kpi-title">Milestones & Releases</span>
            <div class="kpi-icon-wrapper" style="background-color: rgba(16, 185, 129, 0.1); color: var(--brand-success);">
              <i class="fa-solid fa-flag-checkered"></i>
            </div>
          </div>
          <div>
            <h3 class="kpi-value mb-0 text-success">${kpis.upcomingMilestonesCount} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-secondary);">(${kpis.atRiskMilestonesCount} At Risk)</span></h3>
            <div class="text-xs text-secondary mt-1">${kpis.activeReleasesCount} planned pipeline releases</div>
          </div>
        </div>
      </div>

      <!-- Main Middle Row: Risk Heatmap Preview + Project Governance Scorecard -->
      <div class="row g-4 mb-4">
        <!-- 5x5 Heatmap Preview -->
        <div class="col-lg-5 col-md-12">
          <div class="enterprise-card h-100" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
            <div class="p-3 border-bottom d-flex justify-content-between align-items-center" style="background-color: var(--bg-light);">
              <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">
                <i class="fa-solid fa-border-all text-danger me-1"></i> Exposure Heatmap Matrix (5x5)
              </h5>
              <button class="btn-enterprise btn-enterprise-secondary btn-sm" onclick="window.GovernanceModule.switchTab('risks')">View All Risks</button>
            </div>
            <div class="p-3">
              <div class="d-flex" style="font-size: 0.72rem;">
                <div class="d-flex flex-column justify-content-center align-items-center font-bold text-secondary text-uppercase pe-2" style="writing-mode: vertical-lr; transform: rotate(180deg); width: 22px;">
                  Impact (1-5) &rarr;
                </div>
                <div class="flex-grow-1">
                  <div id="gov-dashboard-heatmap" class="d-grid" style="grid-template-rows: repeat(5, 1fr); gap: 4px; height: 260px;">
                    ${this.renderHeatmapGridHtml()}
                  </div>
                  <div class="text-center font-bold text-secondary text-uppercase mt-2">
                    Likelihood / Probability (1-5) &rarr;
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-center gap-3 mt-3 pt-2 border-top text-xs font-semibold">
                <span class="d-flex align-items-center gap-1"><span style="width:10px;height:10px;background:#10b981;border-radius:2px;"></span> Low (1-4)</span>
                <span class="d-flex align-items-center gap-1"><span style="width:10px;height:10px;background:#f59e0b;border-radius:2px;"></span> Medium (5-9)</span>
                <span class="d-flex align-items-center gap-1"><span style="width:10px;height:10px;background:#f97316;border-radius:2px;"></span> High (10-14)</span>
                <span class="d-flex align-items-center gap-1"><span style="width:10px;height:10px;background:#ef4444;border-radius:2px;"></span> Critical (15-25)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Project Scorecards -->
        <div class="col-lg-7 col-md-12">
          <div class="enterprise-card h-100" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
            <div class="p-3 border-bottom d-flex justify-content-between align-items-center" style="background-color: var(--bg-light);">
              <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">
                <i class="fa-solid fa-list-check text-primary me-1"></i> Project Governance Scorecards
              </h5>
              <span class="badge bg-secondary-subtle text-secondary">${scorecards.length} Projects Monitored</span>
            </div>
            <div class="table-responsive-container" style="max-height: 330px; overflow-y: auto;">
              <table class="table-enterprise w-100" style="font-size: 0.82rem;">
                <thead>
                  <tr style="border-bottom: 2px solid var(--border-color); background-color: var(--bg-main);">
                    <th>Project</th>
                    <th class="text-center">Risks</th>
                    <th class="text-center">Issues</th>
                    <th class="text-center">Blockers</th>
                    <th class="text-center">Milestones</th>
                    <th class="text-center">Health</th>
                    <th class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${scorecards.length === 0 ? `<tr><td colspan="7" class="text-center p-3 text-secondary">No project scorecards recorded.</td></tr>` : ''}
                  ${scorecards
                    .map((sc) => {
                      const healthBadge =
                        sc.overallHealth === 'Critical'
                          ? '<span class="badge bg-danger-subtle text-danger font-bold">Critical</span>'
                          : sc.overallHealth === 'At Risk'
                          ? '<span class="badge bg-warning-subtle text-warning font-bold">At Risk</span>'
                          : '<span class="badge bg-success-subtle text-success font-bold">On Track</span>';

                      return `
                      <tr>
                        <td>
                          <div class="font-bold text-truncate" style="max-width: 180px;">${sc.projectName}</div>
                          <span class="badge bg-light text-secondary border font-monospace">${sc.projectCode}</span>
                        </td>
                        <td class="text-center">
                          ${sc.criticalRisks > 0 ? `<span class="badge bg-danger text-white">${sc.criticalRisks} Crit</span>` : `<span class="text-secondary">0</span>`}
                        </td>
                        <td class="text-center">
                          ${sc.openIssues > 0 ? `<span class="badge bg-warning text-dark font-bold">${sc.openIssues}</span>` : `<span class="text-secondary">0</span>`}
                        </td>
                        <td class="text-center">
                          ${sc.blockingDependencies > 0 ? `<span class="badge bg-primary text-white">${sc.blockingDependencies}</span>` : `<span class="text-secondary">0</span>`}
                        </td>
                        <td class="text-center">
                          ${sc.milestonesAtRisk > 0 ? `<span class="badge bg-danger-subtle text-danger font-bold">${sc.milestonesAtRisk} At Risk</span>` : `<span class="text-success font-bold">&check; Safe</span>`}
                        </td>
                        <td class="text-center">${healthBadge}</td>
                        <td class="text-end">
                          <button class="btn-enterprise btn-enterprise-secondary btn-sm" onclick="window.GovernanceModule.inspectProject('${sc.projectId}')" title="Inspect Governance Chain">
                            <i class="fa-solid fa-magnifying-glass-chart"></i>
                          </button>
                        </td>
                      </tr>
                    `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Row: Recent Governance Activity Log -->
      <div class="enterprise-card" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
        <div class="p-3 border-bottom d-flex justify-content-between align-items-center" style="background-color: var(--bg-light);">
          <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">
            <i class="fa-solid fa-clock-rotate-left text-info me-1"></i> Recent Governance Stream
          </h5>
          <span class="text-xs text-secondary">Logged in PostgreSQL Audit Ledger</span>
        </div>
        <div class="p-3">
          ${
            activities.length === 0
              ? `<div class="text-center text-secondary py-3">No governance activities recorded yet.</div>`
              : `<div class="d-flex flex-column gap-2">
                ${activities
                  .slice(0, 8)
                  .map(
                    (a) => `
                  <div class="d-flex align-items-center justify-content-between p-2 rounded" style="background-color: var(--bg-main); border: 1px solid var(--border-color); font-size: 0.82rem;">
                    <div class="d-flex align-items-center gap-2">
                      <span class="badge ${this.getActivityBadgeClass(a.entityType)} text-uppercase">${a.entityType}</span>
                      <span class="font-bold">${a.actorName || 'Admin'}</span>
                      <span class="text-secondary">${a.action}</span>
                      <span class="font-semibold text-primary">[${a.details?.code || a.entityId}]</span>
                      <span class="text-truncate" style="max-width: 350px;">${a.details?.title || a.details?.name || ''}</span>
                    </div>
                    <span class="text-xs text-secondary">${new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                `
                  )
                  .join('')}
              </div>`
          }
        </div>
      </div>
    `;
  },

  renderHeatmapGridHtml() {
    let rowsHtml = '';
    // Impact 5 down to 1
    for (let impact = 5; impact >= 1; impact--) {
      let cellsHtml = '';
      for (let prob = 1; prob <= 5; prob++) {
        const score = impact * prob;
        const matchingRisks = this.risks.filter(
          (r) => r.probability === prob && r.impact === impact && r.status !== 'Closed'
        );
        const count = matchingRisks.length;

        let bg = 'rgba(16, 185, 129, 0.15)';
        let textCol = '#059669';
        let border = 'rgba(16, 185, 129, 0.3)';
        if (score >= 15) {
          bg = 'rgba(239, 68, 68, 0.2)';
          textCol = '#dc2626';
          border = 'rgba(239, 68, 68, 0.4)';
        } else if (score >= 10) {
          bg = 'rgba(249, 115, 22, 0.2)';
          textCol = '#ea580c';
          border = 'rgba(249, 115, 22, 0.4)';
        } else if (score >= 5) {
          bg = 'rgba(245, 158, 11, 0.2)';
          textCol = '#d97706';
          border = 'rgba(245, 158, 11, 0.4)';
        }

        cellsHtml += `
          <div style="background:${bg}; border: 1px solid ${border}; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.72rem; cursor: pointer; transition: transform 0.1s;"
               title="Impact: ${impact}, Likelihood: ${prob}, Score: ${score} - ${count} Risks"
               onclick="window.GovernanceModule.filterRisksByCell(${prob}, ${impact})">
            <span style="font-weight: 700; color: ${textCol};">${count > 0 ? count : ''}</span>
            <span style="font-size: 0.62rem; opacity: 0.7; color: var(--text-secondary);">${score}</span>
          </div>
        `;
      }
      rowsHtml += `<div class="d-grid" style="grid-template-columns: repeat(5, 1fr); gap: 4px;">${cellsHtml}</div>`;
    }
    return rowsHtml;
  },

  filterRisksByCell(prob, impact) {
    this.switchTab('risks');
    const filtered = this.risks.filter((r) => r.probability === prob && r.impact === impact);
    this.app?.showToast(`Filtered to cell [P:${prob}, I:${impact}]: ${filtered.length} risk(s)`, 'info');
  },

  inspectProject(projectId) {
    this.selectedTrace = { type: 'project', id: projectId };
    this.switchTab('traceability');
  },

  getActivityBadgeClass(type) {
    switch (type) {
      case 'risk':
        return 'bg-danger-subtle text-danger';
      case 'issue':
        return 'bg-warning-subtle text-warning';
      case 'dependency':
        return 'bg-primary-subtle text-primary';
      case 'milestone':
        return 'bg-success-subtle text-success';
      case 'release':
        return 'bg-info-subtle text-info';
      default:
        return 'bg-secondary-subtle text-secondary';
    }
  },

  // =========================================================================
  // 2. RISKS REGISTER TAB
  // =========================================================================
  renderRisksTab(container) {
    let filtered = this.risks;
    if (this.filterProjectId !== 'all') {
      filtered = filtered.filter((r) => r.projectId === this.filterProjectId);
    }
    if (this.filterSeverity !== 'all') {
      filtered = filtered.filter((r) => r.severity === this.filterSeverity);
    }
    if (this.searchQuery) {
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(this.searchQuery) ||
          (r.code && r.code.toLowerCase().includes(this.searchQuery)) ||
          (r.description && r.description.toLowerCase().includes(this.searchQuery))
      );
    }

    container.innerHTML = `
      <div class="enterprise-card" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
        <div class="table-panel-header p-3 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-3" style="background-color: var(--bg-light);">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">
              <i class="fa-solid fa-shield-halved text-danger me-1"></i> Connected Risk Register
            </h5>
            <div class="d-flex align-items-center gap-1">
              <button class="btn-enterprise btn-enterprise-secondary btn-sm ${this.filterSeverity === 'all' ? 'active' : ''}" onclick="window.GovernanceModule.setRiskSeverityFilter('all')">All</button>
              <button class="btn-enterprise btn-enterprise-secondary btn-sm text-danger ${this.filterSeverity === 'Critical' ? 'active' : ''}" onclick="window.GovernanceModule.setRiskSeverityFilter('Critical')">Critical</button>
              <button class="btn-enterprise btn-enterprise-secondary btn-sm text-warning ${this.filterSeverity === 'High' ? 'active' : ''}" onclick="window.GovernanceModule.setRiskSeverityFilter('High')">High</button>
              <button class="btn-enterprise btn-enterprise-secondary btn-sm text-primary ${this.filterSeverity === 'Medium' ? 'active' : ''}" onclick="window.GovernanceModule.setRiskSeverityFilter('Medium')">Medium</button>
              <button class="btn-enterprise btn-enterprise-secondary btn-sm text-success ${this.filterSeverity === 'Low' ? 'active' : ''}" onclick="window.GovernanceModule.setRiskSeverityFilter('Low')">Low</button>
            </div>
          </div>
          <button class="btn-enterprise btn-enterprise-primary btn-sm" onclick="window.GovernanceModule.openRiskModal()">
            <i class="fa-solid fa-plus me-1"></i> Log Risk
          </button>
        </div>

        <div class="table-responsive-container">
          <table class="table-enterprise w-100" style="font-size: 0.83rem;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-color); background-color: var(--bg-main);">
                <th style="width: 100px;">Code</th>
                <th>Risk Title & Description</th>
                <th style="width: 110px;">Category</th>
                <th style="width: 100px; text-align: center;">Likelihood</th>
                <th style="width: 90px; text-align: center;">Impact</th>
                <th style="width: 90px; text-align: center;">Score</th>
                <th style="width: 100px;">Severity</th>
                <th style="width: 100px;">Status</th>
                <th style="width: 120px;">Target Date</th>
                <th style="width: 130px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `<tr><td colspan="10" class="text-center p-4 text-secondary">No risk items match your filters.</td></tr>` : ''}
              ${filtered
                .map((r) => {
                  const sevBadge =
                    r.severity === 'Critical'
                      ? 'bg-danger text-white'
                      : r.severity === 'High'
                      ? 'bg-warning text-dark font-bold'
                      : r.severity === 'Medium'
                      ? 'bg-primary-subtle text-primary'
                      : 'bg-success-subtle text-success';

                  return `
                  <tr>
                    <td><span class="badge bg-light text-secondary border font-monospace font-bold">${r.code}</span></td>
                    <td>
                      <div class="font-bold text-primary" style="cursor: pointer;" onclick="window.GovernanceModule.openRiskDetails('${r.id}')">${r.title}</div>
                      <div class="text-xs text-secondary text-truncate" style="max-width: 320px;">${r.description || 'No description entered'}</div>
                      ${r.mitigationStrategy ? `<div class="text-xs text-muted mt-1"><i class="fa-solid fa-shield-check text-success me-1"></i>Mitigation: ${r.mitigationStrategy}</div>` : ''}
                    </td>
                    <td><span class="badge bg-secondary-subtle text-secondary">${r.category}</span></td>
                    <td class="text-center font-bold">${r.probability}/5</td>
                    <td class="text-center font-bold">${r.impact}/5</td>
                    <td class="text-center font-bold text-danger">${r.score}</td>
                    <td><span class="badge ${sevBadge}">${r.severity}</span></td>
                    <td><span class="badge bg-light text-dark border">${r.status}</span></td>
                    <td><span class="text-xs">${r.targetResolutionDate || 'None'}</span></td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn-enterprise btn-enterprise-secondary" onclick="window.GovernanceModule.openRiskDetails('${r.id}')" title="Details & Links">
                          <i class="fa-solid fa-link"></i>
                        </button>
                        <button class="btn-enterprise btn-enterprise-secondary" onclick="window.GovernanceModule.openRiskModal('${r.id}')" title="Edit">
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-enterprise btn-enterprise-secondary text-danger" onclick="window.GovernanceModule.deleteRisk('${r.id}')" title="Delete">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  setRiskSeverityFilter(sev) {
    this.filterSeverity = sev;
    this.renderTabContent();
  },

  openRiskModal(riskId = null) {
    const existing = riskId ? this.risks.find((r) => r.id === riskId) : null;
    const isEdit = !!existing;

    const html = `
      <form id="gov-risk-form" class="row g-3">
        <div class="col-md-8">
          <label class="form-label font-bold text-xs text-secondary mb-1">Risk Title *</label>
          <input type="text" id="m-risk-title" class="form-control" value="${existing?.title || ''}" required placeholder="e.g. Third-party payment gateway SLA degradation" />
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Category *</label>
          <select id="m-risk-category" class="form-select">
            ${['Technical', 'Schedule', 'Resource', 'External', 'Security', 'Compliance', 'Financial']
              .map((c) => `<option value="${c}" ${existing?.category === c ? 'selected' : ''}>${c}</option>`)
              .join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Associated Project</label>
          <select id="m-risk-project" class="form-select">
            <option value="">-- Unassigned / Portfolio-level --</option>
            ${this.projects.map((p) => `<option value="${p.id}" ${existing?.projectId === p.id ? 'selected' : ''}>[${p.code || p.id}] ${p.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Status</label>
          <select id="m-risk-status" class="form-select">
            ${['Identified', 'Analyzing', 'Mitigating', 'Accepted', 'Closed']
              .map((s) => `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${s}</option>`)
              .join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Likelihood (1 to 5) *</label>
          <select id="m-risk-prob" class="form-select" onchange="window.GovernanceModule.updateRiskScorePreview()">
            ${[1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${existing?.probability === v ? 'selected' : ''}>${v} - ${['Very Low', 'Low', 'Medium', 'High', 'Very High'][v - 1]}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Impact (1 to 5) *</label>
          <select id="m-risk-impact" class="form-select" onchange="window.GovernanceModule.updateRiskScorePreview()">
            ${[1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${existing?.impact === v ? 'selected' : ''}>${v} - ${['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'][v - 1]}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Calculated Severity</label>
          <div id="m-risk-calc-preview" class="form-control bg-light font-bold text-danger d-flex align-items-center justify-content-between">
            <span>Score: ${existing ? existing.score : '1'}</span>
            <span class="badge ${existing?.severity === 'Critical' ? 'bg-danger' : 'bg-secondary'}">${existing?.severity || 'Low'}</span>
          </div>
        </div>
        <div class="col-12">
          <label class="form-label font-bold text-xs text-secondary mb-1">Detailed Description</label>
          <textarea id="m-risk-desc" class="form-control" rows="2" placeholder="Root context and vulnerability exposure">${existing?.description || ''}</textarea>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Mitigation Strategy</label>
          <textarea id="m-risk-mitigation" class="form-control" rows="2" placeholder="Actions taken to reduce probability or impact">${existing?.mitigationStrategy || ''}</textarea>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Contingency Plan</label>
          <textarea id="m-risk-contingency" class="form-control" rows="2" placeholder="Fallback execution if risk materializes">${existing?.contingencyPlan || ''}</textarea>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Risk Owner</label>
          <select id="m-risk-owner" class="form-select">
            <option value="">-- Select Owner --</option>
            ${this.users.map((u) => `<option value="${u.id}" ${existing?.ownerId === u.id ? 'selected' : ''}>${u.firstName} ${u.lastName} (${u.role})</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Target Resolution Date</label>
          <input type="date" id="m-risk-date" class="form-control" value="${existing?.targetResolutionDate || ''}" />
        </div>
      </form>
    `;

    this.app.openModal(isEdit ? `Edit Risk [${existing.code}]` : 'Register New Project Risk', html, async (overlay) => {
      const title = overlay.querySelector('#m-risk-title').value.trim();
      if (!title) {
        this.app.showToast('Risk title is required', 'warning');
        return false;
      }

      const payload = {
        title,
        category: overlay.querySelector('#m-risk-category').value,
        projectId: overlay.querySelector('#m-risk-project').value || undefined,
        status: overlay.querySelector('#m-risk-status').value,
        probability: parseInt(overlay.querySelector('#m-risk-prob').value, 10),
        impact: parseInt(overlay.querySelector('#m-risk-impact').value, 10),
        description: overlay.querySelector('#m-risk-desc').value.trim(),
        mitigationStrategy: overlay.querySelector('#m-risk-mitigation').value.trim(),
        contingencyPlan: overlay.querySelector('#m-risk-contingency').value.trim(),
        ownerId: overlay.querySelector('#m-risk-owner').value || undefined,
        targetResolutionDate: overlay.querySelector('#m-risk-date').value || undefined,
      };

      try {
        if (isEdit) {
          await RiskService.updateRisk(existing.id, payload);
          this.app.showToast('Risk updated successfully', 'success');
        } else {
          await RiskService.createRisk(payload);
          this.app.showToast('New risk registered', 'success');
        }
        await this.loadData();
        this.renderTabContent();
      } catch (err) {
        this.app.showToast('Failed to save risk', 'danger');
        return false;
      }
    });
  },

  updateRiskScorePreview() {
    const prob = parseInt(document.getElementById('m-risk-prob')?.value || '1', 10);
    const impact = parseInt(document.getElementById('m-risk-impact')?.value || '1', 10);
    const score = prob * impact;
    let sev = 'Low';
    let bg = 'bg-success';
    if (score >= 15) {
      sev = 'Critical';
      bg = 'bg-danger';
    } else if (score >= 10) {
      sev = 'High';
      bg = 'bg-warning text-dark font-bold';
    } else if (score >= 5) {
      sev = 'Medium';
      bg = 'bg-primary';
    }

    const preview = document.getElementById('m-risk-calc-preview');
    if (preview) {
      preview.innerHTML = `<span>Score: ${score}</span><span class="badge ${bg}">${sev}</span>`;
    }
  },

  async openRiskDetails(riskId) {
    const risk = await RiskService.getRiskById(riskId);
    if (!risk) return;

    const html = `
      <div class="d-flex flex-column gap-3">
        <div class="p-3 bg-light rounded border">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <span class="badge bg-secondary font-monospace">${risk.code}</span>
              <h5 class="font-bold my-1">${risk.title}</h5>
              <div class="text-xs text-secondary">Owner: ${risk.ownerName || 'Unassigned'} | Category: ${risk.category} | Status: <strong>${risk.status}</strong></div>
            </div>
            <div class="text-end">
              <span class="badge ${risk.severity === 'Critical' ? 'bg-danger' : risk.severity === 'High' ? 'bg-warning text-dark' : 'bg-primary'}">${risk.severity} (${risk.score}/25)</span>
            </div>
          </div>
          <p class="text-xs mt-2 mb-0">${risk.description || 'No detailed description.'}</p>
        </div>

        <div class="row g-2 text-xs">
          <div class="col-6">
            <div class="p-2 border rounded bg-white">
              <span class="font-bold text-success"><i class="fa-solid fa-shield-check me-1"></i>Mitigation Strategy</span>
              <p class="mb-0 mt-1 text-secondary">${risk.mitigationStrategy || 'None declared.'}</p>
            </div>
          </div>
          <div class="col-6">
            <div class="p-2 border rounded bg-white">
              <span class="font-bold text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i>Contingency Plan</span>
              <p class="mb-0 mt-1 text-secondary">${risk.contingencyPlan || 'None declared.'}</p>
            </div>
          </div>
        </div>

        <!-- Linked Work Items Section (Traceability connection) -->
        <div class="border rounded p-3 bg-white">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="font-bold m-0 text-xs text-uppercase text-secondary"><i class="fa-solid fa-diagram-project me-1"></i> Linked Delivery Items</h6>
            <button class="btn-enterprise btn-enterprise-primary btn-sm py-1 px-2" style="font-size:0.75rem;" onclick="window.GovernanceModule.openLinkDialog('risk', '${risk.id}')">
              <i class="fa-solid fa-plus me-1"></i> Connect Item
            </button>
          </div>
          <div id="risk-linked-items-list" class="d-flex flex-column gap-1">
            ${(risk.linkedItems || []).length === 0 ? `<div class="text-xs text-secondary py-2 text-center">No delivery items currently associated with this risk.</div>` : ''}
            ${(risk.linkedItems || [])
              .map(
                (l) => `
              <div class="d-flex justify-content-between align-items-center p-2 rounded bg-light border text-xs">
                <div>
                  <span class="badge bg-secondary-subtle text-secondary me-1 text-uppercase">${l.targetType}</span>
                  <span class="font-bold text-primary font-monospace">${l.targetCode || l.targetId}</span>
                  <span class="ms-1">${l.targetName || ''}</span>
                </div>
                <button class="btn btn-link text-danger p-0" onclick="window.GovernanceModule.unlinkItem('risk', '${risk.id}', '${l.id}')" title="Unlink">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    this.app.openModal(`Risk Details & Traceability: [${risk.code}]`, html, () => true);
  },

  async deleteRisk(id) {
    this.app.confirmModal({
      title: 'Delete Risk',
      bodyHtml: 'Are you sure you want to remove this risk record? Connected linkages will be severed.',
      onConfirm: async () => {
        try {
          await RiskService.deleteRisk(id);
          this.app.showToast('Risk deleted', 'info');
          await this.loadData();
          this.renderTabContent();
        } catch (err) {
          this.app.showToast('Failed to delete risk', 'danger');
        }
      },
    });
  },

  // =========================================================================
  // 3. ISSUES TRACKING TAB
  // =========================================================================
  renderIssuesTab(container) {
    let filtered = this.issues;
    if (this.filterProjectId !== 'all') {
      filtered = filtered.filter((i) => i.projectId === this.filterProjectId);
    }
    if (this.searchQuery) {
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(this.searchQuery) ||
          (i.code && i.code.toLowerCase().includes(this.searchQuery)) ||
          (i.rootCause && i.rootCause.toLowerCase().includes(this.searchQuery))
      );
    }

    container.innerHTML = `
      <div class="enterprise-card" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
        <div class="table-panel-header p-3 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-3" style="background-color: var(--bg-light);">
          <div class="d-flex align-items-center gap-2">
            <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">
              <i class="fa-solid fa-circle-exclamation text-warning me-1"></i> Issue Tracker & Root Cause Registry
            </h5>
            <span class="badge bg-secondary-subtle text-secondary">${filtered.length} Issues</span>
          </div>
          <button class="btn-enterprise btn-enterprise-primary btn-sm" onclick="window.GovernanceModule.openIssueModal()">
            <i class="fa-solid fa-plus me-1"></i> Log Issue
          </button>
        </div>

        <div class="table-responsive-container">
          <table class="table-enterprise w-100" style="font-size: 0.83rem;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-color); background-color: var(--bg-main);">
                <th style="width: 100px;">Code</th>
                <th>Issue Summary</th>
                <th style="width: 100px;">Severity</th>
                <th style="width: 90px;">Priority</th>
                <th style="width: 110px;">Status</th>
                <th style="width: 120px;">Assignee</th>
                <th style="width: 130px;">Root Cause</th>
                <th style="width: 110px;">Escalation</th>
                <th style="width: 120px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `<tr><td colspan="9" class="text-center p-4 text-secondary">No issues found.</td></tr>` : ''}
              ${filtered
                .map((iss) => {
                  const sevBadge =
                    iss.severity === 'Critical'
                      ? 'bg-danger text-white'
                      : iss.severity === 'High'
                      ? 'bg-warning text-dark font-bold'
                      : 'bg-secondary-subtle text-secondary';

                  return `
                  <tr>
                    <td><span class="badge bg-light text-secondary border font-monospace font-bold">${iss.code}</span></td>
                    <td>
                      <div class="font-bold text-primary" style="cursor: pointer;" onclick="window.GovernanceModule.openIssueDetails('${iss.id}')">${iss.title}</div>
                      <div class="text-xs text-secondary text-truncate" style="max-width: 320px;">${iss.description || 'No description entered'}</div>
                    </td>
                    <td><span class="badge ${sevBadge}">${iss.severity}</span></td>
                    <td><span class="text-xs font-semibold">${iss.priority}</span></td>
                    <td><span class="badge bg-light text-dark border">${iss.status}</span></td>
                    <td><span class="text-xs">${iss.assigneeName || 'Unassigned'}</span></td>
                    <td><span class="badge bg-info-subtle text-info text-truncate" style="max-width: 120px;">${iss.rootCause || 'Unanalyzed'}</span></td>
                    <td><span class="text-xs font-semibold ${iss.escalationLevel !== 'None' ? 'text-danger' : 'text-secondary'}">${iss.escalationLevel}</span></td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn-enterprise btn-enterprise-secondary" onclick="window.GovernanceModule.openIssueDetails('${iss.id}')" title="Details & Links">
                          <i class="fa-solid fa-link"></i>
                        </button>
                        <button class="btn-enterprise btn-enterprise-secondary" onclick="window.GovernanceModule.openIssueModal('${iss.id}')" title="Edit">
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-enterprise btn-enterprise-secondary text-danger" onclick="window.GovernanceModule.deleteIssue('${iss.id}')" title="Delete">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openIssueModal(issueId = null) {
    const existing = issueId ? this.issues.find((i) => i.id === issueId) : null;
    const isEdit = !!existing;

    const html = `
      <form id="gov-issue-form" class="row g-3">
        <div class="col-md-8">
          <label class="form-label font-bold text-xs text-secondary mb-1">Issue Title *</label>
          <input type="text" id="m-issue-title" class="form-control" value="${existing?.title || ''}" required placeholder="e.g. Build pipeline failed on production container staging" />
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Severity *</label>
          <select id="m-issue-sev" class="form-select">
            ${['Critical', 'High', 'Medium', 'Low'].map((s) => `<option value="${s}" ${existing?.severity === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Priority</label>
          <select id="m-issue-prio" class="form-select">
            ${['Urgent', 'High', 'Medium', 'Low'].map((p) => `<option value="${p}" ${existing?.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Status</label>
          <select id="m-issue-status" class="form-select">
            ${['Open', 'In Progress', 'Blocked', 'Escalated', 'Resolved', 'Closed', 'Rejected']
              .map((s) => `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${s}</option>`)
              .join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Escalation Level</label>
          <select id="m-issue-esc" class="form-select">
            ${['None', 'Project Manager', 'Product Lead', 'Executive', 'Steering Committee']
              .map((e) => `<option value="${e}" ${existing?.escalationLevel === e ? 'selected' : ''}>${e}</option>`)
              .join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Associated Project</label>
          <select id="m-issue-project" class="form-select">
            <option value="">-- Unassigned / Multi-Project --</option>
            ${this.projects.map((p) => `<option value="${p.id}" ${existing?.projectId === p.id ? 'selected' : ''}>[${p.code || p.id}] ${p.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Assignee</label>
          <select id="m-issue-assignee" class="form-select">
            <option value="">-- Unassigned --</option>
            ${this.users.map((u) => `<option value="${u.id}" ${existing?.assigneeId === u.id ? 'selected' : ''}>${u.firstName} ${u.lastName} (${u.role})</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Root Cause Category</label>
          <input type="text" id="m-issue-root" class="form-control" value="${existing?.rootCause || ''}" placeholder="e.g. Memory leak, Incomplete spec, Environment drift" />
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Due / Resolution Date</label>
          <input type="date" id="m-issue-date" class="form-control" value="${existing?.dueDate || ''}" />
        </div>
        <div class="col-12">
          <label class="form-label font-bold text-xs text-secondary mb-1">Detailed Description</label>
          <textarea id="m-issue-desc" class="form-control" rows="2" placeholder="Full incident context and reproduction steps">${existing?.description || ''}</textarea>
        </div>
        <div class="col-12">
          <label class="form-label font-bold text-xs text-secondary mb-1">Resolution Summary</label>
          <textarea id="m-issue-res" class="form-control" rows="2" placeholder="Final remediation and verification notes">${existing?.resolutionNotes || ''}</textarea>
        </div>
      </form>
    `;

    this.app.openModal(isEdit ? `Edit Issue [${existing.code}]` : 'Log Delivery Issue', html, async (overlay) => {
      const title = overlay.querySelector('#m-issue-title').value.trim();
      if (!title) {
        this.app.showToast('Issue title is required', 'warning');
        return false;
      }

      const payload = {
        title,
        severity: overlay.querySelector('#m-issue-sev').value,
        priority: overlay.querySelector('#m-issue-prio').value,
        status: overlay.querySelector('#m-issue-status').value,
        escalationLevel: overlay.querySelector('#m-issue-esc').value,
        projectId: overlay.querySelector('#m-issue-project').value || undefined,
        assigneeId: overlay.querySelector('#m-issue-assignee').value || undefined,
        rootCause: overlay.querySelector('#m-issue-root').value.trim(),
        dueDate: overlay.querySelector('#m-issue-date').value || undefined,
        description: overlay.querySelector('#m-issue-desc').value.trim(),
        resolutionNotes: overlay.querySelector('#m-issue-res').value.trim(),
      };

      try {
        if (isEdit) {
          await IssueService.updateIssue(existing.id, payload);
          this.app.showToast('Issue updated', 'success');
        } else {
          await IssueService.createIssue(payload);
          this.app.showToast('Issue logged', 'success');
        }
        await this.loadData();
        this.renderTabContent();
      } catch (err) {
        this.app.showToast('Failed to save issue', 'danger');
        return false;
      }
    });
  },

  async openIssueDetails(issueId) {
    const issue = await IssueService.getIssueById(issueId);
    if (!issue) return;

    const html = `
      <div class="d-flex flex-column gap-3">
        <div class="p-3 bg-light rounded border">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <span class="badge bg-secondary font-monospace">${issue.code}</span>
              <h5 class="font-bold my-1">${issue.title}</h5>
              <div class="text-xs text-secondary">Assignee: ${issue.assigneeName || 'Unassigned'} | Severity: <strong class="text-danger">${issue.severity}</strong> | Status: <strong>${issue.status}</strong></div>
            </div>
            <span class="badge bg-warning text-dark font-bold">${issue.priority} Priority</span>
          </div>
          <p class="text-xs mt-2 mb-0">${issue.description || 'No description provided.'}</p>
        </div>

        <div class="p-2 border rounded bg-white text-xs">
          <span class="font-bold text-info"><i class="fa-solid fa-magnifying-glass me-1"></i>Root Cause Analysis:</span>
          <p class="mb-0 mt-1 text-secondary">${issue.rootCause || 'Root cause not yet cataloged.'}</p>
        </div>

        <!-- Connected Work Items -->
        <div class="border rounded p-3 bg-white">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="font-bold m-0 text-xs text-uppercase text-secondary"><i class="fa-solid fa-folder-tree me-1"></i> Blocked Delivery Items</h6>
            <button class="btn-enterprise btn-enterprise-primary btn-sm py-1 px-2" style="font-size:0.75rem;" onclick="window.GovernanceModule.openLinkDialog('issue', '${issue.id}')">
              <i class="fa-solid fa-plus me-1"></i> Connect Item
            </button>
          </div>
          <div class="d-flex flex-column gap-1">
            ${(issue.linkedItems || []).length === 0 ? `<div class="text-xs text-secondary py-2 text-center">No delivery items currently connected to this issue.</div>` : ''}
            ${(issue.linkedItems || [])
              .map(
                (l) => `
              <div class="d-flex justify-content-between align-items-center p-2 rounded bg-light border text-xs">
                <div>
                  <span class="badge bg-secondary-subtle text-secondary me-1 text-uppercase">${l.targetType}</span>
                  <span class="font-bold text-primary font-monospace">${l.targetCode || l.targetId}</span>
                  <span class="ms-1">${l.targetName || ''}</span>
                </div>
                <button class="btn btn-link text-danger p-0" onclick="window.GovernanceModule.unlinkItem('issue', '${issue.id}', '${l.id}')" title="Unlink">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    this.app.openModal(`Issue Detail: [${issue.code}]`, html, () => true);
  },

  async deleteIssue(id) {
    this.app.confirmModal({
      title: 'Delete Issue',
      bodyHtml: 'Are you sure you want to remove this issue record?',
      onConfirm: async () => {
        try {
          await IssueService.deleteIssue(id);
          this.app.showToast('Issue deleted', 'info');
          await this.loadData();
          this.renderTabContent();
        } catch (err) {
          this.app.showToast('Failed to delete issue', 'danger');
        }
      },
    });
  },

  // =========================================================================
  // 4. DEPENDENCIES & GRAPH TAB
  // =========================================================================
  renderDependenciesTab(container) {
    const deps = this.dependencies;

    container.innerHTML = `
      <div class="enterprise-card mb-4" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
        <div class="p-3 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2" style="background-color: var(--bg-light);">
          <div class="d-flex align-items-center gap-2">
            <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">
              <i class="fa-solid fa-diagram-next text-primary me-1"></i> Dependency Network & Interactive Graph
            </h5>
            <span class="badge bg-secondary-subtle text-secondary">${deps.length} Dependencies</span>
          </div>
          <button class="btn-enterprise btn-enterprise-primary btn-sm" onclick="window.GovernanceModule.openDependencyModal()">
            <i class="fa-solid fa-plus me-1"></i> Declare Dependency
          </button>
        </div>

        <!-- Dependency Graph Canvas Area -->
        <div class="p-3">
          <div class="border rounded bg-light p-3 position-relative" style="min-height: 260px; overflow-x: auto;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="text-xs font-bold text-secondary text-uppercase"><i class="fa-solid fa-bezier-curve me-1"></i> Directed Relationship Visualizer</span>
              <span class="text-xs text-secondary">Cycle-detection validated</span>
            </div>
            ${this.renderDependencySvgGraph(deps)}
          </div>
        </div>
      </div>

      <!-- Dependency Ledger Table -->
      <div class="enterprise-card" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
        <div class="table-panel-header p-3 border-bottom d-flex justify-content-between align-items-center" style="background-color: var(--bg-light);">
          <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">Dependency Register</h5>
          <span class="text-xs text-secondary">Predecessor &rarr; Successor Relationships</span>
        </div>
        <div class="table-responsive-container">
          <table class="table-enterprise w-100" style="font-size: 0.83rem;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-color); background-color: var(--bg-main);">
                <th style="width: 100px;">Code</th>
                <th>Source Item (Predecessor)</th>
                <th style="width: 110px; text-align: center;">Relation</th>
                <th>Target Item (Successor)</th>
                <th style="width: 110px;">Status</th>
                <th style="width: 100px; text-align: center;">Critical Path</th>
                <th style="width: 110px;">Due Date</th>
                <th style="width: 110px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${deps.length === 0 ? `<tr><td colspan="8" class="text-center p-4 text-secondary">No dependencies logged yet.</td></tr>` : ''}
              ${deps
                .map(
                  (d) => `
                <tr>
                  <td><span class="badge bg-light text-secondary border font-monospace">${d.code}</span></td>
                  <td>
                    <span class="badge bg-secondary-subtle text-secondary me-1 text-uppercase">${d.sourceEntityType}</span>
                    <strong class="text-primary font-monospace">${d.sourceEntityCode}</strong>
                    <div class="text-xs text-secondary text-truncate" style="max-width: 200px;">${d.sourceEntityName}</div>
                  </td>
                  <td class="text-center">
                    <span class="badge ${d.dependencyType === 'Blocks' ? 'bg-danger' : d.dependencyType === 'Requires' ? 'bg-primary' : 'bg-secondary'}">${d.dependencyType}</span>
                    <div style="font-size: 0.68rem;" class="text-secondary mt-1">&rarr;</div>
                  </td>
                  <td>
                    <span class="badge bg-secondary-subtle text-secondary me-1 text-uppercase">${d.targetEntityType}</span>
                    <strong class="text-primary font-monospace">${d.targetEntityCode}</strong>
                    <div class="text-xs text-secondary text-truncate" style="max-width: 200px;">${d.targetEntityName}</div>
                  </td>
                  <td>
                    <span class="badge ${d.status === 'Resolved' ? 'bg-success' : d.status === 'At Risk' ? 'bg-warning text-dark' : 'bg-light text-dark border'}">${d.status}</span>
                  </td>
                  <td class="text-center">
                    ${d.isCriticalPath ? '<span class="badge bg-danger-subtle text-danger font-bold">YES</span>' : '<span class="text-secondary">No</span>'}
                  </td>
                  <td>
                    <span class="text-xs ${d.isOverdue ? 'text-danger font-bold' : ''}">${d.dueDate || 'Open'} ${d.isOverdue ? '(Overdue)' : ''}</span>
                  </td>
                  <td class="text-end">
                    <div class="btn-group btn-group-sm">
                      <button class="btn-enterprise btn-enterprise-secondary" onclick="window.GovernanceModule.openDependencyModal('${d.id}')" title="Edit">
                        <i class="fa-solid fa-pen-to-square"></i>
                      </button>
                      <button class="btn-enterprise btn-enterprise-secondary text-danger" onclick="window.GovernanceModule.deleteDependency('${d.id}')" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </div>
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
  },

  renderDependencySvgGraph(deps) {
    if (!deps || deps.length === 0) {
      return `<div class="text-center py-4 text-secondary text-xs">No active dependency edges to draw.</div>`;
    }

    // Build unique nodes
    const nodeMap = new Map();
    deps.forEach((d) => {
      if (!nodeMap.has(d.sourceEntityId)) {
        nodeMap.set(d.sourceEntityId, {
          id: d.sourceEntityId,
          code: d.sourceEntityCode,
          name: d.sourceEntityName,
          type: d.sourceEntityType,
        });
      }
      if (!nodeMap.has(d.targetEntityId)) {
        nodeMap.set(d.targetEntityId, {
          id: d.targetEntityId,
          code: d.targetEntityCode,
          name: d.targetEntityName,
          type: d.targetEntityType,
        });
      }
    });

    const nodes = Array.from(nodeMap.values());
    const width = Math.max(700, nodes.length * 150);
    const height = 240;

    // Layout nodes across horizontal layers
    const nodePositions = new Map();
    nodes.forEach((n, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const x = 60 + col * 170;
      const y = 50 + row * 85;
      nodePositions.set(n.id, { x, y });
    });

    let edgesSvg = '';
    deps.forEach((d) => {
      const srcPos = nodePositions.get(d.sourceEntityId);
      const tgtPos = nodePositions.get(d.targetEntityId);
      if (srcPos && tgtPos) {
        const isBlock = d.dependencyType === 'Blocks';
        const color = isBlock ? '#ef4444' : '#4f46e5';
        const strokeDash = d.status === 'Resolved' ? '4,4' : 'none';
        edgesSvg += `
          <line x1="${srcPos.x + 60}" y1="${srcPos.y + 15}" x2="${tgtPos.x}" y2="${tgtPos.y + 15}" 
                stroke="${color}" stroke-width="2" stroke-dasharray="${strokeDash}" marker-end="url(#arrow-${isBlock ? 'red' : 'blue'})" />
        `;
      }
    });

    let nodesSvg = '';
    nodes.forEach((n) => {
      const pos = nodePositions.get(n.id);
      if (pos) {
        nodesSvg += `
          <g transform="translate(${pos.x}, ${pos.y})" style="cursor: pointer;" onclick="window.GovernanceModule.inspectEntity('${n.type}', '${n.id}')">
            <rect width="130" height="42" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />
            <text x="8" y="18" font-size="10" font-weight="bold" fill="#1e293b">${n.code}</text>
            <text x="8" y="32" font-size="9" fill="#64748b">${(n.name || '').substring(0, 18)}</text>
          </g>
        `;
      }
    });

    return `
      <svg width="${width}" height="${height}" style="background-color: var(--bg-card); border-radius: 6px;">
        <defs>
          <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#ef4444" />
          </marker>
          <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#4f46e5" />
          </marker>
        </defs>
        ${edgesSvg}
        ${nodesSvg}
      </svg>
    `;
  },

  inspectEntity(type, id) {
    this.selectedTrace = { type, id };
    this.switchTab('traceability');
  },

  openDependencyModal(depId = null) {
    const existing = depId ? this.dependencies.find((d) => d.id === depId) : null;
    const isEdit = !!existing;

    // Available options from projects and delivery items
    const options = [
      ...this.projects.map((p) => ({ type: 'project', id: p.id, code: p.code || p.id, name: p.name })),
      ...this.deliveryItems.map((i) => ({ type: i.type, id: i.id, code: i.code || i.id, name: i.title || i.name })),
    ];

    const html = `
      <form id="gov-dep-form" class="row g-3">
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Source Item (Predecessor) *</label>
          <select id="m-dep-source" class="form-select" required>
            ${options.map((o) => `<option value="${o.type}|${o.id}|${o.code}|${o.name}" ${existing?.sourceEntityId === o.id ? 'selected' : ''}>[${o.type.toUpperCase()}] ${o.code} - ${o.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Target Item (Successor) *</label>
          <select id="m-dep-target" class="form-select" required>
            ${options.map((o) => `<option value="${o.type}|${o.id}|${o.code}|${o.name}" ${existing?.targetEntityId === o.id ? 'selected' : ''}>[${o.type.toUpperCase()}] ${o.code} - ${o.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Relationship Type</label>
          <select id="m-dep-type" class="form-select">
            <option value="Blocks" ${existing?.dependencyType === 'Blocks' ? 'selected' : ''}>Blocks</option>
            <option value="Requires" ${existing?.dependencyType === 'Requires' ? 'selected' : ''}>Requires</option>
            <option value="RelatesTo" ${existing?.dependencyType === 'RelatesTo' ? 'selected' : ''}>Relates To</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Status</label>
          <select id="m-dep-status" class="form-select">
            <option value="Identified" ${existing?.status === 'Identified' ? 'selected' : ''}>Identified</option>
            <option value="Active" ${existing?.status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="At Risk" ${existing?.status === 'At Risk' ? 'selected' : ''}>At Risk</option>
            <option value="Resolved" ${existing?.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Critical Path</label>
          <select id="m-dep-crit" class="form-select">
            <option value="false" ${!existing?.isCriticalPath ? 'selected' : ''}>No</option>
            <option value="true" ${existing?.isCriticalPath ? 'selected' : ''}>Yes (Critical Path)</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Lag Days</label>
          <input type="number" id="m-dep-lag" class="form-control" value="${existing?.lagDays || 0}" />
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Target Resolution Date</label>
          <input type="date" id="m-dep-due" class="form-control" value="${existing?.dueDate || ''}" />
        </div>
        <div class="col-12">
          <label class="form-label font-bold text-xs text-secondary mb-1">Description / Constraint Notes</label>
          <textarea id="m-dep-desc" class="form-control" rows="2" placeholder="Detail the dependency constraint or API contract requirement">${existing?.description || ''}</textarea>
        </div>
      </form>
    `;

    this.app.openModal(isEdit ? `Edit Dependency [${existing.code}]` : 'Declare Dependency', html, async (overlay) => {
      const srcVal = overlay.querySelector('#m-dep-source').value.split('|');
      const tgtVal = overlay.querySelector('#m-dep-target').value.split('|');

      if (srcVal[1] === tgtVal[1]) {
        this.app.showToast('An item cannot depend on itself!', 'warning');
        return false;
      }

      const payload = {
        sourceEntityType: srcVal[0],
        sourceEntityId: srcVal[1],
        sourceEntityCode: srcVal[2],
        sourceEntityName: srcVal[3],
        targetEntityType: tgtVal[0],
        targetEntityId: tgtVal[1],
        targetEntityCode: tgtVal[2],
        targetEntityName: tgtVal[3],
        dependencyType: overlay.querySelector('#m-dep-type').value,
        status: overlay.querySelector('#m-dep-status').value,
        isCriticalPath: overlay.querySelector('#m-dep-crit').value === 'true',
        lagDays: parseInt(overlay.querySelector('#m-dep-lag').value, 10) || 0,
        dueDate: overlay.querySelector('#m-dep-due').value || undefined,
        description: overlay.querySelector('#m-dep-desc').value.trim(),
      };

      try {
        if (isEdit) {
          await DependencyService.updateDependency(existing.id, payload);
          this.app.showToast('Dependency updated', 'success');
        } else {
          const res = await DependencyService.createDependency(payload);
          if (res?.error) {
            this.app.showToast(res.error, 'danger');
            return false;
          }
          this.app.showToast('Dependency registered', 'success');
        }
        await this.loadData();
        this.renderTabContent();
      } catch (err) {
        this.app.showToast(err.message || 'Failed to save dependency (check for circular dependencies)', 'danger');
        return false;
      }
    });
  },

  async deleteDependency(id) {
    this.app.confirmModal({
      title: 'Delete Dependency',
      bodyHtml: 'Are you sure you want to remove this dependency relationship?',
      onConfirm: async () => {
        try {
          await DependencyService.deleteDependency(id);
          this.app.showToast('Dependency removed', 'info');
          await this.loadData();
          this.renderTabContent();
        } catch (err) {
          this.app.showToast('Failed to delete dependency', 'danger');
        }
      },
    });
  },

  // =========================================================================
  // 5. MILESTONES TAB
  // =========================================================================
  renderMilestonesTab(container) {
    let filtered = this.milestones;
    if (this.filterProjectId !== 'all') {
      filtered = filtered.filter((m) => m.projectId === this.filterProjectId);
    }
    if (this.searchQuery) {
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(this.searchQuery) ||
          (m.code && m.code.toLowerCase().includes(this.searchQuery))
      );
    }

    container.innerHTML = `
      <div class="enterprise-card" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
        <div class="table-panel-header p-3 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-3" style="background-color: var(--bg-light);">
          <div class="d-flex align-items-center gap-2">
            <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">
              <i class="fa-solid fa-flag-checkered text-success me-1"></i> Delivery Milestones
            </h5>
            <span class="badge bg-secondary-subtle text-secondary">${filtered.length} Milestones</span>
          </div>
          <button class="btn-enterprise btn-enterprise-primary btn-sm" onclick="window.GovernanceModule.openMilestoneModal()">
            <i class="fa-solid fa-plus me-1"></i> Create Milestone
          </button>
        </div>

        <div class="table-responsive-container">
          <table class="table-enterprise w-100" style="font-size: 0.83rem;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-color); background-color: var(--bg-main);">
                <th style="width: 100px;">Code</th>
                <th>Milestone Name & Criteria</th>
                <th style="width: 110px;">Type</th>
                <th style="width: 110px;">Target Date</th>
                <th style="width: 130px;">Progress</th>
                <th style="width: 100px;">Health</th>
                <th style="width: 110px;">Status</th>
                <th style="width: 120px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `<tr><td colspan="8" class="text-center p-4 text-secondary">No milestones recorded.</td></tr>` : ''}
              ${filtered
                .map((m) => {
                  const healthBadge =
                    m.health === 'Critical'
                      ? 'bg-danger text-white'
                      : m.health === 'At Risk'
                      ? 'bg-warning text-dark font-bold'
                      : 'bg-success text-white';

                  return `
                  <tr>
                    <td><span class="badge bg-light text-secondary border font-monospace font-bold">${m.code}</span></td>
                    <td>
                      <div class="font-bold text-primary" style="cursor: pointer;" onclick="window.GovernanceModule.openMilestoneDetails('${m.id}')">${m.name}</div>
                      <div class="text-xs text-secondary text-truncate" style="max-width: 320px;">${m.description || 'No criteria provided'}</div>
                    </td>
                    <td><span class="badge bg-secondary-subtle text-secondary">${m.type}</span></td>
                    <td><span class="text-xs font-semibold">${m.targetDate}</span></td>
                    <td>
                      <div class="d-flex align-items-center gap-2">
                        <div class="progress flex-grow-1" style="height: 6px;">
                          <div class="progress-bar bg-success" style="width: ${m.progress || 0}%;"></div>
                        </div>
                        <span class="text-xs font-bold">${m.progress || 0}%</span>
                      </div>
                    </td>
                    <td><span class="badge ${healthBadge}">${m.health}</span></td>
                    <td><span class="badge bg-light text-dark border">${m.status}</span></td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn-enterprise btn-enterprise-secondary" onclick="window.GovernanceModule.openMilestoneDetails('${m.id}')" title="Details & Scope">
                          <i class="fa-solid fa-link"></i>
                        </button>
                        <button class="btn-enterprise btn-enterprise-secondary" onclick="window.GovernanceModule.openMilestoneModal('${m.id}')" title="Edit">
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-enterprise btn-enterprise-secondary text-danger" onclick="window.GovernanceModule.deleteMilestone('${m.id}')" title="Delete">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openMilestoneModal(mlsId = null) {
    const existing = mlsId ? this.milestones.find((m) => m.id === mlsId) : null;
    const isEdit = !!existing;

    const html = `
      <form id="gov-mls-form" class="row g-3">
        <div class="col-md-8">
          <label class="form-label font-bold text-xs text-secondary mb-1">Milestone Name *</label>
          <input type="text" id="m-mls-name" class="form-control" value="${existing?.name || ''}" required placeholder="e.g. Beta Customer Pilot Kickoff" />
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Milestone Type</label>
          <select id="m-mls-type" class="form-select">
            ${['Contractual', 'Deliverable', 'Review', 'Regulatory', 'Internal']
              .map((t) => `<option value="${t}" ${existing?.type === t ? 'selected' : ''}>${t}</option>`)
              .join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Associated Project</label>
          <select id="m-mls-project" class="form-select">
            <option value="">-- Unassigned --</option>
            ${this.projects.map((p) => `<option value="${p.id}" ${existing?.projectId === p.id ? 'selected' : ''}>[${p.code || p.id}] ${p.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Target Date *</label>
          <input type="date" id="m-mls-date" class="form-control" value="${existing?.targetDate || ''}" required />
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Status</label>
          <select id="m-mls-status" class="form-select">
            ${['Planned', 'In Progress', 'Completed', 'Cancelled']
              .map((s) => `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${s}</option>`)
              .join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Health Override</label>
          <select id="m-mls-health" class="form-select">
            ${['On Track', 'At Risk', 'Critical']
              .map((h) => `<option value="${h}" ${existing?.health === h ? 'selected' : ''}>${h}</option>`)
              .join('')}
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Progress (%)</label>
          <input type="number" id="m-mls-progress" class="form-control" min="0" max="100" value="${existing?.progress || 0}" />
        </div>
        <div class="col-12">
          <label class="form-label font-bold text-xs text-secondary mb-1">Completion Criteria & Notes</label>
          <textarea id="m-mls-desc" class="form-control" rows="2" placeholder="Define acceptance criteria for sign-off">${existing?.description || ''}</textarea>
        </div>
      </form>
    `;

    this.app.openModal(isEdit ? `Edit Milestone [${existing.code}]` : 'Create New Milestone', html, async (overlay) => {
      const name = overlay.querySelector('#m-mls-name').value.trim();
      const targetDate = overlay.querySelector('#m-mls-date').value;
      if (!name || !targetDate) {
        this.app.showToast('Milestone name and target date are required', 'warning');
        return false;
      }

      const payload = {
        name,
        targetDate,
        type: overlay.querySelector('#m-mls-type').value,
        projectId: overlay.querySelector('#m-mls-project').value || undefined,
        status: overlay.querySelector('#m-mls-status').value,
        health: overlay.querySelector('#m-mls-health').value,
        progress: parseInt(overlay.querySelector('#m-mls-progress').value, 10) || 0,
        description: overlay.querySelector('#m-mls-desc').value.trim(),
      };

      try {
        if (isEdit) {
          await MilestoneService.updateMilestone(existing.id, payload);
          this.app.showToast('Milestone updated', 'success');
        } else {
          await MilestoneService.createMilestone(payload);
          this.app.showToast('Milestone created', 'success');
        }
        await this.loadData();
        this.renderTabContent();
      } catch (err) {
        this.app.showToast('Failed to save milestone', 'danger');
        return false;
      }
    });
  },

  async openMilestoneDetails(mlsId) {
    const mls = await MilestoneService.getMilestoneById(mlsId);
    if (!mls) return;

    const html = `
      <div class="d-flex flex-column gap-3">
        <div class="p-3 bg-light rounded border">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <span class="badge bg-secondary font-monospace">${mls.code}</span>
              <h5 class="font-bold my-1">${mls.name}</h5>
              <div class="text-xs text-secondary">Target: <strong>${mls.targetDate}</strong> | Type: ${mls.type} | Progress: <strong>${mls.progress}%</strong></div>
            </div>
            <span class="badge ${mls.health === 'Critical' ? 'bg-danger' : mls.health === 'At Risk' ? 'bg-warning text-dark' : 'bg-success'}">${mls.health}</span>
          </div>
          <p class="text-xs mt-2 mb-0">${mls.description || 'No criteria provided.'}</p>
        </div>

        <!-- Linked Work Items Deliverables -->
        <div class="border rounded p-3 bg-white">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="font-bold m-0 text-xs text-uppercase text-secondary"><i class="fa-solid fa-list-check me-1"></i> Linked Deliverables (Stories / Features / Tasks)</h6>
            <button class="btn-enterprise btn-enterprise-primary btn-sm py-1 px-2" style="font-size:0.75rem;" onclick="window.GovernanceModule.openLinkDialog('milestone', '${mls.id}')">
              <i class="fa-solid fa-plus me-1"></i> Attach Deliverable
            </button>
          </div>
          <div class="d-flex flex-column gap-1">
            ${(mls.linkedItems || []).length === 0 ? `<div class="text-xs text-secondary py-2 text-center">No deliverable items linked to this milestone yet.</div>` : ''}
            ${(mls.linkedItems || [])
              .map(
                (l) => `
              <div class="d-flex justify-content-between align-items-center p-2 rounded bg-light border text-xs">
                <div>
                  <span class="badge bg-secondary-subtle text-secondary me-1 text-uppercase">${l.targetType}</span>
                  <span class="font-bold text-primary font-monospace">${l.targetCode || l.targetId}</span>
                  <span class="ms-1">${l.targetName || ''}</span>
                </div>
                <button class="btn btn-link text-danger p-0" onclick="window.GovernanceModule.unlinkItem('milestone', '${mls.id}', '${l.id}')" title="Unlink">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    this.app.openModal(`Milestone Detail: [${mls.code}]`, html, () => true);
  },

  async deleteMilestone(id) {
    this.app.confirmModal({
      title: 'Delete Milestone',
      bodyHtml: 'Are you sure you want to remove this milestone record?',
      onConfirm: async () => {
        try {
          await MilestoneService.deleteMilestone(id);
          this.app.showToast('Milestone deleted', 'info');
          await this.loadData();
          this.renderTabContent();
        } catch (err) {
          this.app.showToast('Failed to delete milestone', 'danger');
        }
      },
    });
  },

  // =========================================================================
  // 6. RELEASES TAB
  // =========================================================================
  renderReleasesTab(container) {
    let filtered = this.releases;
    if (this.filterProjectId !== 'all') {
      filtered = filtered.filter((r) => r.projectId === this.filterProjectId);
    }
    if (this.searchQuery) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(this.searchQuery) ||
          r.version.toLowerCase().includes(this.searchQuery) ||
          (r.code && r.code.toLowerCase().includes(this.searchQuery))
      );
    }

    container.innerHTML = `
      <div class="enterprise-card" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
        <div class="table-panel-header p-3 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-3" style="background-color: var(--bg-light);">
          <div class="d-flex align-items-center gap-2">
            <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">
              <i class="fa-solid fa-rocket text-info me-1"></i> Release Pipeline & Scope Management
            </h5>
            <span class="badge bg-secondary-subtle text-secondary">${filtered.length} Releases</span>
          </div>
          <button class="btn-enterprise btn-enterprise-primary btn-sm" onclick="window.GovernanceModule.openReleaseModal()">
            <i class="fa-solid fa-plus me-1"></i> Plan Release
          </button>
        </div>

        <div class="table-responsive-container">
          <table class="table-enterprise w-100" style="font-size: 0.83rem;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-color); background-color: var(--bg-main);">
                <th style="width: 100px;">Code</th>
                <th>Release Name & Version</th>
                <th style="width: 110px;">Target Date</th>
                <th style="width: 120px;">Health</th>
                <th style="width: 120px;">Status</th>
                <th style="width: 130px; text-align: center;">Scope Items</th>
                <th style="width: 120px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `<tr><td colspan="7" class="text-center p-4 text-secondary">No planned releases found.</td></tr>` : ''}
              ${filtered
                .map((rel) => {
                  const healthBadge =
                    rel.health === 'Off Track'
                      ? 'bg-danger text-white'
                      : rel.health === 'At Risk'
                      ? 'bg-warning text-dark font-bold'
                      : 'bg-success text-white';

                  const itemCount = (rel.items || []).length;

                  return `
                  <tr>
                    <td><span class="badge bg-light text-secondary border font-monospace font-bold">${rel.code}</span></td>
                    <td>
                      <div class="font-bold text-primary" style="cursor: pointer;" onclick="window.GovernanceModule.openReleaseDetails('${rel.id}')">
                        ${rel.name} <span class="badge bg-secondary font-monospace">${rel.version}</span>
                      </div>
                      <div class="text-xs text-secondary text-truncate" style="max-width: 320px;">${rel.description || 'No release notes'}</div>
                    </td>
                    <td><span class="text-xs font-semibold">${rel.releaseDate}</span></td>
                    <td><span class="badge ${healthBadge}">${rel.health}</span></td>
                    <td><span class="badge bg-light text-dark border">${rel.status}</span></td>
                    <td class="text-center">
                      <span class="badge bg-info-subtle text-info font-bold">${itemCount} Deliverables</span>
                    </td>
                    <td class="text-end">
                      <div class="btn-group btn-group-sm">
                        <button class="btn-enterprise btn-enterprise-secondary" onclick="window.GovernanceModule.openReleaseDetails('${rel.id}')" title="Manage Scope">
                          <i class="fa-solid fa-list-check"></i>
                        </button>
                        <button class="btn-enterprise btn-enterprise-secondary" onclick="window.GovernanceModule.openReleaseModal('${rel.id}')" title="Edit">
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-enterprise btn-enterprise-secondary text-danger" onclick="window.GovernanceModule.deleteRelease('${rel.id}')" title="Delete">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openReleaseModal(relId = null) {
    const existing = relId ? this.releases.find((r) => r.id === relId) : null;
    const isEdit = !!existing;

    const html = `
      <form id="gov-rel-form" class="row g-3">
        <div class="col-md-8">
          <label class="form-label font-bold text-xs text-secondary mb-1">Release Name *</label>
          <input type="text" id="m-rel-name" class="form-control" value="${existing?.name || ''}" required placeholder="e.g. Q3 Commercial Hardening Release" />
        </div>
        <div class="col-md-4">
          <label class="form-label font-bold text-xs text-secondary mb-1">Version String *</label>
          <input type="text" id="m-rel-ver" class="form-control font-monospace" value="${existing?.version || 'v2.1.0'}" required placeholder="vX.Y.Z" />
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Associated Project</label>
          <select id="m-rel-project" class="form-select">
            <option value="">-- Multi-Project / Portfolio --</option>
            ${this.projects.map((p) => `<option value="${p.id}" ${existing?.projectId === p.id ? 'selected' : ''}>[${p.code || p.id}] ${p.name}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Target Release Date *</label>
          <input type="date" id="m-rel-date" class="form-control" value="${existing?.releaseDate || ''}" required />
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Status</label>
          <select id="m-rel-status" class="form-select">
            ${['Planning', 'In Progress', 'Code Freeze', 'Released', 'Cancelled']
              .map((s) => `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${s}</option>`)
              .join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-bold text-xs text-secondary mb-1">Health</label>
          <select id="m-rel-health" class="form-select">
            ${['On Track', 'At Risk', 'Off Track']
              .map((h) => `<option value="${h}" ${existing?.health === h ? 'selected' : ''}>${h}</option>`)
              .join('')}
          </select>
        </div>
        <div class="col-12">
          <label class="form-label font-bold text-xs text-secondary mb-1">Release Scope & Deployment Notes</label>
          <textarea id="m-rel-desc" class="form-control" rows="2" placeholder="Summary of epics, features, and deployment targets">${existing?.description || ''}</textarea>
        </div>
      </form>
    `;

    this.app.openModal(isEdit ? `Edit Release [${existing.code}]` : 'Plan New Release', html, async (overlay) => {
      const name = overlay.querySelector('#m-rel-name').value.trim();
      const version = overlay.querySelector('#m-rel-ver').value.trim();
      const releaseDate = overlay.querySelector('#m-rel-date').value;
      if (!name || !version || !releaseDate) {
        this.app.showToast('Name, version, and date are required', 'warning');
        return false;
      }

      const payload = {
        name,
        version,
        releaseDate,
        projectId: overlay.querySelector('#m-rel-project').value || undefined,
        status: overlay.querySelector('#m-rel-status').value,
        health: overlay.querySelector('#m-rel-health').value,
        description: overlay.querySelector('#m-rel-desc').value.trim(),
      };

      try {
        if (isEdit) {
          await ReleaseService.updateRelease(existing.id, payload);
          this.app.showToast('Release updated', 'success');
        } else {
          await ReleaseService.createRelease(payload);
          this.app.showToast('Release planned', 'success');
        }
        await this.loadData();
        this.renderTabContent();
      } catch (err) {
        this.app.showToast('Failed to save release', 'danger');
        return false;
      }
    });
  },

  async openReleaseDetails(relId) {
    const rel = await ReleaseService.getReleaseById(relId);
    if (!rel) return;

    const items = rel.items || [];
    const avgProgress = items.length > 0 ? Math.round(items.reduce((sum, i) => sum + (i.progress || 0), 0) / items.length) : 0;

    const html = `
      <div class="d-flex flex-column gap-3">
        <div class="p-3 bg-light rounded border">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <span class="badge bg-secondary font-monospace">${rel.code}</span>
              <h5 class="font-bold my-1">${rel.name} <span class="badge bg-primary font-monospace">${rel.version}</span></h5>
              <div class="text-xs text-secondary">Target Date: <strong>${rel.releaseDate}</strong> | Status: <strong>${rel.status}</strong></div>
            </div>
            <span class="badge ${rel.health === 'Off Track' ? 'bg-danger' : rel.health === 'At Risk' ? 'bg-warning text-dark' : 'bg-success'}">${rel.health}</span>
          </div>
          <div class="d-flex align-items-center gap-2 mt-2">
            <span class="text-xs font-bold text-secondary">Release Completion:</span>
            <div class="progress flex-grow-1" style="height: 6px;">
              <div class="progress-bar bg-success" style="width: ${avgProgress}%;"></div>
            </div>
            <span class="text-xs font-bold">${avgProgress}%</span>
          </div>
        </div>

        <!-- Release Scope Items Manager -->
        <div class="border rounded p-3 bg-white">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="font-bold m-0 text-xs text-uppercase text-secondary"><i class="fa-solid fa-box-archive me-1"></i> Release Scope Deliverables</h6>
            <button class="btn-enterprise btn-enterprise-primary btn-sm py-1 px-2" style="font-size:0.75rem;" onclick="window.GovernanceModule.openAddReleaseItemDialog('${rel.id}')">
              <i class="fa-solid fa-plus me-1"></i> Add Deliverable to Release
            </button>
          </div>
          <div class="d-flex flex-column gap-1">
            ${items.length === 0 ? `<div class="text-xs text-secondary py-2 text-center">No deliverable items assigned to this release version yet.</div>` : ''}
            ${items
              .map(
                (item) => `
              <div class="d-flex justify-content-between align-items-center p-2 rounded bg-light border text-xs">
                <div>
                  <span class="badge bg-secondary-subtle text-secondary me-1 text-uppercase">${item.itemType}</span>
                  <span class="font-bold text-primary font-monospace">${item.itemCode || item.itemId}</span>
                  <span class="ms-1 font-semibold">${item.itemTitle || ''}</span>
                  <span class="ms-2 badge bg-light text-dark border">${item.status || 'Active'}</span>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span class="font-bold">${item.progress || 0}%</span>
                  <button class="btn btn-link text-danger p-0" onclick="window.GovernanceModule.removeReleaseItem('${rel.id}', '${item.id}')" title="Remove from Scope">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    this.app.openModal(`Release Scope & Readiness: [${rel.code}]`, html, () => true);
  },

  openAddReleaseItemDialog(releaseId) {
    const options = [
      ...this.deliveryItems.map((i) => ({ type: i.type, id: i.id, code: i.code || i.id, title: i.title || i.name, status: i.status, progress: i.progress })),
      ...this.milestones.map((m) => ({ type: 'milestone', id: m.id, code: m.code, title: m.name, status: m.status, progress: m.progress })),
    ];

    const html = `
      <div class="p-2">
        <label class="form-label font-bold text-xs text-secondary mb-1">Select Deliverable Item to Include in Release Scope</label>
        <select id="m-add-rel-item" class="form-select">
          ${options.map((o) => `<option value="${o.type}|${o.id}|${o.code}|${o.title}|${o.status || 'In Progress'}|${o.progress || 0}">[${o.type.toUpperCase()}] ${o.code} - ${o.title}</option>`).join('')}
        </select>
      </div>
    `;

    this.app.openModal('Add Deliverable to Release Scope', html, async (overlay) => {
      const parts = overlay.querySelector('#m-add-rel-item').value.split('|');
      try {
        await ReleaseService.addItem(releaseId, parts[0], parts[1], parts[2], parts[3], parts[4], parseInt(parts[5], 10) || 0);
        this.app.showToast('Item attached to release scope', 'success');
        await this.loadData();
        this.openReleaseDetails(releaseId);
      } catch (err) {
        this.app.showToast('Failed to attach item', 'danger');
      }
    });
  },

  async removeReleaseItem(releaseId, itemId) {
    try {
      await ReleaseService.removeItem(releaseId, itemId);
      this.app.showToast('Item removed from release scope', 'info');
      await this.loadData();
      this.openReleaseDetails(releaseId);
    } catch (err) {
      this.app.showToast('Failed to remove item', 'danger');
    }
  },

  async deleteRelease(id) {
    this.app.confirmModal({
      title: 'Delete Release',
      bodyHtml: 'Are you sure you want to remove this release record?',
      onConfirm: async () => {
        try {
          await ReleaseService.deleteRelease(id);
          this.app.showToast('Release deleted', 'info');
          await this.loadData();
          this.renderTabContent();
        } catch (err) {
          this.app.showToast('Failed to delete release', 'danger');
        }
      },
    });
  },

  // =========================================================================
  // 7. TRACEABILITY INSPECTOR TAB (EXTENDED FOR GOVERNANCE)
  // =========================================================================
  renderTraceabilityTab(container) {
    const selected = this.selectedTrace;

    container.innerHTML = `
      <div class="enterprise-card mb-4" style="background-color: var(--bg-card); border: 1px solid var(--border-color);">
        <div class="p-3 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2" style="background-color: var(--bg-light);">
          <div>
            <h5 class="card-title-clean font-bold m-0" style="font-size: 0.92rem;">
              <i class="fa-solid fa-arrows-split-up-and-left text-primary me-1"></i> 360&deg; End-to-End Governance & Delivery Traceability
            </h5>
            <div class="text-xs text-secondary">Traverse from Portfolios and OKRs through Epics, Features, Stories, Tasks and their connected Risks, Issues & Dependencies</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <select id="trace-select-item" class="form-select form-select-sm" style="min-width: 260px;" onchange="window.GovernanceModule.handleTraceSelection(this.value)">
              <option value="">-- Choose Item to Trace --</option>
              <optgroup label="Projects">
                ${this.projects.map((p) => `<option value="project|${p.id}" ${selected?.type === 'project' && selected?.id === p.id ? 'selected' : ''}>[Project] ${p.code || p.id} - ${p.name}</option>`).join('')}
              </optgroup>
              <optgroup label="Risks">
                ${this.risks.map((r) => `<option value="risk|${r.id}" ${selected?.type === 'risk' && selected?.id === r.id ? 'selected' : ''}>[Risk] ${r.code} - ${r.title}</option>`).join('')}
              </optgroup>
              <optgroup label="Issues">
                ${this.issues.map((i) => `<option value="issue|${i.id}" ${selected?.type === 'issue' && selected?.id === i.id ? 'selected' : ''}>[Issue] ${i.code} - ${i.title}</option>`).join('')}
              </optgroup>
              <optgroup label="Milestones">
                ${this.milestones.map((m) => `<option value="milestone|${m.id}" ${selected?.type === 'milestone' && selected?.id === m.id ? 'selected' : ''}>[Milestone] ${m.code} - ${m.name}</option>`).join('')}
              </optgroup>
              <optgroup label="Releases">
                ${this.releases.map((rel) => `<option value="release|${rel.id}" ${selected?.type === 'release' && selected?.id === rel.id ? 'selected' : ''}>[Release] ${rel.code} - ${rel.name} (${rel.version})</option>`).join('')}
              </optgroup>
              <optgroup label="Delivery Deliverables">
                ${this.deliveryItems.map((d) => `<option value="${d.type}|${d.id}" ${selected?.type === d.type && selected?.id === d.id ? 'selected' : ''}>[${d.type.toUpperCase()}] ${d.code || d.id} - ${d.title || d.name}</option>`).join('')}
              </optgroup>
            </select>
          </div>
        </div>

        <div class="p-4" id="traceability-results-viewport">
          ${!selected ? `<div class="text-center py-5 text-secondary"><i class="fa-solid fa-magnifying-glass-chart fa-3x mb-3 text-secondary opacity-50"></i><p>Select any project, risk, issue, milestone, or delivery item above to inspect its live connected governance hierarchy.</p></div>` : `<div class="text-center py-3"><i class="fa-solid fa-spinner fa-spin"></i> Tracing lineage...</div>`}
        </div>
      </div>
    `;

    if (selected) {
      this.fetchAndRenderTraceability(selected.type, selected.id);
    }
  },

  handleTraceSelection(val) {
    if (!val) return;
    const [type, id] = val.split('|');
    this.selectedTrace = { type, id };
    this.fetchAndRenderTraceability(type, id);
  },

  async fetchAndRenderTraceability(type, id) {
    const vp = document.getElementById('traceability-results-viewport');
    if (!vp) return;

    try {
      const chain = await GovernanceService.getTraceability(type, id);
      if (!chain) {
        vp.innerHTML = `<div class="alert alert-warning text-center text-xs">No traceability chain could be computed for this item.</div>`;
        return;
      }

      vp.innerHTML = `
        <div class="d-flex flex-column gap-3">
          <!-- Ancestors Chain (Upward Hierarchy) -->
          <div>
            <div class="text-xs font-bold text-secondary text-uppercase mb-2"><i class="fa-solid fa-arrow-up-long text-primary me-1"></i> Upstream Strategic Lineage (Ancestors)</div>
            <div class="d-flex flex-wrap align-items-center gap-2">
              ${(chain.ancestors || []).length === 0 ? `<span class="badge bg-light text-secondary border">Root Level (Top of Hierarchy)</span>` : ''}
              ${(chain.ancestors || [])
                .map(
                  (a) => `
                <div class="d-flex align-items-center gap-1.5 p-2 rounded bg-light border text-xs" style="cursor: pointer;" onclick="window.GovernanceModule.inspectEntity('${a.type}', '${a.id}')">
                  <span class="badge bg-primary text-white text-uppercase" style="font-size: 0.68rem;">${a.type}</span>
                  <span class="font-bold text-dark font-monospace">${a.code || ''}</span>
                  <span class="text-secondary">${a.name}</span>
                </div>
                <span class="text-secondary">&rarr;</span>
              `
                )
                .join('')}
            </div>
          </div>

          <!-- Current Focus Node -->
          <div class="p-3 rounded border" style="background-color: rgba(79, 70, 229, 0.05); border-color: var(--brand-primary) !important;">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <span class="badge bg-primary text-white text-uppercase">${chain.entity.type} (Focus Item)</span>
                <span class="font-bold font-monospace text-primary ms-1">${chain.entity.code || ''}</span>
                <h5 class="font-bold my-1 text-dark">${chain.entity.name}</h5>
              </div>
              <div>
                <span class="badge bg-light text-dark border">${chain.entity.status || 'Active'}</span>
              </div>
            </div>
          </div>

          <!-- Downstream Children / Deliverables -->
          <div>
            <div class="text-xs font-bold text-secondary text-uppercase mb-2"><i class="fa-solid fa-arrow-down-long text-success me-1"></i> Downstream Deliverables (Children)</div>
            <div class="d-flex flex-wrap gap-2">
              ${(chain.children || []).length === 0 ? `<div class="text-xs text-secondary">No direct child deliverables registered.</div>` : ''}
              ${(chain.children || [])
                .map(
                  (c) => `
                <div class="d-flex align-items-center gap-1.5 p-2 rounded bg-light border text-xs" style="cursor: pointer;" onclick="window.GovernanceModule.inspectEntity('${c.type}', '${c.id}')">
                  <span class="badge bg-success-subtle text-success text-uppercase" style="font-size: 0.68rem;">${c.type}</span>
                  <span class="font-bold font-monospace">${c.code || ''}</span>
                  <span>${c.name}</span>
                </div>
              `
                )
                .join('')}
            </div>
          </div>

          <!-- Connected Governance Dimensions (Risks, Issues, Blockers) -->
          <div class="row g-3 mt-2">
            <div class="col-md-4">
              <div class="p-3 rounded border bg-white h-100">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="font-bold text-xs text-danger text-uppercase"><i class="fa-solid fa-shield-halved me-1"></i> Connected Risks</span>
                  <span class="badge bg-danger-subtle text-danger">${chain.governance?.risks?.length || 0}</span>
                </div>
                <div class="d-flex flex-column gap-1">
                  ${(chain.governance?.risks || []).length === 0 ? `<span class="text-xs text-secondary">No linked risks</span>` : ''}
                  ${(chain.governance?.risks || [])
                    .map(
                      (r) => `
                    <div class="p-1.5 rounded bg-light border text-xs d-flex justify-content-between">
                      <span class="font-bold text-danger font-monospace">${r.code}</span>
                      <span class="text-truncate" style="max-width: 140px;">${r.name}</span>
                      <span class="badge bg-secondary-subtle text-secondary">${r.severity}</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            </div>

            <div class="col-md-4">
              <div class="p-3 rounded border bg-white h-100">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="font-bold text-xs text-warning text-uppercase"><i class="fa-solid fa-circle-exclamation me-1"></i> Connected Issues</span>
                  <span class="badge bg-warning-subtle text-warning">${chain.governance?.issues?.length || 0}</span>
                </div>
                <div class="d-flex flex-column gap-1">
                  ${(chain.governance?.issues || []).length === 0 ? `<span class="text-xs text-secondary">No linked issues</span>` : ''}
                  ${(chain.governance?.issues || [])
                    .map(
                      (i) => `
                    <div class="p-1.5 rounded bg-light border text-xs d-flex justify-content-between">
                      <span class="font-bold text-warning font-monospace">${i.code}</span>
                      <span class="text-truncate" style="max-width: 140px;">${i.name}</span>
                      <span class="badge bg-light text-dark border">${i.status}</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            </div>

            <div class="col-md-4">
              <div class="p-3 rounded border bg-white h-100">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="font-bold text-xs text-primary text-uppercase"><i class="fa-solid fa-diagram-next me-1"></i> Active Dependencies</span>
                  <span class="badge bg-primary-subtle text-primary">${chain.governance?.dependencies?.length || 0}</span>
                </div>
                <div class="d-flex flex-column gap-1">
                  ${(chain.governance?.dependencies || []).length === 0 ? `<span class="text-xs text-secondary">No dependencies</span>` : ''}
                  ${(chain.governance?.dependencies || [])
                    .map(
                      (d) => `
                    <div class="p-1.5 rounded bg-light border text-xs d-flex justify-content-between">
                      <span class="font-bold text-primary font-monospace">${d.code}</span>
                      <span class="text-truncate" style="max-width: 140px;">${d.name}</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      vp.innerHTML = `<div class="alert alert-danger text-center text-xs">Failed to load traceability chain.</div>`;
    }
  },

  // Generic Link Modal (connects risk / issue / milestone to any delivery item)
  openLinkDialog(govType, govId) {
    const options = [
      ...this.projects.map((p) => ({ type: 'project', id: p.id, code: p.code || p.id, name: p.name })),
      ...this.deliveryItems.map((i) => ({ type: i.type, id: i.id, code: i.code || i.id, name: i.title || i.name })),
    ];

    const html = `
      <div class="p-2">
        <label class="form-label font-bold text-xs text-secondary mb-1">Select Delivery Item to Link With</label>
        <select id="m-link-item" class="form-select">
          ${options.map((o) => `<option value="${o.type}|${o.id}|${o.code}|${o.name}">[${o.type.toUpperCase()}] ${o.code} - ${o.name}</option>`).join('')}
        </select>
      </div>
    `;

    this.app.openModal(`Link Delivery Item to ${govType.toUpperCase()}`, html, async (overlay) => {
      const parts = overlay.querySelector('#m-link-item').value.split('|');
      try {
        if (govType === 'risk') {
          await RiskService.linkItem(govId, parts[0], parts[1], parts[2], parts[3]);
        } else if (govType === 'issue') {
          await IssueService.linkItem(govId, parts[0], parts[1], parts[2], parts[3]);
        } else if (govType === 'milestone') {
          await MilestoneService.linkItem(govId, parts[0], parts[1], parts[2], parts[3]);
        }
        this.app.showToast('Item linked successfully', 'success');
        await this.loadData();
        if (govType === 'risk') this.openRiskDetails(govId);
        if (govType === 'issue') this.openIssueDetails(govId);
        if (govType === 'milestone') this.openMilestoneDetails(govId);
      } catch (err) {
        this.app.showToast('Failed to link item', 'danger');
      }
    });
  },

  async unlinkItem(govType, govId, linkId) {
    try {
      if (govType === 'risk') {
        await RiskService.unlinkItem(govId, linkId);
      } else if (govType === 'issue') {
        await IssueService.unlinkItem(govId, linkId);
      } else if (govType === 'milestone') {
        await MilestoneService.unlinkItem(govId, linkId);
      }
      this.app.showToast('Link removed', 'info');
      await this.loadData();
      if (govType === 'risk') this.openRiskDetails(govId);
      if (govType === 'issue') this.openIssueDetails(govId);
      if (govType === 'milestone') this.openMilestoneDetails(govId);
    } catch (err) {
      this.app.showToast('Failed to unlink item', 'danger');
    }
  },
};

// Global assignment for inline event handlers
if (typeof window !== 'undefined') {
  window.GovernanceModule = GovernanceModule;
}
