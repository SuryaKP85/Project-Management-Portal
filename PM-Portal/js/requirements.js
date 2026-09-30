/**
 * Sprint 17 — Requirements Studio workspace (foundation).
 *
 * A global list of the requirements in the caller's projects, with filters,
 * a detail panel and create / edit / status / delete actions, backed only by
 * the V2 API. The server scopes every list to the caller's projects and
 * decides who may change what; the checks here only hide controls the server
 * would refuse anyway.
 *
 * Rendering follows the Sprint 16 rules: every record-derived value goes
 * through escapeHtml; row actions are delegated data-* attributes (no inline
 * handlers); form fields are filled through element.value, never markup; and
 * toasts receive plain text.
 */

import { RequirementService } from './services/requirementService.js';
import { ProjectService } from './services/projectService.js';
import { UserService } from './services/userService.js';
import { AuthService } from './services/authService.js';
import { escapeHtml, cssToken, dataArgs, readDataArgs } from './safeHtml.js';

const TYPES = [
  { value: 'business', label: 'Business' },
  { value: 'functional', label: 'Functional' },
  { value: 'non-functional', label: 'Non-functional' },
];
const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'in-review', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'deferred', label: 'Deferred' },
];
const PRIORITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const EDIT_ROLES = ['admin', 'project-manager', 'product-manager'];
const APPROVER_ROLES = ['admin', 'project-manager', 'product-manager'];
const PAGE_SIZE = 25;

const BADGES = {
  draft: 'bg-secondary-subtle text-secondary',
  'in-review': 'bg-warning-subtle text-warning',
  approved: 'bg-success-subtle text-success',
  rejected: 'bg-danger-subtle text-danger',
  deferred: 'bg-info-subtle text-info',
  critical: 'bg-danger-subtle text-danger',
  high: 'bg-warning-subtle text-warning',
  medium: 'bg-info-subtle text-info',
  low: 'bg-secondary-subtle text-secondary',
};

/** Own keys only, so a stored value such as 'constructor' cannot reach Object.prototype. */
const own = (map, key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined);
const labelOf = (list, value) => (list.find((x) => x.value === value) || { label: value || '—' }).label;
const badge = (list, value) =>
  `<span class="badge ${own(BADGES, cssToken(value)) || 'bg-light text-dark'} border">${escapeHtml(labelOf(list, value))}</span>`;
const options = (list, { any = '' } = {}) =>
  `${any ? `<option value="">${escapeHtml(any)}</option>` : ''}${list.map((x) => `<option value="${escapeHtml(x.value)}">${escapeHtml(x.label)}</option>`).join('')}`;

const describeError = (err) => {
  const status = err && err.status;
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return (err && err.message) || 'Your role cannot make this change.';
  if (status === 404) return (err && err.message) || 'That requirement is not available to you.';
  return (err && err.message) || 'The request failed. Try again.';
};

const formatDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export const RequirementsModule = {
  app: null,
  me: null,
  users: [],
  projects: [],
  filters: { projectId: '', status: '', type: '', priority: '', ownerId: '', search: '' },
  page: 1,
  selectedId: null,
  loadSequence: 0,
  searchTimer: null,

  async init(appInstance) {
    this.app = appInstance;
    const root = document.getElementById('requirements-workspace');
    if (!root) return;
    root.innerHTML = '<p class="text-muted small" role="status"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading requirements…</p>';
    try {
      const [me, projects] = await Promise.all([AuthService.getCurrentUser(), ProjectService.getProjects()]);
      this.me = me;
      this.projects = Array.isArray(projects) ? projects : [];
    } catch (err) {
      root.innerHTML = `<p class="text-danger small" role="alert"><i class="fa-solid fa-circle-exclamation me-1"></i>${escapeHtml(describeError(err))}</p>`;
      return;
    }
    try {
      const users = await UserService.getUsers();
      this.users = Array.isArray(users) ? users : [];
    } catch {
      this.users = []; // owner names fall back to "Unknown user"; the server still validates owners
    }
    if (this.filters.projectId && !this.projects.some((p) => p.id === this.filters.projectId)) this.filters.projectId = '';
    this.renderShell();
    await this.load();
  },

  /** The shared toast renders its message as text (Sprint 16), so it is passed through unescaped. */
  toast(message, type = 'info') { this.app?.showToast(message, type); },

  project(id) { return this.projects.find((p) => p.id === id) || null; },
  projectName(id) {
    const p = this.project(id);
    return p ? `${p.name} (${p.code || p.id})` : 'Project';
  },
  userName(id) {
    if (!id) return 'Unassigned';
    const u = this.users.find((x) => x.id === id);
    return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown user' : 'Unknown user';
  },

  /** Mirrors the server rule so only usable controls are shown; the server re-checks every call. */
  canEdit(projectId) {
    if (!this.me) return false;
    if (EDIT_ROLES.includes(this.me.role)) return true;
    if (this.me.role !== 'team-member') return false;
    const p = this.project(projectId);
    return !!p && (p.managerId === this.me.id || (p.members || []).some((m) => m && m.userId === this.me.id));
  },
  canCreate() {
    return !!this.me && (EDIT_ROLES.includes(this.me.role) || this.projects.some((p) => this.canEdit(p.id)));
  },
  isApprover() { return !!this.me && APPROVER_ROLES.includes(this.me.role); },
  canDelete(r) {
    if (!this.me || r.status === 'approved') return false;
    if (this.me.role === 'admin') return true;
    const p = this.project(r.projectId);
    return !!p && APPROVER_ROLES.includes(this.me.role) && p.managerId === this.me.id;
  },
  /**
   * Status moves offered for a requirement — the server's lifecycle: draft -> in-review
   * (any editor); in-review -> approved | rejected | deferred (approvers). An approved
   * requirement returns to review only through a content edit.
   */
  statusMoves(r) {
    if (!this.canEdit(r.projectId)) return [];
    if (r.status === 'draft') return [{ status: 'in-review', label: 'Submit for review' }];
    if (r.status === 'in-review' && this.isApprover()) {
      return [{ status: 'approved', label: 'Approve' }, { status: 'rejected', label: 'Reject' }, { status: 'deferred', label: 'Defer' }];
    }
    return [];
  },

  renderShell() {
    const root = document.getElementById('requirements-workspace');
    // A fresh wrapper per render, so the delegated listener is never attached twice.
    root.innerHTML = `<div data-rq-workspace>
      <div class="enterprise-card mb-3">
        <div class="p-3 d-flex flex-wrap gap-2 align-items-end">
          <div>
            <label class="form-label small fw-semibold mb-1" for="rq-filter-project">Project</label>
            <select id="rq-filter-project" class="form-select form-select-sm" style="min-width: 220px;">
              <option value="">All my projects</option>
              ${this.projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.code || p.id)})</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label small fw-semibold mb-1" for="rq-filter-status">Status</label>
            <select id="rq-filter-status" class="form-select form-select-sm">${options(STATUSES, { any: 'All statuses' })}</select>
          </div>
          <div>
            <label class="form-label small fw-semibold mb-1" for="rq-filter-type">Type</label>
            <select id="rq-filter-type" class="form-select form-select-sm">${options(TYPES, { any: 'All types' })}</select>
          </div>
          <div>
            <label class="form-label small fw-semibold mb-1" for="rq-filter-priority">Priority</label>
            <select id="rq-filter-priority" class="form-select form-select-sm">${options(PRIORITIES, { any: 'All priorities' })}</select>
          </div>
          <div>
            <label class="form-label small fw-semibold mb-1" for="rq-filter-owner">Owner</label>
            <select id="rq-filter-owner" class="form-select form-select-sm" style="min-width: 160px;">
              <option value="">Anyone</option>
              ${this.users.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(`${u.firstName || ''} ${u.lastName || ''}`.trim())}</option>`).join('')}
            </select>
          </div>
          <div class="flex-grow-1" style="min-width: 180px;">
            <label class="form-label small fw-semibold mb-1" for="rq-filter-search">Search</label>
            <input id="rq-filter-search" type="search" class="form-control form-control-sm" maxlength="200" placeholder="Code, title, description or source">
          </div>
          <div>
            ${this.canCreate() ? '<button type="button" class="btn-enterprise btn-enterprise-primary" data-rq-action="new"><i class="fa-solid fa-plus me-1"></i> New requirement</button>' : ''}
          </div>
        </div>
      </div>
      <div class="enterprise-card">
        <div class="p-3" id="rq-list" aria-live="polite"></div>
      </div>
      <div id="rq-detail" class="mt-3" aria-live="polite"></div>
    </div>`;

    // Filter values are set through the DOM, never interpolated into markup.
    const controls = {
      projectId: '#rq-filter-project', status: '#rq-filter-status', type: '#rq-filter-type',
      priority: '#rq-filter-priority', ownerId: '#rq-filter-owner', search: '#rq-filter-search',
    };
    Object.entries(controls).forEach(([key, selector]) => {
      const el = root.querySelector(selector);
      if (!el) return;
      el.value = this.filters[key] || '';
      if (key === 'search') {
        el.addEventListener('input', () => {
          clearTimeout(this.searchTimer);
          this.searchTimer = setTimeout(() => this.setFilter('search', el.value.trim()), 300);
        });
      } else {
        el.addEventListener('change', () => this.setFilter(key, el.value));
      }
    });
    // One delegated handler for every action in the workspace.
    root.querySelector('[data-rq-workspace]').addEventListener('click', (e) => this.onClick(e));
  },

  setFilter(key, value) {
    this.filters[key] = value;
    this.page = 1;
    this.load();
  },

  async load() {
    const list = document.getElementById('rq-list');
    if (!list) return;
    const seq = ++this.loadSequence;
    list.innerHTML = '<p class="text-muted small mb-0" role="status"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading…</p>';
    try {
      const result = await RequirementService.listRequirements({ ...this.filters, page: this.page, limit: PAGE_SIZE });
      if (seq !== this.loadSequence) return;
      list.innerHTML = this.renderList(result);
      if (this.selectedId) this.showDetail(this.selectedId);
    } catch (err) {
      if (seq !== this.loadSequence) return;
      list.innerHTML = `<p class="text-danger small mb-0" role="alert"><i class="fa-solid fa-circle-exclamation me-1"></i>${escapeHtml(describeError(err))}</p>`;
    }
  },

  renderList({ items, total, page, limit }) {
    if (!items.length) {
      return `<p class="text-muted small mb-0">No requirements match these filters.${this.canCreate() ? ' Use <strong>New requirement</strong> to add one.' : ''}</p>`;
    }
    const pages = Math.max(1, Math.ceil(total / (limit || PAGE_SIZE)));
    const pager = pages > 1 ? `
      <div class="d-flex justify-content-between align-items-center mt-2 small text-muted">
        <span>Page ${escapeHtml(page)} of ${escapeHtml(pages)} · ${escapeHtml(total)} requirements</span>
        <span class="d-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline-secondary py-0" data-rq-action="page" data-args="${dataArgs(String(page - 1))}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
          <button type="button" class="btn btn-sm btn-outline-secondary py-0" data-rq-action="page" data-args="${dataArgs(String(page + 1))}" ${page >= pages ? 'disabled' : ''}>Next</button>
        </span>
      </div>` : `<p class="small text-muted mt-2 mb-0">${escapeHtml(total)} requirement${total === 1 ? '' : 's'}</p>`;
    return `
      <div class="table-responsive-container">
        <table class="table-enterprise w-100" style="font-size: 0.84rem;">
          <thead><tr><th>Code</th><th>Title</th><th>Project</th><th>Type</th><th>Status</th><th>Priority</th><th>Owner</th><th>Target</th></tr></thead>
          <tbody>
            ${items.map((r) => `
              <tr>
                <td class="text-nowrap fw-semibold">${escapeHtml(r.code)}</td>
                <td><button type="button" class="btn btn-link p-0 text-start fw-semibold" data-rq-action="open" data-args="${dataArgs(r.id)}">${escapeHtml(r.title)}</button></td>
                <td>${escapeHtml(this.projectName(r.projectId))}</td>
                <td>${escapeHtml(labelOf(TYPES, r.type))}</td>
                <td>${badge(STATUSES, r.status)}</td>
                <td>${badge(PRIORITIES, r.priority)}</td>
                <td>${escapeHtml(this.userName(r.ownerId))}</td>
                <td class="text-nowrap">${escapeHtml(formatDate(r.targetDate))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>${pager}`;
  },

  async showDetail(id) {
    const panel = document.getElementById('rq-detail');
    if (!panel) return;
    this.selectedId = id;
    panel.innerHTML = '<div class="enterprise-card"><p class="p-3 text-muted small mb-0" role="status">Loading requirement…</p></div>';
    try {
      const r = await RequirementService.getRequirement(id);
      if (this.selectedId !== id) return;
      panel.innerHTML = this.renderDetail(r);
    } catch (err) {
      panel.innerHTML = `<div class="enterprise-card"><p class="p-3 text-danger small mb-0" role="alert">${escapeHtml(describeError(err))}</p></div>`;
    }
  },

  renderDetail(r) {
    const moves = this.statusMoves(r).map((m) =>
      `<button type="button" class="btn btn-sm btn-outline-success py-0 px-2" data-rq-action="status" data-args="${dataArgs(r.id, m.status)}">${escapeHtml(m.label)}</button>`);
    const edit = this.canEdit(r.projectId)
      ? `<button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" data-rq-action="edit" data-args="${dataArgs(r.id)}">Edit</button>` : '';
    const del = this.canDelete(r)
      ? `<button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" data-rq-action="delete" data-args="${dataArgs(r.id)}" aria-label="Delete ${escapeHtml(r.code)}"><i class="fa-solid fa-trash"></i></button>` : '';
    const block = (label, value) => (value
      ? `<div class="small mb-2"><div class="fw-semibold">${escapeHtml(label)}</div><div style="white-space: pre-wrap;">${escapeHtml(value)}</div></div>` : '');
    return `
      <div class="enterprise-card">
        <div class="p-3">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
            <div>
              <h3 class="fs-6 fw-bold mb-1">${escapeHtml(r.code)} · ${escapeHtml(r.title)}</h3>
              <div class="small text-muted d-flex flex-wrap gap-2 align-items-center">
                <span>${escapeHtml(this.projectName(r.projectId))}</span>
                <span>${escapeHtml(labelOf(TYPES, r.type))}</span>
                ${badge(STATUSES, r.status)} ${badge(PRIORITIES, r.priority)}
              </div>
            </div>
            <button type="button" class="btn-close" data-rq-action="close" aria-label="Close requirement details"></button>
          </div>
          <div class="small mb-2">
            <span class="fw-semibold">Owner:</span> ${escapeHtml(this.userName(r.ownerId))}
            · <span class="fw-semibold">Target date:</span> ${escapeHtml(formatDate(r.targetDate))}
            · <span class="fw-semibold">Updated:</span> ${escapeHtml(r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—')}
          </div>
          ${block('Description', r.description)}
          ${block('Rationale', r.rationale)}
          ${block('Source', r.source)}
          ${r.status === 'approved' ? '<p class="small text-muted mb-2">Approved. Editing its content returns it to review; owner and target date can change without reopening it.</p>' : ''}
          <div class="d-flex gap-1 flex-wrap justify-content-end">${moves.join('')}${edit}${del}</div>
        </div>
      </div>`;
  },

  async onClick(e) {
    const el = e.target.closest('[data-rq-action]');
    if (!el || el.disabled) return;
    const action = el.getAttribute('data-rq-action');
    const [first, second] = readDataArgs(el);
    if (action === 'new') return this.openForm(null);
    if (action === 'page') {
      const n = Number(first);
      if (Number.isInteger(n) && n >= 1) { this.page = n; await this.load(); }
      return;
    }
    if (action === 'open') return this.showDetail(first);
    if (action === 'close') {
      this.selectedId = null;
      document.getElementById('rq-detail').textContent = '';
      return;
    }
    if (action === 'status') return this.changeStatus(first, second);
    if (action === 'edit') {
      try {
        this.openForm(await RequirementService.getRequirement(first));
      } catch (err) {
        this.toast(describeError(err), 'danger');
      }
      return;
    }
    if (action === 'delete') return this.confirmDelete(first);
  },

  async changeStatus(id, status) {
    try {
      const r = await RequirementService.updateStatus(id, status);
      this.toast(`${r.code} is now ${labelOf(STATUSES, r.status).toLowerCase()}`, 'success');
      await this.load();
    } catch (err) {
      this.toast(describeError(err), 'danger');
    }
  },

  confirmDelete(id) {
    this.app.confirmModal({
      title: 'Delete requirement',
      bodyHtml: '<p class="mb-0">Delete this requirement? This cannot be undone.</p>',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await RequirementService.deleteRequirement(id);
          if (this.selectedId === id) this.selectedId = null;
          const detail = document.getElementById('rq-detail');
          if (detail) detail.textContent = '';
          this.toast('Requirement deleted', 'success');
          await this.load();
        } catch (err) {
          this.toast(describeError(err), 'danger');
        }
      },
    });
  },

  // ------------------------------------------------------------------
  // Form (shared modal). Controls are rendered empty and filled through
  // element.value. The modal's save callback is synchronous, so the form
  // returns false to stay open and closes itself after a successful save.
  // ------------------------------------------------------------------

  field(label, id, control, hint = '') {
    return `<div class="mb-2"><label class="form-label small fw-semibold mb-1" for="${id}">${escapeHtml(label)}</label>${control}${hint ? `<div class="form-text">${escapeHtml(hint)}</div>` : ''}</div>`;
  },

  formHtml(r) {
    const editable = this.projects.filter((p) => this.canEdit(p.id) || (r && p.id === r.projectId));
    return `
      ${this.field('Project', 'rq-f-project', `<select id="rq-f-project" class="form-select form-select-sm" ${r ? 'disabled' : ''} required>${editable.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.code || p.id)})</option>`).join('')}</select>`, r ? 'A requirement stays in its project.' : '')}
      ${this.field('Title', 'rq-f-title', '<input id="rq-f-title" class="form-control form-control-sm" maxlength="255" required>')}
      <div class="row g-2">
        <div class="col-md-4">${this.field('Type', 'rq-f-type', `<select id="rq-f-type" class="form-select form-select-sm">${options(TYPES)}</select>`)}</div>
        <div class="col-md-4">${this.field('Priority', 'rq-f-priority', `<select id="rq-f-priority" class="form-select form-select-sm">${options(PRIORITIES)}</select>`)}</div>
        <div class="col-md-4">${this.field('Target date', 'rq-f-target', '<input id="rq-f-target" type="date" class="form-control form-control-sm">')}</div>
      </div>
      ${this.field('Owner', 'rq-f-owner', `<select id="rq-f-owner" class="form-select form-select-sm"><option value="">Unassigned</option>${this.users.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(`${u.firstName || ''} ${u.lastName || ''}`.trim())}</option>`).join('')}</select>`, 'The owner must be part of the project.')}
      ${this.field('Description', 'rq-f-description', '<textarea id="rq-f-description" class="form-control form-control-sm" rows="4" maxlength="10000"></textarea>')}
      ${this.field('Rationale', 'rq-f-rationale', '<textarea id="rq-f-rationale" class="form-control form-control-sm" rows="2" maxlength="5000"></textarea>', 'Why this requirement exists.')}
      ${this.field('Source', 'rq-f-source', '<input id="rq-f-source" class="form-control form-control-sm" maxlength="500" placeholder="e.g. Customer workshop, regulation, support tickets">')}
      ${r && r.status === 'approved' ? '<p class="small text-warning mb-2">This requirement is approved. Changing its title, description, type, priority, rationale or source returns it to review.</p>' : ''}
      <div id="rq-form-error" class="text-danger small mt-2" role="alert"></div>`;
  },

  fillForm(overlay, r) {
    const set = (sel, value) => { const el = overlay.querySelector(sel); if (el) el.value = value ?? ''; };
    const defaultProject = this.filters.projectId && this.canEdit(this.filters.projectId) ? this.filters.projectId : '';
    if (r) set('#rq-f-project', r.projectId);
    else if (defaultProject) set('#rq-f-project', defaultProject);
    set('#rq-f-title', r ? r.title : '');
    set('#rq-f-type', r ? r.type : 'functional');
    set('#rq-f-priority', r ? r.priority : 'medium');
    set('#rq-f-target', r ? r.targetDate : '');
    set('#rq-f-owner', r ? r.ownerId : '');
    set('#rq-f-description', r ? r.description : '');
    set('#rq-f-rationale', r ? r.rationale : '');
    set('#rq-f-source', r ? r.source : '');
  },

  collect(overlay, r) {
    const val = (sel) => overlay.querySelector(sel)?.value ?? '';
    const fields = {
      title: val('#rq-f-title').trim(),
      type: val('#rq-f-type'),
      priority: val('#rq-f-priority'),
      targetDate: val('#rq-f-target'),
      ownerId: val('#rq-f-owner'),
      description: val('#rq-f-description'),
      rationale: val('#rq-f-rationale'),
      source: val('#rq-f-source').trim(),
    };
    if (!r) fields.projectId = val('#rq-f-project');
    return fields;
  },

  openForm(record) {
    if (record ? !this.canEdit(record.projectId) : !this.canCreate()) return;
    if (!record && !this.projects.some((p) => this.canEdit(p.id))) {
      this.toast('You are not a member of any project you can add requirements to.', 'danger');
      return;
    }
    let saving = false;
    this.app.openModal(record ? `Edit ${record.code}` : 'New requirement', this.formHtml(record), (overlay) => {
      if (saving) return false;
      const errorBox = overlay.querySelector('#rq-form-error');
      const fields = this.collect(overlay, record);
      if (!fields.title) {
        errorBox.textContent = 'A title is required.';
        return false;
      }
      saving = true;
      const saveBtn = overlay.querySelector('#global-modal-save-btn');
      if (saveBtn) saveBtn.disabled = true;
      errorBox.textContent = '';
      const request = record
        ? RequirementService.updateRequirement(record.id, fields)
        : RequirementService.createRequirement(fields);
      request
        .then(async (saved) => {
          overlay.classList.remove('show');
          const reopened = record && record.status === 'approved' && saved && saved.status === 'in-review';
          this.toast(reopened ? `${saved.code} updated and returned to review` : `${record ? 'Updated' : 'Created'} ${saved ? saved.code : 'requirement'}`, 'success');
          if (saved) this.selectedId = saved.id;
          await this.load();
        })
        .catch((err) => {
          errorBox.textContent = describeError(err);
        })
        .finally(() => {
          saving = false;
          if (saveBtn) saveBtn.disabled = false;
        });
      return false;
    });
    const overlay = document.getElementById('global-modal-overlay');
    if (overlay) this.fillForm(overlay, record);
  },
};
