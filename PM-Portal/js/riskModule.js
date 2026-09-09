/**
 * Surya PM Portal V2.0 - Risk Management Module (Sprint 5A)
 * Unified Enterprise Risk Register with PostgreSQL Persistence,
 * Server-Side Calculation (Probability x Impact), RBAC, and Project Detail Integration.
 */
import { RiskService } from './services/riskService.js';
import { apiClient } from './services/apiClient.js';
import { RiskEngineModule } from './riskEngine.js';

export const RiskModule = {
  app: null,
  activeTab: 'register', // 'register' | 'audit'
  risks: [],
  total: 0,
  page: 1,
  limit: 10,
  search: '',
  filterProject: 'all',
  filterCategory: 'all',
  filterSeverity: 'all',
  filterStatus: 'all',
  projects: [],
  users: [],
  editingRiskId: null,
  pendingDeleteId: null,

  async init(appInstance) {
    this.app = appInstance;
    await this.loadDependencies();
    this.renderContainer();
    this.attachEventListeners();
    await this.loadRisks();
  },

  async loadDependencies() {
    try {
      // Fetch projects
      const projData = await apiClient.get('/projects');
      this.projects = projData.projects || projData || [];
    } catch (e) {
      this.projects = this.app?.projectsList || [];
    }

    try {
      // Fetch users
      const userData = await apiClient.get('/users');
      this.users = userData.users || userData || [];
    } catch (e) {
      this.users = this.app?.usersList || [];
    }
  },

  renderContainer() {
    const pageContainer = document.getElementById('page-risks');
    if (!pageContainer) return;

    // Check if tabs header already injected
    let tabNav = document.getElementById('risk-module-tab-nav');
    if (!tabNav) {
      const navHtml = `
        <div id="risk-module-tab-nav" class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom flex-wrap gap-2">
          <ul class="nav nav-pills" id="risk-main-tabs" role="tablist">
            <li class="nav-item">
              <button class="nav-link active font-bold d-flex align-items-center gap-2" id="tab-btn-v2-register" data-tab="register">
                <i class="fa-solid fa-shield-halved text-danger"></i> V2 Risk Register
                <span class="badge bg-danger-subtle text-danger ms-1" id="v2-risk-total-badge">0</span>
              </button>
            </li>
            <li class="nav-item">
              <button class="nav-link font-bold d-flex align-items-center gap-2 text-secondary" id="tab-btn-v1-audit" data-tab="audit">
                <i class="fa-solid fa-gauge-high text-primary"></i> Compliance Audit Engine (V1.1)
              </button>
            </li>
          </ul>

          <div class="d-flex align-items-center gap-2">
            <button id="btn-v2-add-risk" class="btn-enterprise btn-enterprise-primary d-flex align-items-center gap-1.5" style="font-size: 0.85rem; padding: 7px 14px;">
              <i class="fa-solid fa-plus"></i> Add Risk
            </button>
          </div>
        </div>

        <div id="v2-risk-register-view">
          <!-- KPI Summary Cards -->
          <div class="row g-3 mb-4" id="v2-risk-kpi-row">
            <div class="col-md-2 col-6">
              <div class="card p-3 h-100" style="background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-md);">
                <div class="text-xs text-secondary font-semibold text-uppercase">Total Risks</div>
                <h3 class="mb-0 mt-1 font-bold" id="kpi-v2-total">0</h3>
              </div>
            </div>
            <div class="col-md-2 col-6">
              <div class="card p-3 h-100" style="background-color: var(--bg-card); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--border-radius-md);">
                <div class="text-xs text-danger font-semibold text-uppercase">Critical (17–25)</div>
                <h3 class="mb-0 mt-1 font-bold text-danger" id="kpi-v2-critical">0</h3>
              </div>
            </div>
            <div class="col-md-2 col-6">
              <div class="card p-3 h-100" style="background-color: var(--bg-card); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: var(--border-radius-md);">
                <div class="text-xs font-semibold text-uppercase" style="color: #ea580c;">High (10–16)</div>
                <h3 class="mb-0 mt-1 font-bold" style="color: #ea580c;" id="kpi-v2-high">0</h3>
              </div>
            </div>
            <div class="col-md-2 col-6">
              <div class="card p-3 h-100" style="background-color: var(--bg-card); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--border-radius-md);">
                <div class="text-xs font-semibold text-uppercase" style="color: #d97706;">Medium (5–9)</div>
                <h3 class="mb-0 mt-1 font-bold" style="color: #d97706;" id="kpi-v2-medium">0</h3>
              </div>
            </div>
            <div class="col-md-2 col-6">
              <div class="card p-3 h-100" style="background-color: var(--bg-card); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--border-radius-md);">
                <div class="text-xs font-semibold text-uppercase" style="color: #059669;">Low (1–4)</div>
                <h3 class="mb-0 mt-1 font-bold" style="color: #059669;" id="kpi-v2-low">0</h3>
              </div>
            </div>
            <div class="col-md-2 col-6">
              <div class="card p-3 h-100" style="background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-md);">
                <div class="text-xs text-secondary font-semibold text-uppercase">Mitigated/Closed</div>
                <h3 class="mb-0 mt-1 font-bold text-primary" id="kpi-v2-closed">0</h3>
              </div>
            </div>
          </div>

          <!-- Filters Bar -->
          <div class="card p-3 mb-4" style="background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-md);">
            <div class="row g-2 align-items-center">
              <div class="col-lg-3 col-md-6">
                <div class="search-bar w-100" style="margin: 0;">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <input type="text" id="v2-risk-filter-search" placeholder="Search code, title, details..." />
                </div>
              </div>
              <div class="col-lg-2 col-md-3 col-6">
                <select id="v2-risk-filter-project" class="form-select form-select-sm">
                  <option value="all">All Projects</option>
                  ${this.projects.map(p => `<option value="${p.id}">${p.name || p.id}</option>`).join('')}
                </select>
              </div>
              <div class="col-lg-2 col-md-3 col-6">
                <select id="v2-risk-filter-category" class="form-select form-select-sm">
                  <option value="all">All Categories</option>
                  <option value="Technical">Technical</option>
                  <option value="Schedule">Schedule</option>
                  <option value="Budget">Budget</option>
                  <option value="Resource">Resource</option>
                  <option value="Operational">Operational</option>
                  <option value="Scope">Scope</option>
                  <option value="Quality">Quality</option>
                  <option value="Vendor">Vendor</option>
                  <option value="Security">Security</option>
                  <option value="Compliance">Compliance</option>
                  <option value="Business">Business</option>
                  <option value="Environment">Environment</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div class="col-lg-2 col-md-3 col-6">
                <select id="v2-risk-filter-severity" class="form-select form-select-sm">
                  <option value="all">All Severities</option>
                  <option value="Critical">Critical (17–25)</option>
                  <option value="High">High (10–16)</option>
                  <option value="Medium">Medium (5–9)</option>
                  <option value="Low">Low (1–4)</option>
                </select>
              </div>
              <div class="col-lg-2 col-md-3 col-6">
                <select id="v2-risk-filter-status" class="form-select form-select-sm">
                  <option value="all">All Statuses</option>
                  <option value="Identified">Identified</option>
                  <option value="Assessing">Assessing</option>
                  <option value="Mitigating">Mitigating</option>
                  <option value="Monitoring">Monitoring</option>
                  <option value="Escalated">Escalated</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
              <div class="col-lg-1 col-md-12 text-end">
                <button id="v2-risk-btn-reset-filters" class="btn btn-sm btn-outline-secondary w-100" title="Reset Filters">
                  <i class="fa-solid fa-rotate-left"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Risk Table -->
          <div class="card" style="background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-md);">
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
                <thead style="background-color: var(--bg-light); border-bottom: 2px solid var(--border-color);">
                  <tr>
                    <th style="width: 110px;">Code</th>
                    <th>Risk Title</th>
                    <th style="width: 140px;">Project</th>
                    <th style="width: 120px;">Category</th>
                    <th style="width: 90px; text-align: center;">P × I</th>
                    <th style="width: 130px; text-align: center;">Score & Severity</th>
                    <th style="width: 110px; text-align: center;">Status</th>
                    <th style="width: 130px;">Owner</th>
                    <th style="width: 110px;">Target Date</th>
                    <th style="width: 100px; text-align: center;">Actions</th>
                  </tr>
                </thead>
                <tbody id="v2-risk-table-body">
                  <tr>
                    <td colspan="10" class="text-center py-4 text-muted">
                      <i class="fa-solid fa-spinner fa-spin me-2"></i> Loading Risk Register...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Pagination Footer -->
            <div class="d-flex justify-content-between align-items-center p-3 border-top flex-wrap gap-2 text-xs" style="background-color: var(--bg-light);">
              <div class="text-secondary" id="v2-risk-pagination-info">
                Showing 0–0 of 0 risks
              </div>
              <div class="d-flex align-items-center gap-2">
                <select id="v2-risk-page-limit" class="form-select form-select-sm" style="width: 75px;">
                  <option value="10" selected>10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
                <div class="btn-group btn-group-sm" id="v2-risk-pagination-buttons">
                  <button class="btn btn-outline-secondary" id="v2-risk-prev-page" disabled>
                    <i class="fa-solid fa-chevron-left"></i>
                  </button>
                  <button class="btn btn-outline-secondary" id="v2-risk-next-page" disabled>
                    <i class="fa-solid fa-chevron-right"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="v1-audit-engine-view" style="display: none;">
          <!-- Existing V1.1 Audit UI is nested here -->
        </div>
      `;

      // Extract existing content of #page-risks
      const originalContent = pageContainer.innerHTML;
      pageContainer.innerHTML = navHtml;

      const v1View = document.getElementById('v1-audit-engine-view');
      if (v1View) {
        v1View.innerHTML = originalContent;
      }
    }

    // Inject Modals into body if not already present
    this.injectModals();
  },

  injectModals() {
    if (document.getElementById('modal-v2-risk-form')) return;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = `
      <!-- Modal: Create / Edit Risk -->
      <div class="modal fade" id="modal-v2-risk-form" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content" style="background-color: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color);">
            <div class="modal-header">
              <h5 class="modal-title font-bold d-flex align-items-center gap-2" id="v2-risk-modal-title">
                <i class="fa-solid fa-shield-halved text-danger"></i> Create New Risk
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <form id="form-v2-risk">
              <div class="modal-body p-4">
                <div class="row g-3">
                  <!-- Title -->
                  <div class="col-12">
                    <label class="form-label font-bold text-xs text-uppercase">Risk Title <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" id="form-risk-title" required placeholder="e.g. Third-party payment gateway SLA latency" />
                  </div>

                  <!-- Project & Category -->
                  <div class="col-md-6">
                    <label class="form-label font-bold text-xs text-uppercase">Project <span class="text-danger">*</span></label>
                    <select class="form-select" id="form-risk-project" required>
                      <option value="">Select project...</option>
                      ${this.projects.map(p => `<option value="${p.id}">${p.name || p.id}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label font-bold text-xs text-uppercase">Category <span class="text-danger">*</span></label>
                    <select class="form-select" id="form-risk-category" required>
                      <option value="Technical">Technical</option>
                      <option value="Schedule">Schedule</option>
                      <option value="Budget">Budget</option>
                      <option value="Resource">Resource</option>
                      <option value="Operational">Operational</option>
                      <option value="Scope">Scope</option>
                      <option value="Quality">Quality</option>
                      <option value="Vendor">Vendor</option>
                      <option value="Security">Security</option>
                      <option value="Compliance">Compliance</option>
                      <option value="Business">Business</option>
                      <option value="Environment">Environment</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <!-- Probability & Impact with LIVE CALCULATION -->
                  <div class="col-md-6">
                    <label class="form-label font-bold text-xs text-uppercase">
                      Probability (1–5) <span class="text-danger">*</span>
                    </label>
                    <select class="form-select" id="form-risk-probability" required>
                      <option value="1">1 – Very Low</option>
                      <option value="2" selected>2 – Low</option>
                      <option value="3">3 – Medium</option>
                      <option value="4">4 – High</option>
                      <option value="5">5 – Very High</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label font-bold text-xs text-uppercase">
                      Impact (1–5) <span class="text-danger">*</span>
                    </label>
                    <select class="form-select" id="form-risk-impact" required>
                      <option value="1">1 – Very Low</option>
                      <option value="2" selected>2 – Low</option>
                      <option value="3">3 – Medium</option>
                      <option value="4">4 – High</option>
                      <option value="5">5 – Very High</option>
                    </select>
                  </div>

                  <!-- LIVE SCORE DISPLAY CONTAINER -->
                  <div class="col-12">
                    <div class="p-3 rounded d-flex justify-content-between align-items-center" style="background-color: var(--bg-light); border: 1px solid var(--border-color);">
                      <div>
                        <div class="text-xs text-secondary font-bold text-uppercase">Calculated Risk Score (Probability × Impact)</div>
                        <div class="d-flex align-items-baseline gap-2 mt-1">
                          <span class="fs-4 font-bold" id="form-calc-score-display">4</span>
                          <span class="text-secondary text-xs">/ 25 maximum exposure</span>
                        </div>
                      </div>
                      <div class="text-end">
                        <div class="text-xs text-secondary font-bold text-uppercase mb-1">Severity Band</div>
                        <span id="form-calc-severity-badge" class="badge" style="background-color: #059669; font-size: 0.9rem; padding: 6px 12px;">Low</span>
                      </div>
                    </div>
                  </div>

                  <!-- Owner & Target Date -->
                  <div class="col-md-6">
                    <label class="form-label font-bold text-xs text-uppercase">Owner</label>
                    <select class="form-select" id="form-risk-owner">
                      <option value="">Unassigned</option>
                      ${this.users.map(u => `<option value="${u.id}">${u.firstName || ''} ${u.lastName || ''} (${u.email})</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label font-bold text-xs text-uppercase">Target Resolution Date</label>
                    <input type="date" class="form-control" id="form-risk-target-date" />
                  </div>

                  <!-- Status -->
                  <div class="col-md-12">
                    <label class="form-label font-bold text-xs text-uppercase">Status</label>
                    <select class="form-select" id="form-risk-status">
                      <option value="Identified">Identified</option>
                      <option value="Assessing">Assessing</option>
                      <option value="Mitigating">Mitigating</option>
                      <option value="Monitoring">Monitoring</option>
                      <option value="Escalated">Escalated</option>
                      <option value="Accepted">Accepted</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  <!-- Description -->
                  <div class="col-12">
                    <label class="form-label font-bold text-xs text-uppercase">Description</label>
                    <textarea class="form-control" id="form-risk-desc" rows="2" placeholder="Detailed risk context and operational scenario..."></textarea>
                  </div>

                  <!-- Mitigation Plan -->
                  <div class="col-12">
                    <label class="form-label font-bold text-xs text-uppercase">Mitigation Plan</label>
                    <textarea class="form-control" id="form-risk-mitigation" rows="2" placeholder="Steps taken to reduce probability or impact..."></textarea>
                  </div>

                  <!-- Contingency Plan -->
                  <div class="col-12">
                    <label class="form-label font-bold text-xs text-uppercase">Contingency Plan</label>
                    <textarea class="form-control" id="form-risk-contingency" rows="2" placeholder="Actions triggered if risk materializes into an issue..."></textarea>
                  </div>

                  <!-- Trigger Condition -->
                  <div class="col-12">
                    <label class="form-label font-bold text-xs text-uppercase">Trigger Condition</label>
                    <input type="text" class="form-control" id="form-risk-trigger" placeholder="e.g. Latency exceeds 1200ms for 3 consecutive days" />
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary" id="btn-submit-risk">
                  <i class="fa-solid fa-floppy-disk me-1"></i> Save Risk
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Modal: View Risk Details -->
      <div class="modal fade" id="modal-v2-risk-view" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content" style="background-color: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color);">
            <div class="modal-header">
              <div class="d-flex align-items-center gap-2">
                <span id="view-risk-code-badge" class="badge bg-secondary font-monospace" style="font-size: 0.85rem;">RSK-000</span>
                <h5 class="modal-title font-bold mb-0" id="view-risk-title">Risk Details</h5>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4" id="view-risk-body">
              <!-- Dynamically populated -->
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
              <button type="button" class="btn btn-primary" id="view-risk-btn-edit">
                <i class="fa-solid fa-pen-to-square me-1"></i> Edit Risk
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal: Delete Confirmation -->
      <div class="modal fade" id="modal-v2-risk-delete" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content" style="background-color: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color);">
            <div class="modal-header">
              <h5 class="modal-title font-bold text-danger d-flex align-items-center gap-2">
                <i class="fa-solid fa-triangle-exclamation"></i> Delete Risk
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
              <p>Are you sure you want to permanently delete this risk?</p>
              <div class="p-3 rounded mb-2 text-sm" style="background-color: var(--bg-light); border: 1px solid var(--border-color);">
                <div class="font-bold" id="delete-risk-title">Risk Title</div>
                <div class="text-xs text-secondary mt-1" id="delete-risk-code">RSK-000</div>
              </div>
              <p class="text-xs text-muted mb-0">This action will be logged in the enterprise audit trail.</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger" id="btn-confirm-delete-risk">
                <i class="fa-solid fa-trash me-1"></i> Delete Risk
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalContainer);
  },

  attachEventListeners() {
    // Tabs switching
    const tabRegister = document.getElementById('tab-btn-v2-register');
    const tabAudit = document.getElementById('tab-btn-v1-audit');
    const viewRegister = document.getElementById('v2-risk-register-view');
    const viewAudit = document.getElementById('v1-audit-engine-view');

    if (tabRegister && tabAudit && viewRegister && viewAudit) {
      tabRegister.onclick = () => {
        this.activeTab = 'register';
        tabRegister.classList.add('active');
        tabRegister.classList.remove('text-secondary');
        tabAudit.classList.remove('active');
        tabAudit.classList.add('text-secondary');
        viewRegister.style.display = 'block';
        viewAudit.style.display = 'none';
        this.loadRisks();
      };

      tabAudit.onclick = () => {
        this.activeTab = 'audit';
        tabAudit.classList.add('active');
        tabAudit.classList.remove('text-secondary');
        tabRegister.classList.remove('active');
        tabRegister.classList.add('text-secondary');
        viewRegister.style.display = 'none';
        viewAudit.style.display = 'block';
        RiskEngineModule.init(this.app);
      };
    }

    // Add Risk Button
    const btnAdd = document.getElementById('btn-v2-add-risk');
    if (btnAdd) {
      btnAdd.onclick = () => this.openCreateModal();
    }

    // Filters
    const searchInp = document.getElementById('v2-risk-filter-search');
    if (searchInp) {
      let timeout;
      searchInp.oninput = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          this.search = searchInp.value.trim();
          this.page = 1;
          this.loadRisks();
        }, 250);
      };
    }

    const projSel = document.getElementById('v2-risk-filter-project');
    if (projSel) {
      projSel.onchange = () => {
        this.filterProject = projSel.value;
        this.page = 1;
        this.loadRisks();
      };
    }

    const catSel = document.getElementById('v2-risk-filter-category');
    if (catSel) {
      catSel.onchange = () => {
        this.filterCategory = catSel.value;
        this.page = 1;
        this.loadRisks();
      };
    }

    const sevSel = document.getElementById('v2-risk-filter-severity');
    if (sevSel) {
      sevSel.onchange = () => {
        this.filterSeverity = sevSel.value;
        this.page = 1;
        this.loadRisks();
      };
    }

    const statSel = document.getElementById('v2-risk-filter-status');
    if (statSel) {
      statSel.onchange = () => {
        this.filterStatus = statSel.value;
        this.page = 1;
        this.loadRisks();
      };
    }

    const btnReset = document.getElementById('v2-risk-btn-reset-filters');
    if (btnReset) {
      btnReset.onclick = () => {
        this.search = '';
        this.filterProject = 'all';
        this.filterCategory = 'all';
        this.filterSeverity = 'all';
        this.filterStatus = 'all';
        if (searchInp) searchInp.value = '';
        if (projSel) projSel.value = 'all';
        if (catSel) catSel.value = 'all';
        if (sevSel) sevSel.value = 'all';
        if (statSel) statSel.value = 'all';
        this.page = 1;
        this.loadRisks();
      };
    }

    // Pagination
    const limitSel = document.getElementById('v2-risk-page-limit');
    if (limitSel) {
      limitSel.onchange = () => {
        this.limit = Number(limitSel.value) || 10;
        this.page = 1;
        this.loadRisks();
      };
    }

    const btnPrev = document.getElementById('v2-risk-prev-page');
    if (btnPrev) {
      btnPrev.onclick = () => {
        if (this.page > 1) {
          this.page--;
          this.loadRisks();
        }
      };
    }

    const btnNext = document.getElementById('v2-risk-next-page');
    if (btnNext) {
      btnNext.onclick = () => {
        if (this.page * this.limit < this.total) {
          this.page++;
          this.loadRisks();
        }
      };
    }

    // Form Live Calculation Listener
    const formProb = document.getElementById('form-risk-probability');
    const formImp = document.getElementById('form-risk-impact');
    if (formProb && formImp) {
      const updateCalc = () => this.updateLiveCalculation();
      formProb.onchange = updateCalc;
      formImp.onchange = updateCalc;
    }

    // Form Submit
    const form = document.getElementById('form-v2-risk');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        this.handleFormSubmit();
      };
    }

    // Delete Confirmation
    const btnConfirmDelete = document.getElementById('btn-confirm-delete-risk');
    if (btnConfirmDelete) {
      btnConfirmDelete.onclick = () => this.handleDeleteConfirm();
    }
  },

  updateLiveCalculation() {
    const p = Number(document.getElementById('form-risk-probability')?.value) || 1;
    const i = Number(document.getElementById('form-risk-impact')?.value) || 1;
    const score = p * i;

    let severity = 'Low';
    let color = '#059669'; // Green
    if (score >= 17) {
      severity = 'Critical';
      color = '#ef4444'; // Red
    } else if (score >= 10) {
      severity = 'High';
      color = '#ea580c'; // Orange
    } else if (score >= 5) {
      severity = 'Medium';
      color = '#d97706'; // Amber/Yellow
    }

    const scoreDisplay = document.getElementById('form-calc-score-display');
    const sevBadge = document.getElementById('form-calc-severity-badge');

    if (scoreDisplay) scoreDisplay.textContent = score;
    if (sevBadge) {
      sevBadge.textContent = severity;
      sevBadge.style.backgroundColor = color;
    }
  },

  async loadRisks() {
    const tbody = document.getElementById('v2-risk-table-body');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-4 text-muted">
          <i class="fa-solid fa-spinner fa-spin me-2"></i> Loading Risk Register...
        </td>
      </tr>
    `;

    try {
      const params = {
        page: this.page,
        limit: this.limit,
      };
      if (this.search) params.search = this.search;
      if (this.filterProject !== 'all') params.projectId = this.filterProject;
      if (this.filterCategory !== 'all') params.category = this.filterCategory;
      if (this.filterSeverity !== 'all') params.severity = this.filterSeverity;
      if (this.filterStatus !== 'all') params.status = this.filterStatus;

      const result = await RiskService.getPaginatedRisks(params);
      this.risks = result.risks || [];
      this.total = result.total || 0;

      this.renderTable();
      this.renderPagination();
      await this.updateSummaryKPIs();
    } catch (err) {
      console.error('Failed to load risks:', err);
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-4 text-danger">
            <i class="fa-solid fa-triangle-exclamation me-2"></i> Error loading risks: ${err.message || 'Unknown error'}
          </td>
        </tr>
      `;
    }
  },

  renderTable() {
    const tbody = document.getElementById('v2-risk-table-body');
    if (!tbody) return;

    if (this.risks.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5 text-muted">
            <div class="mb-2"><i class="fa-solid fa-shield-halved fa-2x opacity-50"></i></div>
            <div class="font-semibold">No risks found</div>
            <div class="text-xs text-secondary mt-1">Try adjusting your filters or create a new risk</div>
          </td>
        </tr>
      `;
      return;
    }

    const severityStyles = {
      Critical: { bg: 'rgba(239, 68, 68, 0.15)', text: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' },
      High: { bg: 'rgba(249, 115, 22, 0.15)', text: '#ea580c', border: 'rgba(249, 115, 22, 0.3)' },
      Medium: { bg: 'rgba(245, 158, 11, 0.15)', text: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
      Low: { bg: 'rgba(16, 185, 129, 0.15)', text: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
    };

    const statusBadges = {
      Identified: 'badge bg-secondary',
      Assessing: 'badge bg-info text-dark',
      Mitigating: 'badge bg-primary',
      Monitoring: 'badge bg-warning text-dark',
      Escalated: 'badge bg-danger',
      Accepted: 'badge bg-light text-dark border',
      Closed: 'badge bg-success',
    };

    tbody.innerHTML = this.risks.map(r => {
      const proj = this.projects.find(p => p.id === r.projectId);
      const projName = proj?.name || r.projectId || '—';
      const owner = this.users.find(u => u.id === r.ownerId);
      const ownerName = owner ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() : (r.ownerId || 'Unassigned');
      const sev = severityStyles[r.severity] || severityStyles.Low;
      const statBadge = statusBadges[r.status] || 'badge bg-secondary';

      return `
        <tr data-id="${r.id}">
          <td>
            <span class="badge bg-secondary-subtle text-secondary font-monospace">${r.code || 'RSK-?'}</span>
          </td>
          <td>
            <div class="font-bold text-truncate" style="max-width: 260px;" title="${r.title}">${r.title}</div>
            ${r.description ? `<div class="text-secondary text-xs text-truncate" style="max-width: 260px;">${r.description}</div>` : ''}
          </td>
          <td>
            <span class="text-truncate d-inline-block" style="max-width: 140px;" title="${projName}">
              <i class="fa-solid fa-folder me-1 text-primary"></i> ${projName}
            </span>
          </td>
          <td>
            <span class="badge bg-light text-dark border">${r.category}</span>
          </td>
          <td style="text-align: center;">
            <span class="font-semibold">${r.probability} × ${r.impact}</span>
          </td>
          <td style="text-align: center;">
            <span class="badge" style="background-color: ${sev.bg}; color: ${sev.text}; border: 1px solid ${sev.border}; font-size: 0.8rem; padding: 4px 8px;">
              ${r.riskScore} — ${r.severity}
            </span>
          </td>
          <td style="text-align: center;">
            <span class="${statBadge}">${r.status}</span>
          </td>
          <td>
            <span class="text-truncate d-inline-block" style="max-width: 130px;" title="${ownerName}">
              <i class="fa-solid fa-user text-secondary me-1"></i> ${ownerName}
            </span>
          </td>
          <td>
            <span class="text-secondary text-xs">${r.targetResolutionDate ? r.targetResolutionDate.split('T')[0] : '—'}</span>
          </td>
          <td style="text-align: center;">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary btn-action-view" data-id="${r.id}" title="View Details">
                <i class="fa-solid fa-eye"></i>
              </button>
              <button class="btn btn-outline-secondary btn-action-edit" data-id="${r.id}" title="Edit Risk">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn btn-outline-danger btn-action-delete" data-id="${r.id}" title="Delete Risk">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row action listeners
    tbody.querySelectorAll('.btn-action-view').forEach(btn => {
      btn.onclick = () => this.openViewModal(btn.dataset.id);
    });

    tbody.querySelectorAll('.btn-action-edit').forEach(btn => {
      btn.onclick = () => this.openEditModal(btn.dataset.id);
    });

    tbody.querySelectorAll('.btn-action-delete').forEach(btn => {
      btn.onclick = () => this.openDeleteModal(btn.dataset.id);
    });
  },

  renderPagination() {
    const info = document.getElementById('v2-risk-pagination-info');
    const btnPrev = document.getElementById('v2-risk-prev-page');
    const btnNext = document.getElementById('v2-risk-next-page');

    const start = this.total === 0 ? 0 : (this.page - 1) * this.limit + 1;
    const end = Math.min(this.page * this.limit, this.total);

    if (info) info.textContent = `Showing ${start}–${end} of ${this.total} risks`;
    if (btnPrev) btnPrev.disabled = this.page <= 1;
    if (btnNext) btnNext.disabled = end >= this.total;
  },

  async updateSummaryKPIs() {
    try {
      const allRisks = await RiskService.getRisks();
      let crit = 0, high = 0, med = 0, low = 0, closed = 0;

      allRisks.forEach(r => {
        if (r.severity === 'Critical') crit++;
        else if (r.severity === 'High') high++;
        else if (r.severity === 'Medium') med++;
        else low++;

        if (r.status === 'Closed' || r.status === 'Mitigating') closed++;
      });

      const totalBadge = document.getElementById('v2-risk-total-badge');
      const kpiTotal = document.getElementById('kpi-v2-total');
      const kpiCrit = document.getElementById('kpi-v2-critical');
      const kpiHigh = document.getElementById('kpi-v2-high');
      const kpiMed = document.getElementById('kpi-v2-medium');
      const kpiLow = document.getElementById('kpi-v2-low');
      const kpiClosed = document.getElementById('kpi-v2-closed');

      if (totalBadge) totalBadge.textContent = allRisks.length;
      if (kpiTotal) kpiTotal.textContent = allRisks.length;
      if (kpiCrit) kpiCrit.textContent = crit;
      if (kpiHigh) kpiHigh.textContent = high;
      if (kpiMed) kpiMed.textContent = med;
      if (kpiLow) kpiLow.textContent = low;
      if (kpiClosed) kpiClosed.textContent = closed;
    } catch (e) {
      console.warn('Could not update risk KPIs:', e);
    }
  },

  openCreateModal(defaultProjectId = null) {
    this.editingRiskId = null;
    const modalTitle = document.getElementById('v2-risk-modal-title');
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-shield-halved text-danger"></i> Create New Risk';

    const form = document.getElementById('form-v2-risk');
    if (form) form.reset();

    const projSel = document.getElementById('form-risk-project');
    if (projSel && defaultProjectId) {
      projSel.value = defaultProjectId;
    }

    // Default probability = 2, impact = 2
    const pSel = document.getElementById('form-risk-probability');
    const iSel = document.getElementById('form-risk-impact');
    if (pSel) pSel.value = '2';
    if (iSel) iSel.value = '2';
    this.updateLiveCalculation();

    const modalEl = document.getElementById('modal-v2-risk-form');
    if (modalEl && window.bootstrap) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  },

  async openEditModal(riskId) {
    this.editingRiskId = riskId;
    const modalTitle = document.getElementById('v2-risk-modal-title');
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square text-primary"></i> Edit Risk';

    try {
      const risk = await RiskService.getRiskById(riskId);
      if (!risk) return;

      document.getElementById('form-risk-title').value = risk.title || '';
      document.getElementById('form-risk-project').value = risk.projectId || '';
      document.getElementById('form-risk-category').value = risk.category || 'Technical';
      document.getElementById('form-risk-probability').value = String(risk.probability || 2);
      document.getElementById('form-risk-impact').value = String(risk.impact || 2);
      document.getElementById('form-risk-owner').value = risk.ownerId || '';
      document.getElementById('form-risk-target-date').value = risk.targetResolutionDate ? risk.targetResolutionDate.split('T')[0] : '';
      document.getElementById('form-risk-status').value = risk.status || 'Identified';
      document.getElementById('form-risk-desc').value = risk.description || '';
      document.getElementById('form-risk-mitigation').value = risk.mitigationPlan || '';
      document.getElementById('form-risk-contingency').value = risk.contingencyPlan || '';
      document.getElementById('form-risk-trigger').value = risk.triggerCondition || '';

      this.updateLiveCalculation();

      const modalEl = document.getElementById('modal-v2-risk-form');
      if (modalEl && window.bootstrap) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    } catch (err) {
      alert('Failed to load risk details: ' + err.message);
    }
  },

  async openViewModal(riskId) {
    try {
      const risk = await RiskService.getRiskById(riskId);
      if (!risk) return;

      const codeBadge = document.getElementById('view-risk-code-badge');
      const titleEl = document.getElementById('view-risk-title');
      const bodyEl = document.getElementById('view-risk-body');
      const btnEdit = document.getElementById('view-risk-btn-edit');

      if (codeBadge) codeBadge.textContent = risk.code || 'RSK-000';
      if (titleEl) titleEl.textContent = risk.title;

      const proj = this.projects.find(p => p.id === risk.projectId);
      const projName = proj?.name || risk.projectId || '—';
      const owner = this.users.find(u => u.id === risk.ownerId);
      const ownerName = owner ? `${owner.firstName || ''} ${owner.lastName || ''} (${owner.email})` : 'Unassigned';

      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="row g-3">
            <div class="col-md-6">
              <div class="text-xs text-secondary font-bold text-uppercase">Project</div>
              <div class="fw-bold mt-1">${projName}</div>
            </div>
            <div class="col-md-6">
              <div class="text-xs text-secondary font-bold text-uppercase">Category</div>
              <div class="badge bg-light text-dark border mt-1">${risk.category}</div>
            </div>

            <!-- Score & Severity Card -->
            <div class="col-12">
              <div class="p-3 rounded d-flex justify-content-between align-items-center" style="background-color: var(--bg-light); border: 1px solid var(--border-color);">
                <div>
                  <div class="text-xs text-secondary font-bold text-uppercase">Risk Score Calculation</div>
                  <div class="fw-bold fs-5 mt-1">
                    Probability (${risk.probability}) × Impact (${risk.impact}) = <span class="text-primary">${risk.riskScore}</span> / 25
                  </div>
                </div>
                <div class="text-end">
                  <div class="text-xs text-secondary font-bold text-uppercase mb-1">Severity Band</div>
                  <span class="badge" style="font-size: 0.95rem; padding: 6px 12px; background-color: ${
                    risk.severity === 'Critical' ? '#ef4444' : risk.severity === 'High' ? '#ea580c' : risk.severity === 'Medium' ? '#d97706' : '#059669'
                  }">${risk.severity}</span>
                </div>
              </div>
            </div>

            <div class="col-md-6">
              <div class="text-xs text-secondary font-bold text-uppercase">Status</div>
              <div class="badge bg-primary mt-1">${risk.status}</div>
            </div>
            <div class="col-md-6">
              <div class="text-xs text-secondary font-bold text-uppercase">Owner</div>
              <div class="mt-1">${ownerName}</div>
            </div>

            ${risk.description ? `
              <div class="col-12">
                <div class="text-xs text-secondary font-bold text-uppercase">Description</div>
                <div class="p-2 rounded mt-1 text-sm" style="background-color: var(--bg-light);">${risk.description}</div>
              </div>
            ` : ''}

            ${risk.mitigationPlan ? `
              <div class="col-12">
                <div class="text-xs text-secondary font-bold text-uppercase">Mitigation Plan</div>
                <div class="p-2 rounded mt-1 text-sm text-success font-monospace" style="background-color: var(--bg-light);">${risk.mitigationPlan}</div>
              </div>
            ` : ''}

            ${risk.contingencyPlan ? `
              <div class="col-12">
                <div class="text-xs text-secondary font-bold text-uppercase">Contingency Plan</div>
                <div class="p-2 rounded mt-1 text-sm text-warning font-monospace" style="background-color: var(--bg-light);">${risk.contingencyPlan}</div>
              </div>
            ` : ''}

            ${risk.triggerCondition ? `
              <div class="col-12">
                <div class="text-xs text-secondary font-bold text-uppercase">Trigger Condition</div>
                <div class="p-2 rounded mt-1 text-sm text-danger font-monospace" style="background-color: var(--bg-light);">${risk.triggerCondition}</div>
              </div>
            ` : ''}

            <div class="col-md-6">
              <div class="text-xs text-secondary font-bold text-uppercase">Target Resolution Date</div>
              <div class="mt-1">${risk.targetResolutionDate ? risk.targetResolutionDate.split('T')[0] : '—'}</div>
            </div>
            <div class="col-md-6">
              <div class="text-xs text-secondary font-bold text-uppercase">Last Updated</div>
              <div class="mt-1 text-xs text-secondary">${risk.updatedAt ? new Date(risk.updatedAt).toLocaleString() : '—'}</div>
            </div>
          </div>
        `;
      }

      if (btnEdit) {
        btnEdit.onclick = () => {
          const viewModalEl = document.getElementById('modal-v2-risk-view');
          if (viewModalEl && window.bootstrap) {
            bootstrap.Modal.getInstance(viewModalEl)?.hide();
          }
          this.openEditModal(riskId);
        };
      }

      const modalEl = document.getElementById('modal-v2-risk-view');
      if (modalEl && window.bootstrap) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    } catch (err) {
      alert('Failed to load risk details: ' + err.message);
    }
  },

  openDeleteModal(riskId) {
    this.pendingDeleteId = riskId;
    const risk = this.risks.find(r => r.id === riskId);

    const titleEl = document.getElementById('delete-risk-title');
    const codeEl = document.getElementById('delete-risk-code');

    if (titleEl) titleEl.textContent = risk?.title || 'Unknown Risk';
    if (codeEl) codeEl.textContent = risk?.code || riskId;

    const modalEl = document.getElementById('modal-v2-risk-delete');
    if (modalEl && window.bootstrap) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  },

  async handleDeleteConfirm() {
    if (!this.pendingDeleteId) return;

    try {
      await RiskService.deleteRisk(this.pendingDeleteId);

      const modalEl = document.getElementById('modal-v2-risk-delete');
      if (modalEl && window.bootstrap) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      this.pendingDeleteId = null;
      await this.loadRisks();

      if (this.app?.showToast) {
        this.app.showToast('Risk deleted successfully', 'success');
      }
    } catch (err) {
      alert('Error deleting risk: ' + (err.message || 'Operation failed'));
    }
  },

  async handleFormSubmit() {
    const title = document.getElementById('form-risk-title')?.value.trim();
    const projectId = document.getElementById('form-risk-project')?.value;
    const category = document.getElementById('form-risk-category')?.value;
    const probability = Number(document.getElementById('form-risk-probability')?.value);
    const impact = Number(document.getElementById('form-risk-impact')?.value);
    const ownerId = document.getElementById('form-risk-owner')?.value || null;
    const targetResolutionDate = document.getElementById('form-risk-target-date')?.value || null;
    const status = document.getElementById('form-risk-status')?.value || 'Identified';
    const description = document.getElementById('form-risk-desc')?.value.trim() || null;
    const mitigationPlan = document.getElementById('form-risk-mitigation')?.value.trim() || null;
    const contingencyPlan = document.getElementById('form-risk-contingency')?.value.trim() || null;
    const triggerCondition = document.getElementById('form-risk-trigger')?.value.trim() || null;

    if (!title || !projectId) {
      alert('Please fill in required fields (Title and Project).');
      return;
    }

    const payload = {
      title,
      projectId,
      category,
      probability,
      impact,
      ownerId,
      targetResolutionDate,
      status,
      description,
      mitigationPlan,
      contingencyPlan,
      triggerCondition,
    };

    const btn = document.getElementById('btn-submit-risk');
    if (btn) btn.disabled = true;

    try {
      if (this.editingRiskId) {
        await RiskService.updateRisk(this.editingRiskId, payload);
      } else {
        await RiskService.createRisk(payload);
      }

      const modalEl = document.getElementById('modal-v2-risk-form');
      if (modalEl && window.bootstrap) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      await this.loadRisks();

      if (this.app?.showToast) {
        this.app.showToast(this.editingRiskId ? 'Risk updated successfully' : 'Risk created successfully', 'success');
      }
    } catch (err) {
      alert('Error saving risk: ' + (err.message || 'Validation error'));
    } finally {
      if (btn) btn.disabled = false;
    }
  },
};
