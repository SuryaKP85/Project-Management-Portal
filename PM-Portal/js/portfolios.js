/**
 * Portfolios & Strategic Goals (OKRs) Module for Surya PM Portal V2.0
 */
import { PortfolioService } from './services/portfolioService.js';
import { GoalService } from './services/goalService.js';
import { ProductService } from './services/productService.js';
import { ProjectService } from './services/projectService.js';
import { UserService } from './services/userService.js';

export const PortfoliosModule = {
  app: null,
  portfolios: [],
  goals: [],
  products: [],
  projects: [],
  users: [],
  activeTab: 'portfolios', // 'portfolios' | 'goals'
  searchQuery: '',

  async init(appInstance) {
    this.app = appInstance;
    await this.loadData();
    this.setupEventListeners();
    this.render();
  },

  async loadData() {
    try {
      const [portfolios, goals, products, projects, users] = await Promise.all([
        PortfolioService.getPortfolios().catch(() => []),
        GoalService.getGoals().catch(() => []),
        ProductService.getProducts().catch(() => []),
        ProjectService.getProjects().catch(() => []),
        UserService.getUsers().catch(() => []),
      ]);

      this.portfolios = portfolios || [];
      this.goals = goals || [];
      this.products = products || [];
      this.projects = projects || [];
      this.users = users || [];
    } catch (err) {
      console.error('[PortfoliosModule] Failed loading data:', err);
    }
  },

  setupEventListeners() {
    const searchInput = document.getElementById('portfolio-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.render();
      });
    }

    const tabPortfolios = document.getElementById('tab-btn-portfolios');
    const tabGoals = document.getElementById('tab-btn-goals');
    if (tabPortfolios && tabGoals) {
      tabPortfolios.addEventListener('click', () => {
        this.activeTab = 'portfolios';
        tabPortfolios.classList.add('active', 'btn-primary');
        tabPortfolios.classList.remove('btn-light');
        tabGoals.classList.remove('active', 'btn-primary');
        tabGoals.classList.add('btn-light');
        this.render();
      });

      tabGoals.addEventListener('click', () => {
        this.activeTab = 'goals';
        tabGoals.classList.add('active', 'btn-primary');
        tabGoals.classList.remove('btn-light');
        tabPortfolios.classList.remove('active', 'btn-primary');
        tabPortfolios.classList.add('btn-light');
        this.render();
      });
    }

    const createBtn = document.getElementById('btn-create-portfolio-item');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        if (this.activeTab === 'portfolios') {
          this.openPortfolioModal();
        } else {
          this.openGoalModal();
        }
      });
    }
  },

  render() {
    const container = document.getElementById('portfolios-content-area');
    if (!container) return;

    if (this.activeTab === 'portfolios') {
      this.renderPortfolios(container);
    } else {
      this.renderGoals(container);
    }
  },

  renderPortfolios(container) {
    const filtered = this.portfolios.filter(
      (p) =>
        p.name?.toLowerCase().includes(this.searchQuery) ||
        p.code?.toLowerCase().includes(this.searchQuery) ||
        p.description?.toLowerCase().includes(this.searchQuery)
    );

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card p-5 text-center shadow-sm border-0">
          <div class="mb-3 text-muted"><i class="fa-solid fa-briefcase fa-3x" style="opacity: 0.4;"></i></div>
          <h5 class="fw-bold">No Portfolios Found</h5>
          <p class="text-muted">Create strategic portfolios to organize products, alignment goals, and execution projects.</p>
          <div class="mt-2">
            <button class="btn btn-primary btn-sm px-3" id="empty-create-portfolio-btn">
              <i class="fa-solid fa-plus me-1"></i> Create Strategic Portfolio
            </button>
          </div>
        </div>
      `;
      const btn = document.getElementById('empty-create-portfolio-btn');
      if (btn) btn.addEventListener('click', () => this.openPortfolioModal());
      return;
    }

    const cardsHtml = filtered
      .map((p) => {
        const linkedProducts = this.products.filter((prod) => prod.portfolioId === p.id);
        const linkedGoals = this.goals.filter((g) => g.portfolioId === p.id);
        const linkedProjects = this.projects.filter((prj) => prj.portfolioId === p.id);

        const healthBadge =
          p.health === 'healthy'
            ? '<span class="badge bg-success-subtle text-success border border-success-subtle">Healthy</span>'
            : p.health === 'at-risk'
            ? '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">At Risk</span>'
            : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Critical</span>';

        const statusBadge =
          p.status === 'active'
            ? '<span class="badge bg-primary-subtle text-primary">Active</span>'
            : p.status === 'completed'
            ? '<span class="badge bg-secondary-subtle text-secondary">Completed</span>'
            : '<span class="badge bg-warning-subtle text-dark">On Hold</span>';

        return `
        <div class="col-lg-6 col-xl-4 mb-4">
          <div class="card h-100 shadow-sm border-0 position-relative portfolio-card">
            <div class="card-body p-4 d-flex flex-column">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span class="text-muted small fw-semibold text-uppercase tracking-wider">${p.code || 'PORT'}</span>
                  <h5 class="card-title fw-bold text-primary mb-1">${p.name}</h5>
                </div>
                <div class="d-flex gap-1">
                  ${healthBadge}
                  ${statusBadge}
                </div>
              </div>
              <p class="card-text text-secondary small mb-3 flex-grow-1" style="min-height: 40px;">
                ${p.description || 'Strategic enterprise business portfolio.'}
              </p>

              <div class="border-top pt-3 mt-auto">
                <div class="d-flex justify-content-between text-muted small mb-2">
                  <span><i class="fa-solid fa-cube me-1 text-primary"></i> ${linkedProducts.length} Products</span>
                  <span><i class="fa-solid fa-bullseye me-1 text-danger"></i> ${linkedGoals.length} OKRs</span>
                  <span><i class="fa-solid fa-diagram-project me-1 text-info"></i> ${linkedProjects.length} Projects</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                  <div class="d-flex align-items-center gap-2">
                    <i class="fa-regular fa-user text-muted small"></i>
                    <span class="small fw-semibold text-dark">${p.ownerName || 'Surya Prashanth'}</span>
                  </div>
                  <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-light border edit-portfolio-btn" data-id="${p.id}" title="Edit Portfolio">
                      <i class="fa-solid fa-pencil text-secondary"></i>
                    </button>
                    <button class="btn btn-sm btn-light border text-danger delete-portfolio-btn" data-id="${p.id}" title="Delete Portfolio">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    container.innerHTML = `<div class="row">${cardsHtml}</div>`;

    container.querySelectorAll('.edit-portfolio-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const p = this.portfolios.find((item) => item.id === id);
        if (p) this.openPortfolioModal(p);
      });
    });

    container.querySelectorAll('.delete-portfolio-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this portfolio?')) {
          await PortfolioService.deletePortfolio(id);
          this.portfolios = this.portfolios.filter((item) => item.id !== id);
          this.render();
          if (this.app) this.app.showToast('Portfolio deleted', 'success');
        }
      });
    });
  },

  renderGoals(container) {
    const filtered = this.goals.filter(
      (g) =>
        g.objective?.toLowerCase().includes(this.searchQuery) ||
        g.description?.toLowerCase().includes(this.searchQuery)
    );

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card p-5 text-center shadow-sm border-0">
          <div class="mb-3 text-muted"><i class="fa-solid fa-bullseye fa-3x" style="opacity: 0.4;"></i></div>
          <h5 class="fw-bold">No Strategic Goals / OKRs Found</h5>
          <p class="text-muted">Define measurable organizational objectives and link them to portfolios and products.</p>
          <div class="mt-2">
            <button class="btn btn-primary btn-sm px-3" id="empty-create-goal-btn">
              <i class="fa-solid fa-plus me-1"></i> Add Strategic Goal (OKR)
            </button>
          </div>
        </div>
      `;
      const btn = document.getElementById('empty-create-goal-btn');
      if (btn) btn.addEventListener('click', () => this.openGoalModal());
      return;
    }

    const rowsHtml = filtered
      .map((g) => {
        const percent = g.targetValue > 0 ? Math.min(100, Math.round((g.currentValue / g.targetValue) * 100)) : 0;
        const port = this.portfolios.find((p) => p.id === g.portfolioId);
        const prod = this.products.find((p) => p.id === g.productId);

        const statusBadge =
          g.status === 'achieved'
            ? '<span class="badge bg-success text-white">Achieved</span>'
            : g.status === 'in-progress'
            ? '<span class="badge bg-primary text-white">In Progress</span>'
            : g.status === 'at-risk'
            ? '<span class="badge bg-warning text-dark">At Risk</span>'
            : '<span class="badge bg-secondary text-white">Draft</span>';

        return `
        <tr>
          <td>
            <div class="fw-bold text-dark">${g.objective}</div>
            <div class="small text-muted">${g.description || 'Target objective aligned with corporate strategy'}</div>
          </td>
          <td>
            <span class="badge bg-light text-dark border">
              <i class="fa-solid fa-briefcase me-1 text-primary"></i> ${port ? port.name : 'Enterprise'}
            </span>
            ${
              prod
                ? `<span class="badge bg-light text-primary border ms-1"><i class="fa-solid fa-cube me-1"></i> ${prod.name}</span>`
                : ''
            }
          </td>
          <td style="width: 200px;">
            <div class="d-flex justify-content-between small text-muted mb-1">
              <span>${g.currentValue} / ${g.targetValue} ${g.unit || ''}</span>
              <span class="fw-bold text-primary">${percent}%</span>
            </div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar ${percent >= 100 ? 'bg-success' : percent < 50 ? 'bg-warning' : 'bg-primary'}" role="progressbar" style="width: ${percent}%;"></div>
            </div>
          </td>
          <td>${statusBadge}</td>
          <td class="small text-muted">${g.ownerName || 'Surya Prashanth'}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-light border edit-goal-btn" data-id="${g.id}" title="Edit Goal">
              <i class="fa-solid fa-pencil text-secondary"></i>
            </button>
            <button class="btn btn-sm btn-light border text-danger delete-goal-btn" data-id="${g.id}" title="Delete Goal">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
      })
      .join('');

    container.innerHTML = `
      <div class="card shadow-sm border-0">
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead class="table-light small text-muted text-uppercase">
              <tr>
                <th>Strategic Objective</th>
                <th>Alignment Scope</th>
                <th>Current Progress</th>
                <th>Status</th>
                <th>Owner</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('.edit-goal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const g = this.goals.find((item) => item.id === id);
        if (g) this.openGoalModal(g);
      });
    });

    container.querySelectorAll('.delete-goal-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this strategic goal?')) {
          await GoalService.deleteGoal(id);
          this.goals = this.goals.filter((item) => item.id !== id);
          this.render();
          if (this.app) this.app.showToast('Goal deleted', 'success');
        }
      });
    });
  },

  openPortfolioModal(portfolio = null) {
    const isEdit = !!portfolio;
    const modalHtml = `
      <div class="modal fade" id="portfolioModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-light">
              <h5 class="modal-title fw-bold text-primary">${isEdit ? 'Edit Strategic Portfolio' : 'Create Strategic Portfolio'}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
              <form id="portfolioForm">
                <div class="row g-3">
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Portfolio Code *</label>
                    <input type="text" class="form-control form-control-sm" id="pf-code" value="${portfolio?.code || `PORT-${Date.now().toString().slice(-4)}`}" required />
                  </div>
                  <div class="col-md-8">
                    <label class="form-label small fw-semibold">Portfolio Name *</label>
                    <input type="text" class="form-control form-control-sm" id="pf-name" value="${portfolio?.name || ''}" placeholder="e.g., Enterprise Core & Infrastructure" required />
                  </div>
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Description</label>
                    <textarea class="form-control form-control-sm" id="pf-desc" rows="3" placeholder="Strategic focus and business objectives">${portfolio?.description || ''}</textarea>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Portfolio Owner</label>
                    <select class="form-select form-select-sm" id="pf-owner">
                      ${this.users.map((u) => `<option value="${u.id}" ${portfolio?.ownerId === u.id ? 'selected' : ''}>${u.firstName} ${u.lastName} (${u.role})</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label small fw-semibold">Status</label>
                    <select class="form-select form-select-sm" id="pf-status">
                      <option value="active" ${portfolio?.status === 'active' ? 'selected' : ''}>Active</option>
                      <option value="on-hold" ${portfolio?.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
                      <option value="completed" ${portfolio?.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label small fw-semibold">Health</label>
                    <select class="form-select form-select-sm" id="pf-health">
                      <option value="healthy" ${portfolio?.health === 'healthy' ? 'selected' : ''}>Healthy</option>
                      <option value="at-risk" ${portfolio?.health === 'at-risk' ? 'selected' : ''}>At Risk</option>
                      <option value="critical" ${portfolio?.health === 'critical' ? 'selected' : ''}>Critical</option>
                    </select>
                  </div>
                </div>
                <div class="modal-footer px-0 pb-0 mt-4 border-top pt-3">
                  <button type="button" class="btn btn-sm btn-light border" data-bs-dismiss="modal">Cancel</button>
                  <button type="submit" class="btn btn-sm btn-primary px-4">${isEdit ? 'Save Changes' : 'Create Portfolio'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('portfolioModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('portfolioModal');
    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();

    document.getElementById('portfolioForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ownerSelect = document.getElementById('pf-owner');
      const selectedUser = this.users.find((u) => u.id === ownerSelect.value);

      const payload = {
        code: document.getElementById('pf-code').value.trim(),
        name: document.getElementById('pf-name').value.trim(),
        description: document.getElementById('pf-desc').value.trim(),
        ownerId: ownerSelect.value,
        ownerName: selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : 'Surya Prashanth',
        status: document.getElementById('pf-status').value,
        health: document.getElementById('pf-health').value,
      };

      try {
        if (isEdit) {
          const updated = await PortfolioService.updatePortfolio(portfolio.id, payload);
          const idx = this.portfolios.findIndex((p) => p.id === portfolio.id);
          if (idx >= 0) this.portfolios[idx] = updated;
          if (this.app) this.app.showToast('Portfolio updated successfully', 'success');
        } else {
          const created = await PortfolioService.createPortfolio(payload);
          this.portfolios.unshift(created);
          if (this.app) this.app.showToast('Strategic portfolio created', 'success');
        }
        bsModal.hide();
        this.render();
      } catch (err) {
        alert('Failed to save portfolio: ' + (err.message || 'Unknown error'));
      }
    });
  },

  openGoalModal(goal = null) {
    const isEdit = !!goal;
    const modalHtml = `
      <div class="modal fade" id="goalModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-light">
              <h5 class="modal-title fw-bold text-primary">${isEdit ? 'Edit Strategic Goal (OKR)' : 'Add Strategic Goal (OKR)'}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
              <form id="goalForm">
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Objective Title *</label>
                    <input type="text" class="form-control form-control-sm" id="goal-obj" value="${goal?.objective || ''}" placeholder="e.g., Deliver Zero Downtime Avionics Cloud" required />
                  </div>
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Key Result / Description</label>
                    <textarea class="form-control form-control-sm" id="goal-desc" rows="2" placeholder="Describe measurable targets">${goal?.description || ''}</textarea>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Portfolio Alignment</label>
                    <select class="form-select form-select-sm" id="goal-portfolio">
                      <option value="">No Portfolio (Global)</option>
                      ${this.portfolios.map((p) => `<option value="${p.id}" ${goal?.portfolioId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Product Alignment (Optional)</label>
                    <select class="form-select form-select-sm" id="goal-product">
                      <option value="">No Product</option>
                      ${this.products.map((p) => `<option value="${p.id}" ${goal?.productId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Target Value *</label>
                    <input type="number" class="form-control form-control-sm" id="goal-target" value="${goal?.targetValue ?? 100}" required />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Current Value</label>
                    <input type="number" class="form-control form-control-sm" id="goal-current" value="${goal?.currentValue ?? 0}" required />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Unit</label>
                    <input type="text" class="form-control form-control-sm" id="goal-unit" value="${goal?.unit || '%'}" placeholder="%, users, hrs" />
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Owner</label>
                    <select class="form-select form-select-sm" id="goal-owner">
                      ${this.users.map((u) => `<option value="${u.id}" ${goal?.ownerId === u.id ? 'selected' : ''}>${u.firstName} ${u.lastName}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Status</label>
                    <select class="form-select form-select-sm" id="goal-status">
                      <option value="draft" ${goal?.status === 'draft' ? 'selected' : ''}>Draft</option>
                      <option value="in-progress" ${goal?.status === 'in-progress' || !goal ? 'selected' : ''}>In Progress</option>
                      <option value="at-risk" ${goal?.status === 'at-risk' ? 'selected' : ''}>At Risk</option>
                      <option value="achieved" ${goal?.status === 'achieved' ? 'selected' : ''}>Achieved</option>
                    </select>
                  </div>
                </div>
                <div class="modal-footer px-0 pb-0 mt-4 border-top pt-3">
                  <button type="button" class="btn btn-sm btn-light border" data-bs-dismiss="modal">Cancel</button>
                  <button type="submit" class="btn btn-sm btn-primary px-4">${isEdit ? 'Save Changes' : 'Add Strategic Goal'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById('goalModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('goalModal');
    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();

    document.getElementById('goalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ownerSelect = document.getElementById('goal-owner');
      const selectedUser = this.users.find((u) => u.id === ownerSelect.value);

      const payload = {
        objective: document.getElementById('goal-obj').value.trim(),
        description: document.getElementById('goal-desc').value.trim(),
        portfolioId: document.getElementById('goal-portfolio').value || undefined,
        productId: document.getElementById('goal-product').value || undefined,
        targetValue: parseFloat(document.getElementById('goal-target').value) || 100,
        currentValue: parseFloat(document.getElementById('goal-current').value) || 0,
        unit: document.getElementById('goal-unit').value.trim() || '%',
        ownerId: ownerSelect.value,
        ownerName: selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : 'Surya Prashanth',
        status: document.getElementById('goal-status').value,
      };

      try {
        if (isEdit) {
          const updated = await GoalService.updateGoal(goal.id, payload);
          const idx = this.goals.findIndex((g) => g.id === goal.id);
          if (idx >= 0) this.goals[idx] = updated;
          if (this.app) this.app.showToast('Goal updated successfully', 'success');
        } else {
          const created = await GoalService.createGoal(payload);
          this.goals.unshift(created);
          if (this.app) this.app.showToast('Strategic goal added', 'success');
        }
        bsModal.hide();
        this.render();
      } catch (err) {
        alert('Failed to save goal: ' + (err.message || 'Unknown error'));
      }
    });
  },
};
