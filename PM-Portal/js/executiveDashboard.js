/**
 * Executive Overview (Sprint 11.1B) — V2 server-backed page.
 *
 * Separate from the V1.1 Executive Dashboard (dashboard.js / #page-dashboard),
 * which is untouched. Everything shown here is rendered exactly as returned by
 * GET /api/v1/executive/overview: this module performs no health scoring, no
 * band assignment, no progress arithmetic, no alignment or governance logic
 * and no role checks. Filters reload the endpoint rather than filtering data
 * already in the browser.
 */
import { ExecutiveService } from './services/executiveService.js';

/** Full HTML escaping for values rendered as markup text. */
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** Display order for server-provided health bands; values come from the server. */
const HEALTH_BANDS = ['Excellent', 'Healthy', 'Monitor', 'At Risk', 'Critical'];
const BAND_CLASS = {
  Excellent: 'bg-success text-white',
  Healthy: 'bg-success-subtle text-success',
  Monitor: 'bg-primary-subtle text-primary',
  'At Risk': 'bg-warning text-dark',
  Critical: 'bg-danger text-white',
};
const STATUS_LABEL = {
  planning: 'Planning',
  'in-progress': 'In Progress',
  'awaiting-sow-sign-off': 'Awaiting SOW',
  'on-hold': 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
  proposed: 'Proposed',
  committed: 'Committed',
  shipped: 'Shipped',
  deferred: 'Deferred',
  cancelled: 'Cancelled',
  'not-started': 'Not Started',
  achieved: 'Achieved',
  missed: 'Missed',
};
const label = (key) => STATUS_LABEL[key] || String(key);

export const ExecutiveOverviewModule = {
  app: null,
  overview: null,
  error: null,
  loading: false,
  filters: { portfolioId: '', productId: '' },
  // Option labels remembered from broader loads so the selectors keep every
  // choice visible after the server narrows the response. Labels only —
  // no metric is ever taken from a cached response.
  portfolioOptions: [],
  productOptionsByPortfolio: {},
  listenersBound: false,

  async init(appInstance) {
    this.app = appInstance;
    this.bindListeners();
    await this.load();
  },

  bindListeners() {
    if (this.listenersBound) return;
    this.listenersBound = true;

    const portfolioSelect = document.getElementById('executive-filter-portfolio');
    const productSelect = document.getElementById('executive-filter-product');
    const refreshBtn = document.getElementById('executive-refresh-btn');

    if (portfolioSelect) {
      portfolioSelect.addEventListener('change', async (e) => {
        this.filters.portfolioId = e.target.value;
        // A product belongs to one portfolio, so a portfolio change resets it.
        this.filters.productId = '';
        await this.load();
      });
    }
    if (productSelect) {
      productSelect.addEventListener('change', async (e) => {
        this.filters.productId = e.target.value;
        await this.load();
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.load());
    }
  },

  /** Reloads from the server. Never throws; failures are kept for render(). */
  async load() {
    this.loading = true;
    this.error = null;
    this.render();
    try {
      this.overview = await ExecutiveService.getOverview({
        portfolioId: this.filters.portfolioId || undefined,
        productId: this.filters.productId || undefined,
      });
      this.rememberOptions(this.overview);
    } catch (err) {
      this.overview = null;
      this.error = err;
      console.error('[ExecutiveOverview] Failed loading overview:', err);
    } finally {
      this.loading = false;
      this.render();
    }
  },

  rememberOptions(overview) {
    if (!overview || !Array.isArray(overview.portfolios)) return;
    if (!this.filters.portfolioId) {
      this.portfolioOptions = overview.portfolios.map((p) => ({ id: p.id, name: p.name, code: p.code }));
    }
    if (!this.filters.productId) {
      overview.portfolios.forEach((p) => {
        this.productOptionsByPortfolio[p.id] = (p.products || []).map((pr) => ({ id: pr.id, name: pr.name, code: pr.code }));
      });
    }
  },

  /** Rebuilds both selectors from remembered labels, preserving the current choice. */
  syncFilters() {
    const portfolioSelect = document.getElementById('executive-filter-portfolio');
    const productSelect = document.getElementById('executive-filter-product');
    if (portfolioSelect) {
      const options = ['<option value="">All Portfolios</option>']
        .concat(this.portfolioOptions.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`));
      portfolioSelect.innerHTML = options.join('');
      portfolioSelect.value = this.filters.portfolioId;
    }
    if (productSelect) {
      const scopeIds = this.filters.portfolioId ? [this.filters.portfolioId] : Object.keys(this.productOptionsByPortfolio);
      const products = scopeIds.flatMap((id) => this.productOptionsByPortfolio[id] || []);
      const options = ['<option value="">All Products</option>']
        .concat(products.map((pr) => `<option value="${escapeHtml(pr.id)}">${escapeHtml(pr.name)}</option>`));
      productSelect.innerHTML = options.join('');
      productSelect.value = this.filters.productId;
      productSelect.disabled = products.length === 0;
    }
  },

  render() {
    const container = document.getElementById('executive-content-area');
    if (!container) return;
    this.syncFilters();

    if (this.loading) {
      container.innerHTML = `
        <div class="card p-5 text-center shadow-sm border-0" aria-busy="true">
          <div class="spinner-border text-primary mb-3 mx-auto" role="status"><span class="visually-hidden">Loading</span></div>
          <p class="text-muted mb-0">Loading executive overview from the server…</p>
        </div>`;
      return;
    }

    if (this.error) {
      container.innerHTML = this.renderError(this.error);
      const resetBtn = document.getElementById('executive-reset-filters-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
          this.filters = { portfolioId: '', productId: '' };
          await this.load();
        });
      }
      return;
    }

    if (!this.overview) {
      container.innerHTML = this.emptyCard('fa-chart-line', 'No data', 'The server returned no overview.');
      return;
    }

    const o = this.overview;
    container.innerHTML = [
      this.renderHeadline(o),
      this.renderHealthDistribution(o),
      this.renderStrategy(o),
      this.renderGovernance(o),
      this.renderHierarchy(o),
      this.renderActivity(o),
      `<div class="text-xs text-muted mt-2">Generated ${escapeHtml(o.meta?.generatedAt || '')} · Health model: ${escapeHtml(o.meta?.healthModel || '—')} · All figures aggregated server-side (${escapeHtml(o.meta?.basis || '')}).</div>`,
    ].join('');
  },

  renderError(err) {
    const status = err?.status;
    let title = 'Executive overview unavailable';
    let message = `Could not load the overview: ${escapeHtml(err?.message || 'Unknown error')}`;
    let icon = 'fa-triangle-exclamation text-danger';
    let showReset = false;
    if (status === 401) {
      title = 'Session expired';
      message = 'Your secure session has expired. Sign in again to view the executive overview.';
      icon = 'fa-lock text-warning';
    } else if (status === 403) {
      title = 'Access denied';
      message = 'You do not have permission to view the executive overview.';
      icon = 'fa-lock text-warning';
    } else if (status === 404) {
      title = 'Scope not found';
      message = 'The selected portfolio or product no longer exists on the server.';
      icon = 'fa-circle-question text-secondary';
      showReset = true;
    } else if (err?.code === 'TIMEOUT') {
      message = 'The server did not respond in time.';
    }
    return `
      <div class="card p-5 text-center shadow-sm border-0" role="alert">
        <div class="mb-3"><i class="fa-solid ${icon} fa-3x" style="opacity: 0.6;"></i></div>
        <h5 class="fw-bold">${title}</h5>
        <p class="text-muted mb-0">${message}</p>
        ${showReset ? '<div class="mt-3"><button class="btn btn-sm btn-primary px-3" id="executive-reset-filters-btn">Clear filters</button></div>' : ''}
      </div>`;
  },

  emptyCard(icon, title, text) {
    return `
      <div class="card p-5 text-center shadow-sm border-0">
        <div class="mb-3 text-muted"><i class="fa-solid ${icon} fa-3x" style="opacity: 0.4;"></i></div>
        <h5 class="fw-bold">${escapeHtml(title)}</h5>
        <p class="text-muted mb-0">${escapeHtml(text)}</p>
      </div>`;
  },

  kpiCard(title, valueHtml, subtitle, tone = 'primary', icon = 'fa-chart-simple') {
    return `
      <div class="kpi-card" style="border: 1px solid var(--border-color); border-radius: var(--border-radius-md); background-color: var(--bg-card);">
        <div class="kpi-header">
          <span class="kpi-title">${escapeHtml(title)}</span>
          <div class="kpi-icon-wrapper kpi-icon-${tone}"><i class="fa-solid ${icon}"></i></div>
        </div>
        <div>
          <h3 class="kpi-value mb-0">${valueHtml}</h3>
          <div class="text-xs text-secondary mt-1">${escapeHtml(subtitle)}</div>
        </div>
      </div>`;
  },

  /** Health card content decided solely by the server's completeness flags. */
  healthValue(health) {
    if (!health || health.computedFor === 0 && health.complete) {
      return { value: '<span class="text-muted">—</span>', subtitle: 'No projects to score' };
    }
    if (health.complete && health.averageScore !== null && health.averageScore !== undefined) {
      return { value: `${escapeHtml(health.averageScore)}`, subtitle: `Average of ${escapeHtml(health.computedFor)} scored project(s)` };
    }
    return {
      value: '<span class="text-warning fs-6"><i class="fa-solid fa-triangle-exclamation me-1"></i>Health data incomplete</span>',
      subtitle: `Scored ${escapeHtml(health.computedFor)} of ${escapeHtml(this.overview?.projects?.total ?? '?')} projects — no overall score shown`,
    };
  },

  renderHeadline(o) {
    const p = o.projects;
    if (!p || p.total === 0) {
      const where = o.scope?.productId ? 'this product' : o.scope?.portfolioId ? 'this portfolio' : 'the selected scope';
      return this.emptyCard('fa-folder-open', 'No projects', `There are no projects in ${where}. Headline KPIs and health need at least one project.`);
    }
    const health = this.healthValue(p.health);
    const statuses = Object.entries(p.byStatus || {})
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `<span class="badge bg-light text-dark border me-1 mb-1">${escapeHtml(label(s))}: ${escapeHtml(n)}</span>`)
      .join('');
    const cards = [
      this.kpiCard('Total Projects', escapeHtml(p.total), `${escapeHtml(o.scope?.projectsInScope ?? p.total)} in scope`, 'primary', 'fa-diagram-project'),
      this.kpiCard('Average Progress', p.progress?.average === null || p.progress?.average === undefined ? '<span class="text-muted">—</span>' : `${escapeHtml(p.progress.average)}%`, 'Mean of canonical project progress', 'info', 'fa-bars-progress'),
      this.kpiCard(p.health?.complete ? 'Health Average Score' : 'Project Health', health.value, health.subtitle, p.health?.complete ? 'success' : 'warning', 'fa-heart-pulse'),
    ];
    // Budget appears only when the server included it for this caller.
    if (p.budget && typeof p.budget.total === 'number') {
      cards.push(this.kpiCard('Total Budget', escapeHtml(p.budget.total.toLocaleString()), 'Sum of project budgets in scope', 'success', 'fa-coins'));
    }
    return `
      <div class="stats-grid mb-3">${cards.join('')}</div>
      <div class="card p-3 mb-4 shadow-sm border-0">
        <div class="small text-muted text-uppercase fw-semibold mb-2">Projects by status</div>
        <div>${statuses || '<span class="text-muted small">No status data</span>'}</div>
        ${o.scope?.projectsWithoutPortfolio ? `<div class="text-xs text-muted mt-2">${escapeHtml(o.scope.projectsWithoutPortfolio)} project(s) in scope belong to no portfolio and are counted here only.</div>` : ''}
      </div>`;
  },

  renderHealthDistribution(o) {
    const health = o.projects?.health;
    if (!health || !o.projects?.total) return '';
    const rows = HEALTH_BANDS.map((band) => {
      const n = health.byBand?.[band] ?? 0;
      return `
        <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
          <span class="badge ${BAND_CLASS[band]}">${escapeHtml(band)}</span>
          <span class="fw-semibold">${escapeHtml(n)}</span>
        </div>`;
    }).join('');
    const note = health.complete
      ? `Distribution of ${escapeHtml(health.computedFor)} scored project(s).`
      : `<span class="text-warning"><i class="fa-solid fa-triangle-exclamation me-1"></i>Health data incomplete: ${escapeHtml(health.computedFor)} of ${escapeHtml(o.projects.total)} projects scored. Bands below describe scored projects only.</span>`;
    return `
      <div class="card p-3 mb-4 shadow-sm border-0">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <div class="small text-muted text-uppercase fw-semibold">Health distribution</div>
          <span class="badge bg-light text-secondary border">Health model: ${escapeHtml(o.meta?.healthModel || '—')}</span>
        </div>
        <div class="text-xs text-muted mb-2">${note}</div>
        ${rows}
      </div>`;
  },

  renderStrategy(o) {
    const s = o.strategy;
    if (!s) return '';
    if (s.goalsTotal === 0 && s.initiativesTotal === 0) {
      return this.emptyCard('fa-bullseye', 'No strategic alignment', 'No goals or roadmap initiatives are in this scope.');
    }
    const breakdown = (record) => Object.entries(record || {})
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `<span class="badge bg-light text-dark border me-1 mb-1">${escapeHtml(label(k))}: ${escapeHtml(n)}</span>`)
      .join('') || '<span class="text-muted small">None</span>';
    return `
      <div class="card p-3 mb-4 shadow-sm border-0">
        <div class="small text-muted text-uppercase fw-semibold mb-3">Strategic snapshot</div>
        <div class="row g-3">
          <div class="col-md-6">
            <div class="fw-bold mb-1"><i class="fa-solid fa-bullseye me-1 text-primary"></i>Goals / OKRs: ${escapeHtml(s.goalsTotal)}</div>
            <div>${breakdown(s.goals)}</div>
          </div>
          <div class="col-md-6">
            <div class="fw-bold mb-1"><i class="fa-solid fa-map-signs me-1 text-primary"></i>Roadmap initiatives: ${escapeHtml(s.initiativesTotal)}</div>
            <div>${breakdown(s.initiatives)}</div>
          </div>
        </div>
        <div class="stats-grid mt-3">
          ${this.kpiCard('Chartered initiatives', escapeHtml(s.charteredInitiatives), 'Initiatives linked to a project', 'success', 'fa-link')}
          ${this.kpiCard('Unchartered initiatives', escapeHtml(s.uncharteredInitiatives), 'Initiatives not yet linked to a project', 'info', 'fa-link-slash')}
          ${this.kpiCard('Projects without initiative', escapeHtml(s.projectsWithoutInitiative), 'Projects with no roadmap initiative', s.projectsWithoutInitiative > 0 ? 'warning' : 'success', 'fa-diagram-project')}
          ${this.kpiCard('Initiatives without goal', escapeHtml(s.initiativesWithoutGoal), 'Initiatives with no aligned goal', s.initiativesWithoutGoal > 0 ? 'warning' : 'success', 'fa-bullseye')}
        </div>
      </div>`;
  },

  renderGovernance(o) {
    const g = o.governance;
    if (!g) return '';
    const items = [
      ['Open Risks', g.openRisks, 'fa-shield-halved', 'danger'],
      ['Critical / High Risks', g.criticalOrHighRisks, 'fa-fire', 'danger'],
      ['Open Issues', g.openIssues, 'fa-bug', 'warning'],
      ['Blocking Dependencies', g.blockingDependencies, 'fa-link', 'warning'],
      ['At-Risk Milestones', g.atRiskMilestones, 'fa-flag', 'warning'],
      ['Upcoming Milestones', g.upcomingMilestones, 'fa-flag-checkered', 'info'],
      ['Active Releases', g.activeReleases, 'fa-rocket', 'primary'],
      ['At-Risk Releases', g.atRiskReleases, 'fa-triangle-exclamation', 'danger'],
    ];
    return `
      <div class="card p-3 mb-4 shadow-sm border-0">
        <div class="small text-muted text-uppercase fw-semibold mb-3">Governance snapshot</div>
        <div class="stats-grid">
          ${items.map(([t, v, icon, tone]) => this.kpiCard(t, escapeHtml(v ?? '—'), 'Server-side governance count', tone, icon)).join('')}
        </div>
      </div>`;
  },

  rollupCells(rollup) {
    const health = rollup.health || {};
    const healthCell = !rollup.total
      ? '<span class="text-muted">—</span>'
      : health.complete && health.averageScore !== null && health.averageScore !== undefined
        ? `<span class="fw-semibold">${escapeHtml(health.averageScore)}</span>`
        : `<span class="text-warning small" title="Scored ${escapeHtml(health.computedFor)} of ${escapeHtml(rollup.total)}">Incomplete (${escapeHtml(health.computedFor)}/${escapeHtml(rollup.total)})</span>`;
    const progress = rollup.progress?.average === null || rollup.progress?.average === undefined ? '—' : `${rollup.progress.average}%`;
    const budget = rollup.budget && typeof rollup.budget.total === 'number'
      ? `<td class="text-end">${escapeHtml(rollup.budget.total.toLocaleString())}</td>` : '';
    return `<td class="text-end">${escapeHtml(rollup.total)}</td><td class="text-end">${escapeHtml(progress)}</td><td class="text-end">${healthCell}</td>${budget}`;
  },

  renderHierarchy(o) {
    const portfolios = o.portfolios || [];
    if (portfolios.length === 0) {
      return this.emptyCard('fa-briefcase', 'No portfolios', 'No portfolios are in this scope.');
    }
    const hasBudget = !!(o.projects?.budget);
    // The stored Portfolio.health value (declaredHealth) is deliberately not
    // shown here: only server-derived rollups are presented as health.
    const rows = portfolios.map((pf) => {
      const productRows = (pf.products || []).map((pr) => `
        <tr>
          <td class="ps-4"><i class="fa-solid fa-cube me-1 text-primary"></i>${escapeHtml(pr.name)} <span class="text-muted small">${escapeHtml(pr.code)}</span> <span class="badge bg-light text-secondary border ms-1">${escapeHtml(label(pr.status))}</span></td>
          ${this.rollupCells(pr.rollup)}
        </tr>`).join('');
      return `
        <tr class="table-light">
          <td><i class="fa-solid fa-briefcase me-1 text-info"></i><span class="fw-bold">${escapeHtml(pf.name)}</span> <span class="text-muted small">${escapeHtml(pf.code)}</span> <span class="badge bg-light text-secondary border ms-1">${escapeHtml(label(pf.status))}</span></td>
          ${this.rollupCells(pf.rollup)}
        </tr>
        ${productRows || `<tr><td class="ps-4 text-muted small fst-italic" colspan="${hasBudget ? 5 : 4}">No products</td></tr>`}`;
    }).join('');
    return `
      <div class="card shadow-sm border-0 mb-4">
        <div class="p-3 border-bottom small text-muted text-uppercase fw-semibold">Portfolio → Product rollup</div>
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead class="table-light small text-muted text-uppercase">
              <tr><th>Scope</th><th class="text-end">Projects</th><th class="text-end">Avg progress</th><th class="text-end">Health avg</th>${hasBudget ? '<th class="text-end">Budget</th>' : ''}</tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="p-2 border-top text-xs text-muted">Rollups are computed server-side from canonical project data.</div>
      </div>`;
  },

  renderActivity(o) {
    const items = o.recentActivity || [];
    if (items.length === 0) {
      return this.emptyCard('fa-clock-rotate-left', 'No recent activity', 'No strategic activity has been recorded for this scope.');
    }
    return `
      <div class="card shadow-sm border-0 mb-4">
        <div class="p-3 border-bottom small text-muted text-uppercase fw-semibold">Recent strategic activity</div>
        <ul class="list-group list-group-flush">
          ${items.map((a) => `
            <li class="list-group-item d-flex justify-content-between align-items-start gap-3">
              <div>
                <div class="fw-semibold small">${escapeHtml(a.summary)}</div>
                <div class="text-xs text-muted">${escapeHtml(a.actorName)} · ${escapeHtml(a.action)} · ${escapeHtml(a.entityType)}</div>
              </div>
              <span class="text-xs text-muted text-nowrap">${escapeHtml(a.createdAt)}</span>
            </li>`).join('')}
        </ul>
      </div>`;
  },
};
