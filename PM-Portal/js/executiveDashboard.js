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
/** Fallback for statuses without an explicit label: "in-development" -> "In development", "ga" -> "GA". */
const humanize = (key) => (key === 'ga' ? 'GA' : String(key ?? '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()));
const label = (key) => STATUS_LABEL[key] || humanize(key);
/** Server timestamps are ISO strings; shown in the viewer's locale, never computed with. */
const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

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
      // A refresh never overlaps an in-flight request; filter changes still reload.
      refreshBtn.addEventListener('click', () => { if (!this.loading) this.load(); });
    }
  },

  /** Reloads from the server. Never throws; failures are kept for render(). */
  async load() {
    const refreshBtn = document.getElementById('executive-refresh-btn');
    this.loading = true;
    this.error = null;
    if (refreshBtn) refreshBtn.disabled = true;
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
      if (refreshBtn) refreshBtn.disabled = false;
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
    // Executive reading order: what is in scope, what needs attention, where,
    // then the supporting breakdowns.
    container.innerHTML = [
      this.renderScope(o),
      this.renderHeadline(o),
      this.renderInsights(o),
      this.renderHierarchy(o),
      this.renderHealthDistribution(o),
      this.renderStrategy(o),
      this.renderGovernance(o),
      this.renderActivity(o),
      `<div class="small text-muted mt-2">All figures are aggregated server-side. Health model ${escapeHtml(o.meta?.healthModel || '—')}.</div>`,
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

  /**
   * One line stating what the page shows: the scope names come from the
   * response nodes and the project count is the server's total.
   */
  renderScope(o) {
    const scope = o.scope || {};
    const portfolios = o.portfolios || [];
    const productIn = (nodes) => (nodes || []).find((pr) => pr.id === scope.productId);
    let product = null;
    let portfolio = scope.portfolioId ? portfolios.find((pf) => pf.id === scope.portfolioId) : null;
    if (scope.productId) {
      const parent = portfolios.find((pf) => productIn(pf.products));
      product = parent ? productIn(parent.products) : productIn(o.productsWithoutPortfolio);
      portfolio = portfolio || parent || null;
    }
    const parts = [];
    if (portfolio) parts.push(`Portfolio ${escapeHtml(portfolio.name)}`);
    if (product) parts.push(`Product ${escapeHtml(product.name)}`);
    const scopeText = parts.join(' › ') || (scope.productId ? 'Selected product' : 'All portfolios');
    const total = o.projects?.total ?? scope.projectsInScope ?? 0;
    return `
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 small text-muted" role="status">
        <span><i class="fa-solid fa-filter me-1"></i><span class="fw-semibold text-body">${scopeText}</span> · ${escapeHtml(total)} ${total === 1 ? 'project' : 'projects'}</span>
        <span>Updated ${escapeHtml(formatDateTime(o.meta?.generatedAt))}</span>
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
          <div class="kpi-value mb-0">${valueHtml}</div>
          <div class="small text-secondary mt-1">${escapeHtml(subtitle)}</div>
        </div>
      </div>`;
  },

  /** Health card content decided solely by the server's completeness flags. */
  healthValue(health) {
    if (!health || health.computedFor === 0 && health.complete) {
      return { value: '<span class="text-muted">—</span>', subtitle: 'No projects to score' };
    }
    if (health.complete && health.averageScore !== null && health.averageScore !== undefined) {
      // Band is supplied by the server; shown only alongside a complete average.
      const bandHtml = health.band ? ` <span class="badge ${BAND_CLASS[health.band] || 'bg-light text-secondary border'} fs-6 align-middle">${escapeHtml(health.band)}</span>` : '';
      return { value: `${escapeHtml(health.averageScore)}${bandHtml}`, subtitle: `Based on ${escapeHtml(health.computedFor)} projects · calculated from project data` };
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
      this.kpiCard('Derived Health', health.value, health.subtitle, p.health?.complete ? 'success' : 'warning', 'fa-heart-pulse'),
    ];
    // Budget appears only when the server included it for this caller.
    if (p.budget && typeof p.budget.total === 'number') {
      cards.push(this.kpiCard('Total Budget', escapeHtml(p.budget.total.toLocaleString()), 'Sum of project budgets in scope', 'success', 'fa-coins'));
    }
    return `
      <div class="stats-grid mb-3">${cards.join('')}</div>
      <div class="card p-3 mb-4 shadow-sm border-0">
        <h2 class="fs-6 small text-muted text-uppercase fw-semibold mb-2">Projects by status</h2>
        <div>${statuses || '<span class="text-muted small">No status data</span>'}</div>
        ${o.scope?.projectsWithoutPortfolio ? `<div class="small text-muted mt-2">${escapeHtml(o.scope.projectsWithoutPortfolio)} project(s) in scope belong to no portfolio and are counted here only.</div>` : ''}
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
        <h2 class="fs-6 small text-muted text-uppercase fw-semibold mb-2">Health distribution</h2>
        <div class="small text-muted mb-2">${note}</div>
        ${rows}
      </div>`;
  },

  /**
   * Sprint 11.4 — cross-project insights. Everything shown is decided by the
   * server: which projects need attention, their order, the reason labels, the
   * project counts and the bottleneck totals. This method only lays them out.
   */
  renderInsights(o) {
    const i = o.insights;
    if (!i || !o.projects?.total) return '';
    const ps = i.projectSignals || {};
    const db = i.deliveryBottlenecks || {};
    const attention = i.attentionRequired || [];
    const rows = attention.map((p) => `
          <tr>
            <td>${escapeHtml(p.projectName)} <span class="text-muted small">${escapeHtml(p.projectCode)}</span></td>
            <td><span class="badge ${BAND_CLASS[p.band] || 'bg-light text-secondary border'}">${escapeHtml(p.band)}</span> <span class="fw-semibold">${escapeHtml(p.score)}</span></td>
            <td class="text-end">${escapeHtml(p.progress)}%</td>
            <td>${(p.reasons || []).map((r) => `<span class="badge bg-light text-dark border me-1 mb-1">${escapeHtml(r)}</span>`).join('') || '<span class="text-muted small">—</span>'}</td>
          </tr>`).join('');
    const capNote = i.attentionTotal > attention.length
      ? `<div class="text-muted small mt-2" role="status">Showing ${escapeHtml(attention.length)} of ${escapeHtml(i.attentionTotal)} projects</div>`
      : '';
    const incompleteNote = i.healthComplete
      ? ''
      : `<div class="text-warning small mb-2" role="status"><i class="fa-solid fa-triangle-exclamation me-1"></i>Signals are based on scored projects only: ${escapeHtml(ps.scoredProjects)} of ${escapeHtml(ps.scopedProjects)} projects scored.</div>`;
    const attentionTable = attention.length === 0
      ? '<p class="text-muted small mb-0" role="status">No projects need attention</p>'
      : `
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <caption class="visually-hidden">Projects needing attention: derived health band and score, progress and the reasons reported by the health model</caption>
            <thead class="table-light small text-muted text-uppercase">
              <tr><th scope="col">Project</th><th scope="col">Health</th><th scope="col" class="text-end">Progress</th><th scope="col">Attention</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>${capNote}`;
    const signalSubtitle = (n) => `${escapeHtml(n ?? '—')} of ${escapeHtml(ps.scoredProjects ?? '—')} scored projects`;
    const bottleneck = (labelText, n) => `<span class="badge bg-light text-dark border me-1 mb-1">${labelText}: ${escapeHtml(n ?? '—')}</span>`;
    return `
      <div class="card p-3 mb-4 shadow-sm border-0">
        <h2 class="fs-6 small text-muted text-uppercase fw-semibold mb-3">Cross-project insights</h2>
        ${incompleteNote}
        <div class="fw-bold mb-2"><i class="fa-solid fa-triangle-exclamation me-1 text-primary"></i>Attention required</div>
        ${attentionTable}
        <div class="fw-bold mt-4 mb-2"><i class="fa-solid fa-diagram-project me-1 text-primary"></i>Project signals</div>
        <div class="stats-grid">
          ${this.kpiCard('Projects with high/critical risks', escapeHtml(ps.highCriticalRiskProjects ?? '—'), signalSubtitle(ps.highCriticalRiskProjects), 'primary', 'fa-fire')}
          ${this.kpiCard('Projects with high/critical issues', escapeHtml(ps.highCriticalIssueProjects ?? '—'), signalSubtitle(ps.highCriticalIssueProjects), 'primary', 'fa-bug')}
          ${this.kpiCard('Projects with blocking dependencies', escapeHtml(ps.blockingDependencyProjects ?? '—'), signalSubtitle(ps.blockingDependencyProjects), 'primary', 'fa-link')}
          ${this.kpiCard('Projects with blocked work', escapeHtml(ps.blockedWorkProjects ?? '—'), signalSubtitle(ps.blockedWorkProjects), 'primary', 'fa-hand')}
        </div>
        <div class="small text-muted mt-2">Project counts, one per project per category. The governance snapshot below counts records.</div>
        <div class="fw-bold mt-4 mb-2"><i class="fa-solid fa-road-barrier me-1 text-primary"></i>Delivery bottlenecks</div>
        <div>
          ${bottleneck('Blocked stories', db.blockedStories)}
          ${bottleneck('Blocked tasks', db.blockedTasks)}
          ${bottleneck('Awaiting QA', db.storiesAwaitingQa)}
          ${bottleneck('Slipped milestones', db.slippedMilestones)}
          ${bottleneck('Overdue projects', db.overdueProjects)}
        </div>
        <div class="small text-muted mt-2">Totals across scored projects. Blocked tasks are a delivery fact, not a health factor.</div>
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
    // Sprint 11.3: alignment, roadmap progress and goal rollups are all
    // server-supplied. Alignment is descriptive, so every card keeps a neutral
    // tone; nothing here is rated, ranked or banded.
    const aligned = s.alignedProjects || {};
    const withGoal = s.initiativesWithGoal || {};
    const rp = s.roadmapProgress || {};
    const dash = '<span class="text-muted">—</span>';
    const progressCard = !s.charteredInitiatives
      ? this.kpiCard('Roadmap progress', dash, 'No chartered initiatives', 'info', 'fa-road')
      : rp.average === null || rp.average === undefined
        ? this.kpiCard('Roadmap progress', dash, `Progress data unavailable for all ${escapeHtml(rp.unavailable)} chartered initiatives`, 'info', 'fa-road')
        : this.kpiCard('Roadmap progress', `${escapeHtml(rp.average)}%`, `Based on ${escapeHtml(rp.basedOn)} chartered initiatives · ${escapeHtml(rp.unavailable)} without progress data`, 'info', 'fa-road');
    const goalRows = (s.goalRollups || []).map((g) => `
          <tr>
            <td>${escapeHtml(g.goalName)}</td>
            <td><span class="badge bg-light text-dark border">${escapeHtml(label(g.status))}</span></td>
            <td class="text-end">${escapeHtml(g.initiativeCount)}</td>
            <td class="text-end">${escapeHtml(g.charteredInitiativeCount)}</td>
            <td class="text-end">${g.progress === null || g.progress === undefined
              ? '<span class="text-muted" aria-hidden="true">—</span><span class="visually-hidden">Progress unavailable</span>'
              : `${escapeHtml(g.progress)}%<div class="text-muted small">Based on ${escapeHtml(g.progressBasedOn)} chartered</div>`}</td>
          </tr>`).join('');
    const goalsTable = s.goalsTotal === 0
      ? '<div class="text-muted small mt-3">No goals in this scope.</div>'
      : `
        <div class="table-responsive mt-3">
          <table class="table table-sm align-middle mb-0">
            <caption class="visually-hidden">Goals in scope: status, linked initiatives, chartered initiatives and roadmap progress per goal</caption>
            <thead class="table-light small text-muted text-uppercase">
              <tr><th scope="col">Goal</th><th scope="col">Status</th><th scope="col" class="text-end">Initiatives</th><th scope="col" class="text-end">Chartered</th><th scope="col" class="text-end">Progress</th></tr>
            </thead>
            <tbody>${goalRows}</tbody>
          </table>
        </div>`;
    return `
      <div class="card p-3 mb-4 shadow-sm border-0">
        <h2 class="fs-6 small text-muted text-uppercase fw-semibold mb-3">Strategic snapshot</h2>
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
          ${this.kpiCard('Projects aligned', escapeHtml(aligned.aligned ?? '—'), 'Linked to at least one roadmap initiative', 'primary', 'fa-diagram-project')}
          ${this.kpiCard('Projects without alignment', escapeHtml(aligned.unaligned ?? '—'), 'No roadmap initiative points at them', 'primary', 'fa-diagram-project')}
          ${this.kpiCard('Chartered initiatives', escapeHtml(s.charteredInitiatives), 'Initiatives linked to a project', 'info', 'fa-link')}
          ${this.kpiCard('Unchartered initiatives', escapeHtml(s.uncharteredInitiatives), 'Initiatives not yet linked to a project', 'info', 'fa-link-slash')}
          ${this.kpiCard('Initiatives with goal', escapeHtml(withGoal.withGoal ?? '—'), 'Linked to at least one goal', 'info', 'fa-bullseye')}
          ${this.kpiCard('Initiatives without goal', escapeHtml(withGoal.withoutGoal ?? '—'), 'No aligned goal', 'info', 'fa-bullseye')}
          ${progressCard}
        </div>
        <div class="small text-muted mt-2">Roadmap progress is per chartered initiative and comes from each initiative's linked project. A project shared by several initiatives counts once per initiative. Alignment counts are descriptive, not a score.</div>
        ${goalsTable}
      </div>`;
  },

  renderGovernance(o) {
    const g = o.governance;
    if (!g) return '';
    // Record counts (risks, issues, dependencies, milestones, releases), as
    // distinct from the project counts in Cross-project insights.
    const items = [
      ['Open risks', g.openRisks, 'Open risk records in scope', 'fa-shield-halved', 'text-danger'],
      ['High / critical risks', g.criticalOrHighRisks, 'High / critical risk records', 'fa-fire', 'text-danger'],
      ['Open issues', g.openIssues, 'Open issue records in scope', 'fa-bug', 'text-warning'],
      ['Blocking dependencies', g.blockingDependencies, 'Blocked or at-risk dependency records', 'fa-link', 'text-warning'],
      ['At-risk milestones', g.atRiskMilestones, 'Open milestone records flagged at risk or critical', 'fa-flag', 'text-warning'],
      ['Upcoming milestones', g.upcomingMilestones, 'Open milestone records due today or later', 'fa-flag-checkered', 'text-info'],
      ['Active releases', g.activeReleases, 'Release records not yet released', 'fa-rocket', 'text-primary'],
      ['At-risk releases', g.atRiskReleases, 'Release records flagged at risk or off track', 'fa-triangle-exclamation', 'text-danger'],
    ];
    return `
      <div class="card p-3 mb-4 shadow-sm border-0">
        <h2 class="fs-6 small text-muted text-uppercase fw-semibold mb-3">Governance snapshot · record counts</h2>
        <div class="row g-2">
          ${items.map(([t, v, sub, icon, tone]) => `
          <div class="col-12 col-md-6">
            <div class="d-flex justify-content-between align-items-center border rounded px-3 py-2 h-100">
              <div>
                <div class="fw-semibold small"><i class="fa-solid ${icon} me-1 ${tone}"></i>${escapeHtml(t)}</div>
                <div class="small text-muted">${escapeHtml(sub)}</div>
              </div>
              <span class="fs-5 fw-bold ms-3">${escapeHtml(v ?? '—')}</span>
            </div>
          </div>`).join('')}
        </div>
        <div class="small text-muted mt-2">Record counts across the scope. Project counts are in Cross-project insights above.</div>
      </div>`;
  },

  /**
   * Declared health cell. The value is the hand-maintained 3-value vocabulary
   * (healthy | at-risk | critical) echoed by the server; it is rendered verbatim
   * in a neutral badge and never styled or read as a derived band.
   */
  declaredCell(declaredHealth) {
    if (!declaredHealth) {
      return '<span class="text-muted" aria-hidden="true">—</span><span class="visually-hidden">Declared health not reported</span>';
    }
    return `<span class="visually-hidden">Declared health: </span><span class="badge bg-light text-secondary border text-capitalize">${escapeHtml(declaredHealth)}</span>`;
  },

  rollupCells(rollup, declaredHtml) {
    const health = rollup.health || {};
    const healthCell = !rollup.total
      ? '<span class="text-muted" aria-hidden="true">—</span><span class="visually-hidden">No projects to score</span>'
      : health.complete && health.averageScore !== null && health.averageScore !== undefined
        ? `<span class="fw-semibold">${escapeHtml(health.averageScore)}</span>${health.band ? ` <span class="badge ${BAND_CLASS[health.band] || 'bg-light text-secondary border'}">${escapeHtml(health.band)}</span>` : ''}<div class="text-muted small">Based on ${escapeHtml(health.computedFor)} projects</div>`
        : `<span class="text-warning small">Incomplete (${escapeHtml(health.computedFor)}/${escapeHtml(rollup.total)})</span><div class="text-muted small">Scored ${escapeHtml(health.computedFor)} of ${escapeHtml(rollup.total)} — no score shown</div>`;
    const progress = rollup.progress?.average === null || rollup.progress?.average === undefined ? '—' : `${rollup.progress.average}%`;
    const budget = rollup.budget && typeof rollup.budget.total === 'number'
      ? `<td class="text-end">${escapeHtml(rollup.budget.total.toLocaleString())}</td>` : '';
    return `<td class="text-end">${escapeHtml(rollup.total)}</td><td class="text-end">${escapeHtml(progress)}</td><td class="text-end">${healthCell}</td><td class="text-end">${declaredHtml}</td>${budget}`;
  },

  renderHierarchy(o) {
    const portfolios = o.portfolios || [];
    const unassignedProducts = o.productsWithoutPortfolio || [];
    if (portfolios.length === 0 && unassignedProducts.length === 0) {
      return this.emptyCard('fa-briefcase', 'No portfolios', 'No portfolios are in this scope.');
    }
    const hasBudget = !!(o.projects?.budget);
    const columnCount = hasBudget ? 6 : 5;
    // Derived health comes from each node's server rollup. Declared health is the
    // portfolio's stored value echoed by the server; products carry none in the
    // overview contract, so their cell says so rather than inferring one.
    const productRow = (pr) => `
        <tr>
          <td class="ps-4"><i class="fa-solid fa-cube me-1 text-primary"></i>${escapeHtml(pr.name)} <span class="text-muted small">${escapeHtml(pr.code)}</span> <span class="badge bg-light text-secondary border ms-1">${escapeHtml(label(pr.status))}</span></td>
          ${this.rollupCells(pr.rollup, this.declaredCell(null))}
        </tr>`;
    const rows = portfolios.map((pf) => {
      const productRows = (pf.products || []).map(productRow).join('');
      return `
        <tr class="table-light">
          <td><i class="fa-solid fa-briefcase me-1 text-info"></i><span class="fw-bold">${escapeHtml(pf.name)}</span> <span class="text-muted small">${escapeHtml(pf.code)}</span> <span class="badge bg-light text-secondary border ms-1">${escapeHtml(label(pf.status))}</span></td>
          ${this.rollupCells(pf.rollup, this.declaredCell(pf.declaredHealth))}
        </tr>
        ${productRows || `<tr><td class="ps-4 text-muted small fst-italic" colspan="${columnCount}">No products</td></tr>`}`;
    }).join('');
    // Products the server could not place under a portfolio still roll up their
    // own projects; they are grouped after the portfolios rather than dropped.
    const unassignedRows = unassignedProducts.length === 0 ? '' : `
        <tr class="table-light">
          <td colspan="${columnCount}"><i class="fa-solid fa-cubes me-1 text-secondary"></i><span class="fw-bold">Products without portfolio</span> <span class="text-muted small">rolled up by product membership only</span></td>
        </tr>
        ${unassignedProducts.map(productRow).join('')}`;
    return `
      <div class="card shadow-sm border-0 mb-4">
        <h2 class="fs-6 p-3 border-bottom small text-muted text-uppercase fw-semibold">Portfolio → Product rollup</h2>
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <caption class="visually-hidden">Portfolio and product rollup: project count, average progress, derived health and declared health per scope</caption>
            <thead class="table-light small text-muted text-uppercase">
              <tr><th scope="col">Scope</th><th scope="col" class="text-end">Projects</th><th scope="col" class="text-end">Avg progress</th><th scope="col" class="text-end">Derived health</th><th scope="col" class="text-end">Declared health</th>${hasBudget ? '<th scope="col" class="text-end">Budget</th>' : ''}</tr>
            </thead>
            <tbody>${rows}${unassignedRows}</tbody>
          </table>
        </div>
        <div class="p-2 border-top small text-muted">Derived health is calculated from project data by the health model. Declared health is set by portfolio management. They are independent and use different scales. Product rows count every project assigned to the product, independent of the project's own portfolio.</div>
      </div>`;
  },

  renderActivity(o) {
    const items = o.recentActivity || [];
    if (items.length === 0) {
      return this.emptyCard('fa-clock-rotate-left', 'No recent activity', 'No strategic activity has been recorded for this scope.');
    }
    return `
      <div class="card shadow-sm border-0 mb-4">
        <h2 class="fs-6 p-3 border-bottom small text-muted text-uppercase fw-semibold">Recent strategic activity</h2>
        <ul class="list-group list-group-flush">
          ${items.map((a) => `
            <li class="list-group-item d-flex justify-content-between align-items-start gap-3">
              <div>
                <div class="fw-semibold small">${escapeHtml(a.summary)}</div>
                <div class="small text-muted">${escapeHtml(a.actorName)} · ${escapeHtml(a.action)} · ${escapeHtml(a.entityType)}</div>
              </div>
              <span class="small text-muted text-nowrap">${escapeHtml(formatDateTime(a.createdAt))}</span>
            </li>`).join('')}
        </ul>
      </div>`;
  },
};
