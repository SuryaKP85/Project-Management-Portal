/**
 * Portfolios & Strategic Goals (OKRs) Module for Surya PM Portal V2.0
 */
import { PortfolioService } from './services/portfolioService.js';
import { GoalService } from './services/goalService.js';
import { ProductService } from './services/productService.js';
import { ProjectService } from './services/projectService.js';
import { UserService } from './services/userService.js';
import { RoadmapService } from './services/roadmapService.js';

/** V2 roles permitted to create/amend roadmap items; delete is admin-only. */
const ROADMAP_WRITE_ROLES = ['admin', 'project-manager', 'product-manager'];

export const PortfoliosModule = {
  app: null,
  portfolios: [],
  goals: [],
  products: [],
  projects: [],
  users: [],
  roadmapItems: [],
  roadmapError: null,
  roadmapFilters: { productId: 'all', portfolioId: 'all', status: 'all' },
  activeTab: 'portfolios', // 'portfolios' | 'goals' | 'roadmap'
  searchQuery: '',
  // Goal <-> roadmap alignment, rebuilt from the server on every load. Both
  // directions are views of the same server response; neither is authoritative
  // on its own and neither is written back or persisted locally.
  alignment: { byRoadmapId: {}, byGoalId: {} },
  alignmentLoading: false,
  alignmentError: null,

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

      await this.loadRoadmap();
      await this.loadAlignment();
    } catch (err) {
      console.error('[PortfoliosModule] Failed loading data:', err);
    }
  },

  setupEventListeners() {
    const searchInput = document.getElementById('portfolio-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', async (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        // Roadmap search is served by the API; the other tabs filter in memory.
        if (this.activeTab === 'roadmap') await this.loadRoadmap();
        this.render();
      });
    }

    const tabPortfolios = document.getElementById('tab-btn-portfolios');
    const tabGoals = document.getElementById('tab-btn-goals');
    const tabRoadmap = document.getElementById('tab-btn-roadmap');

    if (tabPortfolios && tabGoals) {
      const tabs = [
        { el: tabPortfolios, key: 'portfolios' },
        { el: tabGoals, key: 'goals' },
        ...(tabRoadmap ? [{ el: tabRoadmap, key: 'roadmap' }] : []),
      ];

      const activate = (key) => {
        this.activeTab = key;
        tabs.forEach((t) => {
          const on = t.key === key;
          t.el.classList.toggle('active', on);
          t.el.classList.toggle('btn-primary', on);
          t.el.classList.toggle('btn-light', !on);
        });
        // Roadmap-only filter controls.
        ['roadmap-filter-product', 'roadmap-filter-portfolio', 'roadmap-filter-status'].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.classList.toggle('d-none', key !== 'roadmap');
        });
        this.render();
      };

      tabs.forEach((t) => t.el.addEventListener('click', () => activate(t.key)));
    }

    // Roadmap filter controls
    const bindRoadmapFilter = (elementId, field) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.addEventListener('change', async (e) => {
        this.roadmapFilters[field] = e.target.value;
        await this.loadRoadmap();
        this.render();
      });
    };
    bindRoadmapFilter('roadmap-filter-product', 'productId');
    bindRoadmapFilter('roadmap-filter-portfolio', 'portfolioId');
    bindRoadmapFilter('roadmap-filter-status', 'status');

    const createBtn = document.getElementById('btn-create-portfolio-item');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        if (this.activeTab === 'portfolios') {
          this.openPortfolioModal();
        } else if (this.activeTab === 'roadmap') {
          this.openRoadmapModal();
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
    } else if (this.activeTab === 'roadmap') {
      this.renderRoadmap(container);
    } else {
      this.renderGoals(container);
    }
  },

  /** True when the authenticated V2 user may create/amend roadmap items. */
  canWriteRoadmap() {
    const role = window.portalSettingsInstance?.v2User?.role;
    return ROADMAP_WRITE_ROLES.includes(role);
  },

  /** Deletion is admin-only, matching the server route. */
  canDeleteRoadmap() {
    return window.portalSettingsInstance?.v2User?.role === 'admin';
  },

  /** Loads roadmap items using the current filters. Never throws. */
  async loadRoadmap() {
    this.roadmapError = null;
    try {
      this.roadmapItems = await RoadmapService.getItems({
        productId: this.roadmapFilters.productId,
        portfolioId: this.roadmapFilters.portfolioId,
        status: this.roadmapFilters.status,
        search: this.searchQuery || undefined,
      });
    } catch (err) {
      this.roadmapItems = [];
      this.roadmapError = err;
      console.error('[PortfoliosModule] Failed loading roadmap:', err);
    }
  },

  /**
   * Rebuilds the goal <-> roadmap alignment from the server.
   *
   * The roadmap list endpoint does not carry alignment, so this walks the
   * already-loaded goals and asks the server which initiatives each one owns.
   * One sweep feeds both tabs: the Goals tab reads byGoalId, the Roadmap tab
   * reads the same response inverted into byRoadmapId. Never throws.
   */
  async loadAlignment() {
    this.alignmentLoading = true;
    this.alignmentError = null;

    const byRoadmapId = {};
    const byGoalId = {};
    let firstError = null;

    try {
      const results = await Promise.all(
        this.goals.map(async (goal) => {
          try {
            return { goal, items: await RoadmapService.getItemsForGoal(goal.id) };
          } catch (err) {
            // A single failed goal must not blank out the whole column.
            if (!firstError) firstError = err;
            console.error(`[PortfoliosModule] Failed loading alignment for ${goal.id}:`, err);
            return { goal, items: null };
          }
        })
      );

      results.forEach(({ goal, items }) => {
        if (items === null) return;
        byGoalId[goal.id] = items;
        items.forEach((item) => {
          if (!byRoadmapId[item.id]) byRoadmapId[item.id] = [];
          byRoadmapId[item.id].push(goal);
        });
      });

      this.alignment = { byRoadmapId, byGoalId };
      this.alignmentError = firstError;
    } finally {
      this.alignmentLoading = false;
    }
  },

  /** Goals aligned to an initiative, as returned by the last server sweep. */
  goalsForRoadmapItem(roadmapId) {
    return this.alignment.byRoadmapId[roadmapId] || [];
  },

  /** Initiatives aligned to a goal, or null when that goal's fetch failed. */
  initiativesForGoal(goalId) {
    return Object.prototype.hasOwnProperty.call(this.alignment.byGoalId, goalId)
      ? this.alignment.byGoalId[goalId]
      : null;
  },

  /**
   * Maps an API error onto the wording used elsewhere on this page. Returns a
   * message for the user; the caller decides where to show it.
   */
  alignmentErrorMessage(err, fallback) {
    if (!err) return fallback;
    if (err.status === 401) return 'Your session has expired. Sign in again.';
    if (err.status === 403) return 'Your role does not have access to strategic alignment.';
    if (err.status === 404) return 'That initiative or alignment no longer exists on the server.';
    if (err.code === 'TIMEOUT') return 'The server did not respond in time. Nothing was changed.';
    return err.message || fallback;
  },

  /** Populates the roadmap filter dropdowns from already-loaded reference data. */
  populateRoadmapFilters() {
    const prod = document.getElementById('roadmap-filter-product');
    if (prod && prod.options.length <= 1) {
      this.products.forEach((p) => prod.add(new Option(p.name, p.id)));
    }
    const port = document.getElementById('roadmap-filter-portfolio');
    if (port && port.options.length <= 1) {
      this.portfolios.forEach((p) => port.add(new Option(p.name, p.id)));
    }
  },

  renderRoadmap(container) {
    this.populateRoadmapFilters();

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    // Error states first: a failure must never look like an empty roadmap.
    if (this.roadmapError) {
      const status = this.roadmapError.status;
      let message = `Could not load the roadmap: ${esc(this.roadmapError.message || 'Unknown error')}`;
      let icon = 'fa-triangle-exclamation text-danger';
      if (status === 401) {
        message = 'Your secure session has expired. Sign in again to view the roadmap.';
        icon = 'fa-lock text-warning';
      } else if (status === 403) {
        message = 'You do not have permission to view the roadmap.';
        icon = 'fa-lock text-warning';
      } else if (status === 404) {
        message = 'The roadmap endpoint could not be found on the server.';
        icon = 'fa-circle-question text-secondary';
      }
      container.innerHTML = `
        <div class="card p-5 text-center shadow-sm border-0" role="alert">
          <div class="mb-3"><i class="fa-solid ${icon} fa-3x" style="opacity: 0.6;"></i></div>
          <h5 class="fw-bold">Roadmap unavailable</h5>
          <p class="text-muted mb-0">${message}</p>
        </div>
      `;
      return;
    }

    if (this.roadmapItems.length === 0) {
      container.innerHTML = `
        <div class="card p-5 text-center shadow-sm border-0">
          <div class="mb-3 text-muted"><i class="fa-solid fa-map-signs fa-3x" style="opacity: 0.4;"></i></div>
          <h5 class="fw-bold">No Roadmap Initiatives Found</h5>
          <p class="text-muted">Capture strategic initiatives and sequence them ahead of chartering delivery projects.</p>
          ${this.canWriteRoadmap() ? `
            <div class="mt-2">
              <button class="btn btn-primary btn-sm px-3" id="empty-create-roadmap-btn">
                <i class="fa-solid fa-plus me-1"></i> Add Roadmap Initiative
              </button>
            </div>` : ''}
        </div>
      `;
      const btn = document.getElementById('empty-create-roadmap-btn');
      if (btn) btn.addEventListener('click', () => this.openRoadmapModal());
      return;
    }

    const statusBadge = (s) => ({
      proposed: '<span class="badge bg-secondary text-white">Proposed</span>',
      committed: '<span class="badge bg-primary text-white">Committed</span>',
      'in-progress': '<span class="badge bg-info text-dark">In Progress</span>',
      shipped: '<span class="badge bg-success text-white">Shipped</span>',
      deferred: '<span class="badge bg-warning text-dark">Deferred</span>',
      cancelled: '<span class="badge bg-dark text-white">Cancelled</span>',
    }[s] || `<span class="badge bg-secondary text-white">${esc(s)}</span>`);

    const priorityBadge = (p) => ({
      critical: '<span class="badge bg-danger text-white">Critical</span>',
      high: '<span class="badge bg-warning text-dark">High</span>',
      medium: '<span class="badge bg-primary-subtle text-primary border">Medium</span>',
      low: '<span class="badge bg-light text-secondary border">Low</span>',
    }[p] || `<span class="badge bg-light text-secondary border">${esc(p)}</span>`);

    const canWrite = this.canWriteRoadmap();
    const canDelete = this.canDeleteRoadmap();
    const total = this.roadmapItems.length;

    // Goals carry no code field, so the badge shows the objective and exposes
    // the real goal id on hover. Nothing here is synthesised.
    const goalsCell = (item) => {
      if (this.alignmentLoading) {
        return '<span class="text-muted small fst-italic">Loading…</span>';
      }
      if (this.alignmentError) {
        return `<span class="badge bg-warning-subtle text-dark border" title="${esc(this.alignmentErrorMessage(this.alignmentError, 'Alignment unavailable'))}">
                  <i class="fa-solid fa-triangle-exclamation me-1"></i> Unavailable
                </span>`;
      }
      const goals = this.goalsForRoadmapItem(item.id);
      if (goals.length === 0) {
        return '<span class="text-muted small fst-italic">Not aligned</span>';
      }
      return `<div class="d-flex flex-wrap gap-1">${goals
        .map(
          (g) => `<span class="badge bg-light text-dark border" title="${esc(g.objective)} (${esc(g.id)})">
                    <i class="fa-solid fa-bullseye me-1 text-primary"></i>${esc(g.objective)}
                  </span>`
        )
        .join('')}</div>`;
    };

    const rowsHtml = this.roadmapItems
      .map((item, idx) => {
        // Progress is rendered exactly as the server returned it. The browser
        // performs no health/progress arithmetic of its own.
        const progressCell =
          item.progressSource === 'linked-project' && typeof item.progress === 'number'
            ? `
              <div class="d-flex justify-content-between small text-muted mb-1">
                <span title="Derived from the linked project">Linked project</span>
                <span class="fw-bold text-primary">${esc(item.progress)}%</span>
              </div>
              <div class="progress" style="height: 6px;">
                <div class="progress-bar ${item.progress >= 100 ? 'bg-success' : item.progress < 50 ? 'bg-warning' : 'bg-primary'}"
                     role="progressbar" style="width: ${Number(item.progress) || 0}%;"></div>
              </div>`
            : `
              <span class="badge bg-light text-secondary border" title="No project is linked, so progress cannot be derived">
                <i class="fa-solid fa-circle-minus me-1"></i> Not available
              </span>
              <div class="text-xs text-muted mt-1">No linked project</div>`;

        return `
        <tr data-id="${esc(item.id)}">
          <td class="text-muted small font-monospace" style="width: 90px;">
            <span class="badge bg-light text-secondary border">${esc(item.sequence)}</span>
          </td>
          <td>
            <div class="fw-bold text-dark">${esc(item.name)}</div>
            <div class="small text-muted">${esc(item.code)}${item.description ? ` &middot; ${esc(item.description)}` : ''}</div>
          </td>
          <td>${statusBadge(item.status)}</td>
          <td>${priorityBadge(item.priority)}</td>
          <td>
            ${item.productName ? `<span class="badge bg-light text-primary border"><i class="fa-solid fa-cube me-1"></i>${esc(item.productName)}</span>` : '<span class="text-muted small">&mdash;</span>'}
          </td>
          <td style="max-width: 240px;">${goalsCell(item)}</td>
          <td>
            ${item.projectName
              ? `<span class="badge bg-light text-dark border"><i class="fa-solid fa-diagram-project me-1 text-primary"></i>${esc(item.projectName)}</span>`
              : '<span class="text-muted small fst-italic">Not chartered</span>'}
          </td>
          <td class="small text-muted" style="width: 110px;">${esc(item.startDate || '—')}</td>
          <td class="small text-muted" style="width: 110px;">${esc(item.targetDate || '—')}</td>
          <td style="width: 190px;">${progressCell}</td>
          <td class="text-end" style="width: 150px;">
            ${canWrite ? `
              <button class="btn btn-sm btn-light border roadmap-up-btn" data-id="${esc(item.id)}" title="Move up" ${idx === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-up text-secondary"></i>
              </button>
              <button class="btn btn-sm btn-light border roadmap-down-btn" data-id="${esc(item.id)}" title="Move down" ${idx === total - 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-down text-secondary"></i>
              </button>
              <button class="btn btn-sm btn-light border edit-roadmap-btn" data-id="${esc(item.id)}" title="Edit initiative">
                <i class="fa-solid fa-pencil text-secondary"></i>
              </button>` : ''}
            ${canDelete ? `
              <button class="btn btn-sm btn-light border text-danger delete-roadmap-btn" data-id="${esc(item.id)}" title="Delete initiative">
                <i class="fa-solid fa-trash"></i>
              </button>` : ''}
          </td>
        </tr>`;
      })
      .join('');

    container.innerHTML = `
      ${this.alignmentError ? `
        <div class="alert alert-warning py-2 px-3 small d-flex align-items-center" role="alert">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          <span>Strategic alignment could not be loaded: ${esc(this.alignmentErrorMessage(this.alignmentError, 'Unknown error'))} The Goals column may be incomplete.</span>
        </div>` : ''}
      <div class="card shadow-sm border-0">
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead class="table-light small text-muted text-uppercase">
              <tr>
                <th>Seq</th>
                <th>Initiative</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Product</th>
                <th>Goals</th>
                <th>Project</th>
                <th>Start</th>
                <th>Target</th>
                <th>Progress</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="p-2 border-top text-xs text-muted">
          Progress is derived server-side from the linked project; initiatives without a project report no progress.
        </div>
      </div>
    `;

    container.querySelectorAll('.edit-roadmap-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = this.roadmapItems.find((i) => i.id === btn.getAttribute('data-id'));
        if (item) this.openRoadmapModal(item);
      });
    });

    container.querySelectorAll('.delete-roadmap-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const item = this.roadmapItems.find((i) => i.id === id);
        if (!confirm(`Delete roadmap initiative "${item?.name || id}"?`)) return;
        try {
          await RoadmapService.deleteItem(id);
          // The server drops the item's goal links with it, so alignment is
          // re-read rather than adjusted locally.
          await this.loadRoadmap();
          await this.loadAlignment();
          this.render();
          this.app?.showToast('Roadmap initiative deleted', 'success');
        } catch (err) {
          this.app?.showToast(
            err?.status === 403 ? 'Only administrators can delete roadmap initiatives' : `Delete failed: ${err.message}`,
            'danger'
          );
        }
      });
    });

    container.querySelectorAll('.roadmap-up-btn').forEach((btn) =>
      btn.addEventListener('click', () => this.moveRoadmapItem(btn.getAttribute('data-id'), -1))
    );
    container.querySelectorAll('.roadmap-down-btn').forEach((btn) =>
      btn.addEventListener('click', () => this.moveRoadmapItem(btn.getAttribute('data-id'), 1))
    );
  },

  /**
   * Swaps an item with its neighbour and persists the new order through the
   * existing reorder endpoint. Sequences are recomputed server-side from the
   * values submitted here.
   */
  async moveRoadmapItem(id, direction) {
    const idx = this.roadmapItems.findIndex((i) => i.id === id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= this.roadmapItems.length) return;

    const reordered = [...this.roadmapItems];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];

    const payload = reordered.map((item, position) => ({ id: item.id, sequence: (position + 1) * 10 }));

    try {
      await RoadmapService.reorder(payload);
      await this.loadRoadmap();
      this.render();
    } catch (err) {
      this.app?.showToast(
        err?.status === 403 ? 'You do not have permission to reorder the roadmap' : `Reorder failed: ${err.message}`,
        'danger'
      );
    }
  },

  /**
   * Brings server-side alignment in line with the modal's selection.
   *
   * Current links are re-read immediately before the diff, so a repeated save
   * — or a change made elsewhere since the modal opened — cannot produce a
   * duplicate relationship. Failures are collected and returned rather than
   * thrown, so one rejected link does not discard the rest of the save.
   *
   * @returns {Promise<{links: Array, failures: Array}>}
   */
  async syncGoalLinks(roadmapId, selectedGoalIds) {
    const current = await RoadmapService.getItemById(roadmapId);
    const links = current?.linkedGoals || [];

    const wanted = new Set(selectedGoalIds);
    const linkedIds = new Set(links.map((l) => l.goalId));

    const toAdd = [...wanted].filter((goalId) => !linkedIds.has(goalId));
    const toRemove = links.filter((l) => !wanted.has(l.goalId));

    const failures = [];
    for (const goalId of toAdd) {
      try {
        await RoadmapService.linkGoal(roadmapId, goalId);
      } catch (err) {
        failures.push({ action: 'link', goalId, err });
      }
    }
    for (const link of toRemove) {
      try {
        await RoadmapService.unlinkGoal(roadmapId, link.linkId);
      } catch (err) {
        failures.push({ action: 'unlink', goalId: link.goalId, err });
      }
    }

    // Report what the server actually holds now, not what was requested.
    const after = await RoadmapService.getItemById(roadmapId).catch(() => null);
    return { links: after?.linkedGoals || [], failures };
  },

  async openRoadmapModal(item = null) {
    const isEdit = !!item;
    const esc = (v) => String(v ?? '').replace(/"/g, '&quot;');
    // Goal objectives are rendered as markup here, so they need full escaping
    // rather than the attribute-only helper used for the input values above.
    const escText = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const sel = (a, b) => (a === b ? 'selected' : '');
    const canWrite = this.canWriteRoadmap();

    // Existing alignment is read per item so the modal holds the server-issued
    // link ids needed to unlink; the table's sweep does not carry them.
    let linkedGoals = [];
    let linkLoadError = null;
    if (isEdit) {
      try {
        const fresh = await RoadmapService.getItemById(item.id);
        linkedGoals = fresh?.linkedGoals || [];
      } catch (err) {
        linkLoadError = err;
        console.error('[PortfoliosModule] Failed loading alignment for modal:', err);
      }
    }
    const linkedGoalIds = new Set(linkedGoals.map((l) => l.goalId));
    // Without a trustworthy picture of current alignment, a save would look
    // like a request to remove whatever could not be read. Stay read-only.
    const canEditGoals = canWrite && !linkLoadError;

    const goalsControl = this.goals.length === 0
      ? `<div class="border rounded p-3 text-center text-muted small">
           No strategic goals have been defined yet.
         </div>`
      : `<div class="border rounded p-2" style="max-height: 150px; overflow-y: auto;">
           ${this.goals.map((g) => `
             <div class="form-check">
               <input class="form-check-input rm-goal-check" type="checkbox" value="${esc(g.id)}"
                      id="rm-goal-${esc(g.id)}" ${linkedGoalIds.has(g.id) ? 'checked' : ''}
                      ${canEditGoals ? '' : 'disabled'} />
               <label class="form-check-label small" for="rm-goal-${esc(g.id)}" title="${esc(g.id)}">
                 ${escText(g.objective)}
               </label>
             </div>`).join('')}
         </div>`;

    const modalHtml = `
      <div class="modal fade" id="roadmapModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-light">
              <h5 class="modal-title fw-bold text-primary">${isEdit ? 'Edit Roadmap Initiative' : 'Add Roadmap Initiative'}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
              <div id="roadmap-form-error" class="alert alert-danger py-2 px-3 small d-none" role="alert"></div>
              <form id="roadmapForm">
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Initiative Name *</label>
                    <input type="text" class="form-control form-control-sm" id="rm-name" value="${esc(item?.name || '')}" placeholder="e.g., Autonomous Landing Certification" required />
                  </div>
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Description</label>
                    <textarea class="form-control form-control-sm" id="rm-desc" rows="2" placeholder="What this initiative delivers">${esc(item?.description || '')}</textarea>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Status</label>
                    <select class="form-select form-select-sm" id="rm-status">
                      <option value="proposed" ${sel(item?.status, 'proposed') || (!item ? 'selected' : '')}>Proposed</option>
                      <option value="committed" ${sel(item?.status, 'committed')}>Committed</option>
                      <option value="in-progress" ${sel(item?.status, 'in-progress')}>In Progress</option>
                      <option value="shipped" ${sel(item?.status, 'shipped')}>Shipped</option>
                      <option value="deferred" ${sel(item?.status, 'deferred')}>Deferred</option>
                      <option value="cancelled" ${sel(item?.status, 'cancelled')}>Cancelled</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Priority</label>
                    <select class="form-select form-select-sm" id="rm-priority">
                      <option value="critical" ${sel(item?.priority, 'critical')}>Critical</option>
                      <option value="high" ${sel(item?.priority, 'high')}>High</option>
                      <option value="medium" ${sel(item?.priority, 'medium') || (!item ? 'selected' : '')}>Medium</option>
                      <option value="low" ${sel(item?.priority, 'low')}>Low</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Start Date</label>
                    <input type="date" class="form-control form-control-sm" id="rm-start" value="${esc(item?.startDate || '')}" />
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Target Date</label>
                    <input type="date" class="form-control form-control-sm" id="rm-target" value="${esc(item?.targetDate || '')}" />
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Portfolio Alignment</label>
                    <select class="form-select form-select-sm" id="rm-portfolio">
                      <option value="">No Portfolio</option>
                      ${this.portfolios.map((p) => `<option value="${p.id}" ${sel(item?.portfolioId, p.id)}>${p.name}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Product Alignment</label>
                    <select class="form-select form-select-sm" id="rm-product">
                      <option value="">No Product</option>
                      ${this.products.map((p) => `<option value="${p.id}" ${sel(item?.productId, p.id)}>${p.name}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Linked Project</label>
                    <select class="form-select form-select-sm" id="rm-project">
                      <option value="">Not chartered yet</option>
                      ${this.projects.map((p) => `<option value="${p.id}" ${sel(item?.projectId, p.id)}>${p.code ? `[${p.code}] ` : ''}${p.name}</option>`).join('')}
                    </select>
                    <div class="form-text text-xs">Linking a project makes progress derivable from that project.</div>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Owner</label>
                    <select class="form-select form-select-sm" id="rm-owner">
                      <option value="">Unassigned</option>
                      ${this.users.map((u) => `<option value="${u.id}" ${sel(item?.ownerId, u.id)}>${u.firstName} ${u.lastName}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-12">
                    <label class="form-label small fw-semibold">Strategic Goals (OKRs)</label>
                    ${linkLoadError ? `
                      <div class="alert alert-warning py-2 px-3 small mb-2" role="alert">
                        <i class="fa-solid fa-triangle-exclamation me-1"></i>
                        Existing alignment could not be read: ${escText(this.alignmentErrorMessage(linkLoadError, 'Unknown error'))}
                        Saving now would remove alignment that is not shown, so goal changes are disabled.
                      </div>` : ''}
                    ${goalsControl}
                    <div class="form-text text-xs">
                      ${canWrite
                        ? 'Select none, one or several goals. Alignment is saved separately after the initiative itself.'
                        : 'Your role can view strategic alignment but not change it.'}
                    </div>
                  </div>
                </div>
                <div class="modal-footer px-0 pb-0 mt-4 border-top pt-3">
                  <button type="button" class="btn btn-sm btn-light border" data-bs-dismiss="modal">Cancel</button>
                  <button type="submit" class="btn btn-sm btn-primary px-4">${isEdit ? 'Save Changes' : 'Add Initiative'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById('roadmapModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('roadmapModal');
    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();

    document.getElementById('roadmapForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBox = document.getElementById('roadmap-form-error');
      errorBox.classList.add('d-none');

      const payload = {
        name: document.getElementById('rm-name').value.trim(),
        description: document.getElementById('rm-desc').value.trim() || undefined,
        status: document.getElementById('rm-status').value,
        priority: document.getElementById('rm-priority').value,
        startDate: document.getElementById('rm-start').value || undefined,
        targetDate: document.getElementById('rm-target').value || undefined,
        portfolioId: document.getElementById('rm-portfolio').value || undefined,
        productId: document.getElementById('rm-product').value || undefined,
        projectId: document.getElementById('rm-project').value || undefined,
        ownerId: document.getElementById('rm-owner').value || undefined,
      };

      const selectedGoalIds = Array.from(
        document.querySelectorAll('#roadmapForm .rm-goal-check:checked')
      ).map((c) => c.value);

      try {
        let savedId;
        if (isEdit) {
          // Send nulls for cleared associations so the server can unset them.
          await RoadmapService.updateItem(item.id, {
            ...payload,
            portfolioId: payload.portfolioId ?? '',
            productId: payload.productId ?? '',
            projectId: payload.projectId ?? '',
            ownerId: payload.ownerId ?? '',
          });
          savedId = item.id;
          this.app?.showToast('Roadmap initiative updated', 'success');
        } else {
          const created = await RoadmapService.createItem(payload);
          savedId = created?.id;
          this.app?.showToast('Roadmap initiative added', 'success');
        }

        // Alignment is a separate resource, so it is synchronised only after
        // the item itself exists. A failure here is reported, never swallowed.
        let failures = [];
        let syncError = null;
        if (canEditGoals && savedId) {
          try {
            ({ failures } = await this.syncGoalLinks(savedId, selectedGoalIds));
          } catch (err) {
            syncError = err;
          }
        }

        // Refresh from the server first, so whatever is shown next — the table
        // behind the modal, or the modal itself — matches what was stored.
        await this.loadRoadmap();
        await this.loadAlignment();
        this.render();

        if (!syncError && failures.length === 0) {
          bsModal.hide();
          return;
        }

        // Keep the dialog open on a partial failure and re-seat the checkboxes
        // on the server's actual state rather than the attempted selection.
        const serverGoalIds = new Set(this.goalsForRoadmapItem(savedId).map((g) => g.id));
        document.querySelectorAll('#roadmapForm .rm-goal-check').forEach((c) => {
          c.checked = serverGoalIds.has(c.value);
        });

        const detail = syncError
          ? this.alignmentErrorMessage(syncError, 'Alignment could not be read back.')
          : failures
              .map((f) => {
                const goal = this.goals.find((g) => g.id === f.goalId);
                const label = goal ? goal.objective : f.goalId;
                const verb = f.action === 'link' ? 'add' : 'remove';
                return `Could not ${verb} "${label}": ${this.alignmentErrorMessage(f.err, 'Unknown error')}`;
              })
              .join(' ');

        errorBox.textContent = `The initiative was saved, but strategic alignment was not fully applied. ${detail} The selection above now reflects what the server holds.`;
        errorBox.classList.remove('d-none');
      } catch (err) {
        // Server validation and permission failures are shown in the form
        // rather than silently discarded.
        const message =
          err?.status === 403
            ? 'You do not have permission to modify the roadmap.'
            : err?.status === 401
            ? 'Your session has expired. Sign in again.'
            : err?.message || 'Could not save the roadmap initiative.';
        errorBox.textContent = message;
        errorBox.classList.remove('d-none');
      }
    });
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

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    // Initiatives come straight from GET /goals/:id/roadmap. A goal may own
    // none, one or several; the server's own codes are shown, never invented.
    const initiativesCell = (goal) => {
      if (this.alignmentLoading) {
        return '<span class="text-muted small fst-italic">Loading…</span>';
      }
      const items = this.initiativesForGoal(goal.id);
      if (items === null) {
        return `<span class="badge bg-warning-subtle text-dark border" title="${esc(this.alignmentErrorMessage(this.alignmentError, 'Alignment unavailable'))}">
                  <i class="fa-solid fa-triangle-exclamation me-1"></i> Unavailable
                </span>`;
      }
      if (items.length === 0) {
        return '<span class="text-muted small fst-italic">No initiatives</span>';
      }
      return `<div class="d-flex flex-wrap gap-1">${items
        .map(
          (i) => `<span class="badge bg-light text-dark border" title="${esc(i.name)}">
                    <i class="fa-solid fa-map-signs me-1 text-primary"></i>${esc(i.code || i.name)}
                  </span>`
        )
        .join('')}</div>`;
    };

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
          <td style="max-width: 240px;">${initiativesCell(g)}</td>
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
                <th>Initiatives</th>
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
          // Alignment is keyed on goals, so it is re-read rather than patched.
          await this.loadAlignment();
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
        await this.loadAlignment();
        this.render();
      } catch (err) {
        alert('Failed to save goal: ' + (err.message || 'Unknown error'));
      }
    });
  },
};
