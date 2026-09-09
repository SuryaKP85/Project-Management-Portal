/**
 * Products Strategy & Management Module for Surya PM Portal V2.0
 */
import { ProductService } from './services/productService.js';
import { PortfolioService } from './services/portfolioService.js';
import { TeamService } from './services/teamService.js';
import { ProjectService } from './services/projectService.js';
import { UserService } from './services/userService.js';

export const ProductsModule = {
  app: null,
  products: [],
  portfolios: [],
  teams: [],
  projects: [],
  users: [],
  searchQuery: '',
  selectedStage: 'all',
  selectedCategory: 'all',

  async init(appInstance) {
    this.app = appInstance;
    await this.loadData();
    this.setupEventListeners();
    this.render();
  },

  async loadData() {
    try {
      const [products, portfolios, teams, projects, users] = await Promise.all([
        ProductService.getProducts().catch(() => []),
        PortfolioService.getPortfolios().catch(() => []),
        TeamService.getTeams().catch(() => []),
        ProjectService.getProjects().catch(() => []),
        UserService.getUsers().catch(() => []),
      ]);

      this.products = products || [];
      this.portfolios = portfolios || [];
      this.teams = teams || [];
      this.projects = projects || [];
      this.users = users || [];
    } catch (err) {
      console.error('[ProductsModule] Failed to load data:', err);
    }
  },

  setupEventListeners() {
    const searchInp = document.getElementById('product-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.render();
      });
    }

    const stageSelect = document.getElementById('product-stage-filter');
    if (stageSelect) {
      stageSelect.addEventListener('change', (e) => {
        this.selectedStage = e.target.value;
        this.render();
      });
    }

    const createBtn = document.getElementById('btn-create-product');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.openProductModal());
    }
  },

  render() {
    const container = document.getElementById('products-content-area');
    if (!container) return;

    const filtered = this.products.filter((prod) => {
      const matchesSearch =
        prod.name?.toLowerCase().includes(this.searchQuery) ||
        prod.code?.toLowerCase().includes(this.searchQuery) ||
        prod.description?.toLowerCase().includes(this.searchQuery) ||
        prod.category?.toLowerCase().includes(this.searchQuery);

      const matchesStage = this.selectedStage === 'all' || prod.stage === this.selectedStage;
      return matchesSearch && matchesStage;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card p-5 text-center shadow-sm border-0">
          <div class="mb-3 text-muted"><i class="fa-solid fa-cube fa-3x" style="opacity: 0.4;"></i></div>
          <h5 class="fw-bold">No Products Found</h5>
          <p class="text-muted">Products represent market offerings that group projects, strategy, and dedicated development teams.</p>
          <div class="mt-2">
            <button class="btn btn-primary btn-sm px-3" id="empty-create-prod-btn">
              <i class="fa-solid fa-plus me-1"></i> Register New Product
            </button>
          </div>
        </div>
      `;
      const btn = document.getElementById('empty-create-prod-btn');
      if (btn) btn.addEventListener('click', () => this.openProductModal());
      return;
    }

    const cardsHtml = filtered
      .map((p) => {
        const port = this.portfolios.find((item) => item.id === p.portfolioId);
        const team = this.teams.find((t) => t.id === p.teamId);
        const linkedProjects = this.projects.filter((prj) => prj.productId === p.id);

        const stageBadges = {
          concept: '<span class="badge bg-secondary-subtle text-secondary border">Concept</span>',
          development: '<span class="badge bg-info-subtle text-info border">Development</span>',
          beta: '<span class="badge bg-warning-subtle text-warning border">Beta</span>',
          ga: '<span class="badge bg-success-subtle text-success border">General Availability</span>',
          sunset: '<span class="badge bg-dark text-white">Sunset</span>',
        };

        const healthBadge =
          p.health === 'healthy'
            ? '<span class="badge bg-success-subtle text-success border border-success-subtle">Healthy</span>'
            : p.health === 'at-risk'
            ? '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">At Risk</span>'
            : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Critical</span>';

        return `
        <div class="col-lg-6 col-xl-4 mb-4">
          <div class="card h-100 shadow-sm border-0 product-card">
            <div class="card-body p-4 d-flex flex-column">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span class="text-muted small fw-semibold text-uppercase tracking-wider">${p.code || 'PROD'}</span>
                  <h5 class="card-title fw-bold text-dark mb-1">${p.name}</h5>
                  <span class="badge bg-light text-secondary border small">${p.category || 'Core Platform'}</span>
                </div>
                <div class="d-flex flex-column align-items-end gap-1">
                  ${stageBadges[p.stage] || '<span class="badge bg-primary">Active</span>'}
                  ${healthBadge}
                </div>
              </div>

              <p class="card-text text-secondary small mb-3 flex-grow-1" style="min-height: 44px;">
                ${p.description || 'Enterprise product service module.'}
              </p>

              <div class="bg-light p-2 rounded-2 mb-3 small">
                <div class="d-flex justify-content-between py-1">
                  <span class="text-muted">Portfolio:</span>
                  <span class="fw-semibold text-primary">${port ? port.name : 'Standalone'}</span>
                </div>
                <div class="d-flex justify-content-between py-1 border-top">
                  <span class="text-muted">Dedicated Team:</span>
                  <span class="fw-semibold text-dark">${team ? team.name : 'Shared Resources'}</span>
                </div>
                <div class="d-flex justify-content-between py-1 border-top">
                  <span class="text-muted">Lead / Owner:</span>
                  <span class="fw-semibold text-dark">${p.ownerName || 'Surya Prashanth'}</span>
                </div>
              </div>

              <div class="border-top pt-2 mt-auto">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="small text-muted fw-semibold"><i class="fa-solid fa-diagram-project me-1 text-primary"></i> Linked Projects (${linkedProjects.length})</span>
                </div>
                <div class="d-flex flex-wrap gap-1 mb-3">
                  ${
                    linkedProjects.length > 0
                      ? linkedProjects
                          .slice(0, 3)
                          .map((prj) => `<span class="badge bg-white text-dark border small">${prj.name || prj.id}</span>`)
                          .join('') +
                        (linkedProjects.length > 3
                          ? `<span class="badge bg-light text-muted border small">+${linkedProjects.length - 3} more</span>`
                          : '')
                      : '<span class="text-muted small fst-italic">No projects linked yet</span>'
                  }
                </div>

                <div class="d-flex justify-content-end gap-1 pt-2 border-top">
                  <button class="btn btn-sm btn-light border edit-product-btn" data-id="${p.id}" title="Edit Product">
                    <i class="fa-solid fa-pencil text-secondary"></i> Edit
                  </button>
                  <button class="btn btn-sm btn-light border text-danger delete-product-btn" data-id="${p.id}" title="Delete Product">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    container.innerHTML = `<div class="row">${cardsHtml}</div>`;

    container.querySelectorAll('.edit-product-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const p = this.products.find((item) => item.id === id);
        if (p) this.openProductModal(p);
      });
    });

    container.querySelectorAll('.delete-product-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this product?')) {
          await ProductService.deleteProduct(id);
          this.products = this.products.filter((item) => item.id !== id);
          this.render();
          if (this.app) this.app.showToast('Product deleted', 'success');
        }
      });
    });
  },

  openProductModal(product = null) {
    const isEdit = !!product;
    const modalHtml = `
      <div class="modal fade" id="productModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-light">
              <h5 class="modal-title fw-bold text-primary">${isEdit ? 'Edit Product Definition' : 'Register New Enterprise Product'}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
              <form id="productForm">
                <div class="row g-3">
                  <div class="col-md-4">
                    <label class="form-label small fw-semibold">Product Code *</label>
                    <input type="text" class="form-control form-control-sm" id="prod-code" value="${product?.code || `PROD-${Date.now().toString().slice(-4)}`}" required />
                  </div>
                  <div class="col-md-8">
                    <label class="form-label small fw-semibold">Product Name *</label>
                    <input type="text" class="form-control form-control-sm" id="prod-name" value="${product?.name || ''}" placeholder="e.g., Ares Autonomous Flight Core" required />
                  </div>
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Product Description</label>
                    <textarea class="form-control form-control-sm" id="prod-desc" rows="3" placeholder="Target mission and commercial roadmap">${product?.description || ''}</textarea>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Market Category</label>
                    <input type="text" class="form-control form-control-sm" id="prod-cat" value="${product?.category || 'Mission Avionics'}" placeholder="e.g., Mission Avionics, Cloud Platform" />
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Lifecycle Stage</label>
                    <select class="form-select form-select-sm" id="prod-stage">
                      <option value="concept" ${product?.stage === 'concept' ? 'selected' : ''}>Concept / Inception</option>
                      <option value="development" ${product?.stage === 'development' ? 'selected' : ''}>Development</option>
                      <option value="beta" ${product?.stage === 'beta' ? 'selected' : ''}>Beta Testing</option>
                      <option value="ga" ${product?.stage === 'ga' || !product ? 'selected' : ''}>General Availability (GA)</option>
                      <option value="sunset" ${product?.stage === 'sunset' ? 'selected' : ''}>Sunset / Maintenance</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Associated Portfolio</label>
                    <select class="form-select form-select-sm" id="prod-portfolio">
                      <option value="">No Portfolio (Standalone)</option>
                      ${this.portfolios.map((p) => `<option value="${p.id}" ${product?.portfolioId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Assigned Delivery Team</label>
                    <select class="form-select form-select-sm" id="prod-team">
                      <option value="">Shared Resources</option>
                      ${this.teams.map((t) => `<option value="${t.id}" ${product?.teamId === t.id ? 'selected' : ''}>${t.name} (${t.department})</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Product Lead / Owner</label>
                    <select class="form-select form-select-sm" id="prod-owner">
                      ${this.users.map((u) => `<option value="${u.id}" ${product?.ownerId === u.id ? 'selected' : ''}>${u.firstName} ${u.lastName} (${u.role})</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label small fw-semibold">Health</label>
                    <select class="form-select form-select-sm" id="prod-health">
                      <option value="healthy" ${product?.health === 'healthy' ? 'selected' : ''}>Healthy</option>
                      <option value="at-risk" ${product?.health === 'at-risk' ? 'selected' : ''}>At Risk</option>
                      <option value="critical" ${product?.health === 'critical' ? 'selected' : ''}>Critical</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label small fw-semibold">Status</label>
                    <select class="form-select form-select-sm" id="prod-status">
                      <option value="active" ${product?.status === 'active' || !product ? 'selected' : ''}>Active</option>
                      <option value="on-hold" ${product?.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
                      <option value="completed" ${product?.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                  </div>
                </div>
                <div class="modal-footer px-0 pb-0 mt-4 border-top pt-3">
                  <button type="button" class="btn btn-sm btn-light border" data-bs-dismiss="modal">Cancel</button>
                  <button type="submit" class="btn btn-sm btn-primary px-4">${isEdit ? 'Save Changes' : 'Register Product'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById('productModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('productModal');
    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();

    document.getElementById('productForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ownerSelect = document.getElementById('prod-owner');
      const selectedUser = this.users.find((u) => u.id === ownerSelect.value);

      const payload = {
        code: document.getElementById('prod-code').value.trim(),
        name: document.getElementById('prod-name').value.trim(),
        description: document.getElementById('prod-desc').value.trim(),
        category: document.getElementById('prod-cat').value.trim(),
        stage: document.getElementById('prod-stage').value,
        portfolioId: document.getElementById('prod-portfolio').value || undefined,
        teamId: document.getElementById('prod-team').value || undefined,
        ownerId: ownerSelect.value,
        ownerName: selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : 'Surya Prashanth',
        health: document.getElementById('prod-health').value,
        status: document.getElementById('prod-status').value,
      };

      try {
        if (isEdit) {
          const updated = await ProductService.updateProduct(product.id, payload);
          const idx = this.products.findIndex((p) => p.id === product.id);
          if (idx >= 0) this.products[idx] = updated;
          if (this.app) this.app.showToast('Product updated successfully', 'success');
        } else {
          const created = await ProductService.createProduct(payload);
          this.products.unshift(created);
          if (this.app) this.app.showToast('Product created successfully', 'success');
        }
        bsModal.hide();
        this.render();
      } catch (err) {
        alert('Failed to save product: ' + (err.message || 'Unknown error'));
      }
    });
  },
};
