/**
 * Sprint 14 — Meetings & Follow-through workspace.
 *
 * One page with four tabs — Meetings, Action Items, Waiting For, Follow-ups —
 * backed only by the V2 API. The server scopes every list to the caller's
 * projects and decides who may create, edit, change status or delete; the
 * role checks here only hide controls the server would refuse anyway.
 * Everything user-authored is escaped before it is rendered.
 */

import { MeetingService } from './services/meetingService.js';
import { ActionItemService } from './services/actionItemService.js';
import { WaitingForService } from './services/waitingForService.js';
import { FollowUpService } from './services/followUpService.js';
import { ProjectService } from './services/projectService.js';
import { UserService } from './services/userService.js';
import { AuthService } from './services/authService.js';
import { IssueService } from './services/issueService.js';
import { RiskService } from './services/riskService.js';
import { DependencyService } from './services/dependencyService.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const WRITE_ROLES = ['admin', 'project-manager', 'product-manager'];
const DELETE_ROLES = WRITE_ROLES;
const PAGE_SIZE = 100;

const TABS = [
  { key: 'meetings', label: 'Meetings', icon: 'fa-regular fa-calendar', noun: 'meeting' },
  { key: 'action-items', label: 'Action Items', icon: 'fa-solid fa-list-check', noun: 'action item' },
  { key: 'waiting-for', label: 'Waiting For', icon: 'fa-solid fa-hourglass-half', noun: 'waiting-for item' },
  { key: 'follow-ups', label: 'Follow-ups', icon: 'fa-solid fa-reply', noun: 'follow-up' },
];

const STATUSES = {
  meetings: ['Scheduled', 'Completed', 'Cancelled'],
  'action-items': ['Open', 'In Progress', 'Blocked', 'Completed', 'Cancelled'],
  'waiting-for': ['Waiting', 'Follow-up Needed', 'Resolved', 'Cancelled'],
  'follow-ups': ['Open', 'Completed', 'Cancelled'],
};
const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];

const RELATED_TYPES = {
  meeting: 'Meeting',
  action_item: 'Action item',
  waiting_for: 'Waiting-for item',
  issue: 'Issue',
  risk: 'Risk',
  dependency: 'Dependency',
};

const BADGES = {
  Scheduled: 'bg-primary-subtle text-primary',
  Open: 'bg-info-subtle text-info',
  'In Progress': 'bg-primary-subtle text-primary',
  Blocked: 'bg-danger-subtle text-danger',
  Waiting: 'bg-warning-subtle text-warning',
  'Follow-up Needed': 'bg-danger-subtle text-danger',
  Completed: 'bg-success-subtle text-success',
  Resolved: 'bg-success-subtle text-success',
  Cancelled: 'bg-secondary-subtle text-secondary',
  Urgent: 'bg-danger-subtle text-danger',
  High: 'bg-warning-subtle text-warning',
  Medium: 'bg-info-subtle text-info',
  Low: 'bg-secondary-subtle text-secondary',
};

const badge = (value) => `<span class="badge ${BADGES[value] || 'bg-light text-dark'} border">${esc(value)}</span>`;

const describeError = (err) => {
  const status = err && err.status;
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return (err && err.message) || 'Your role cannot make this change.';
  if (status === 404) return (err && err.message) || 'That record is not available to you.';
  return (err && err.message) || 'The request failed. Try again.';
};

const formatDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
const todayStr = () => new Date().toISOString().slice(0, 10);

/** ISO instant → value for <input type="datetime-local"> in local time. */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const MeetingsModule = {
  app: null,
  me: null,
  users: [],
  projects: [],
  activeTab: 'meetings',
  projectFilter: '',
  statusFilter: '',
  selectedMeetingId: null,
  loadSequence: 0,

  async init(appInstance) {
    this.app = appInstance;
    const root = document.getElementById('meetings-workspace');
    if (!root) return;
    root.innerHTML = '<p class="text-muted small" role="status"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading meetings and follow-through…</p>';
    try {
      const [me, users, projects] = await Promise.all([
        AuthService.getCurrentUser(),
        UserService.getUsers(),
        ProjectService.getProjects(),
      ]);
      this.me = me;
      this.users = Array.isArray(users) ? users : [];
      this.projects = Array.isArray(projects) ? projects : [];
    } catch (err) {
      root.innerHTML = `<p class="text-danger small" role="alert"><i class="fa-solid fa-circle-exclamation me-1"></i>${esc(describeError(err))}</p>`;
      return;
    }
    if (this.projectFilter && !this.projects.some((p) => p.id === this.projectFilter)) this.projectFilter = '';
    this.renderShell();
    await this.loadTab();
  },

  /** The shared toast renders its message as text (Sprint 16), so it is passed through unescaped. */
  toast(message, type = 'info') { this.app?.showToast(message, type); },

  canWrite() { return !!this.me && WRITE_ROLES.includes(this.me.role); },
  canDelete() { return !!this.me && DELETE_ROLES.includes(this.me.role); },
  /** Status changes: writers, or the record's owner (the server re-checks). */
  canChangeStatus(ownerId) { return this.canWrite() || (!!this.me && this.me.role === 'team-member' && ownerId === this.me.id); },

  userName(id) {
    if (!id) return '—';
    const u = this.users.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() : 'Unknown user';
  },
  projectName(id) {
    const p = this.projects.find((x) => x.id === id);
    return p ? `${p.name} (${p.code || p.id})` : id;
  },

  renderShell() {
    const root = document.getElementById('meetings-workspace');
    const tab = TABS.find((t) => t.key === this.activeTab);
    root.innerHTML = `
      <div class="enterprise-card mb-3">
        <div class="p-3 d-flex flex-wrap gap-2 align-items-end">
          <div>
            <label class="form-label small fw-semibold mb-1" for="ft-project-filter">Project</label>
            <select id="ft-project-filter" class="form-select form-select-sm" style="min-width: 240px;">
              <option value="">All my projects</option>
              ${this.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === this.projectFilter ? 'selected' : ''}>${esc(p.name)} (${esc(p.code || p.id)})</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label small fw-semibold mb-1" for="ft-status-filter">Status</label>
            <select id="ft-status-filter" class="form-select form-select-sm" style="min-width: 170px;">
              <option value="">All statuses</option>
              ${STATUSES[this.activeTab].map((s) => `<option value="${esc(s)}" ${s === this.statusFilter ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
          </div>
          <div class="ms-auto">
            ${this.canWrite() ? `<button type="button" class="btn-enterprise btn-enterprise-primary" id="ft-new-btn"><i class="fa-solid fa-plus me-1"></i> New ${esc(tab.noun)}</button>` : ''}
          </div>
        </div>
        <div class="px-3 pb-2 d-flex flex-wrap gap-2" role="tablist" aria-label="Follow-through records">
          ${TABS.map((t) => `
            <button type="button" role="tab" class="btn btn-sm ${t.key === this.activeTab ? 'btn-primary' : 'btn-outline-secondary'}" data-ft-tab="${t.key}" aria-selected="${t.key === this.activeTab}">
              <i class="${t.icon} me-1"></i>${esc(t.label)}
            </button>`).join('')}
        </div>
      </div>
      <div class="enterprise-card">
        <div class="p-3" id="ft-tab-content" aria-live="polite"></div>
      </div>
    `;

    root.querySelectorAll('[data-ft-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.getAttribute('data-ft-tab');
        this.statusFilter = '';
        this.selectedMeetingId = null;
        this.renderShell();
        this.loadTab();
      });
    });
    root.querySelector('#ft-project-filter').addEventListener('change', (e) => {
      this.projectFilter = e.target.value;
      this.selectedMeetingId = null;
      this.loadTab();
    });
    root.querySelector('#ft-status-filter').addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.loadTab();
    });
    root.querySelector('#ft-new-btn')?.addEventListener('click', () => this.openForm(this.activeTab, null));
    // One delegated handler for every row action on the current tab.
    root.querySelector('#ft-tab-content').addEventListener('click', (e) => this.onContentClick(e));
  },

  filters() {
    return { projectId: this.projectFilter, status: this.statusFilter, limit: PAGE_SIZE };
  },

  async loadTab() {
    const content = document.getElementById('ft-tab-content');
    if (!content) return;
    const seq = ++this.loadSequence;
    content.innerHTML = '<p class="text-muted small mb-0" role="status"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading…</p>';
    try {
      let result;
      if (this.activeTab === 'meetings') result = await MeetingService.listMeetings(this.filters());
      else if (this.activeTab === 'action-items') result = await ActionItemService.listActionItems(this.filters());
      else if (this.activeTab === 'waiting-for') result = await WaitingForService.listWaitingFor(this.filters());
      else result = await FollowUpService.listFollowUps(this.filters());
      if (seq !== this.loadSequence) return;
      content.innerHTML = this.renderList(result);
      if (this.activeTab === 'meetings' && this.selectedMeetingId) this.showMeetingDetail(this.selectedMeetingId);
    } catch (err) {
      if (seq !== this.loadSequence) return;
      content.innerHTML = `<p class="text-danger small mb-0" role="alert"><i class="fa-solid fa-circle-exclamation me-1"></i>${esc(describeError(err))}</p>`;
    }
  },

  renderList({ items, total }) {
    const tab = TABS.find((t) => t.key === this.activeTab);
    if (!items.length) {
      return `<p class="text-muted small mb-0">No ${esc(tab.label.toLowerCase())} match these filters.${this.canWrite() ? ` Use <strong>New ${esc(tab.noun)}</strong> to add one.` : ''}</p>`;
    }
    const more = total > items.length ? `<p class="small text-muted mt-2 mb-0">Showing ${items.length} of ${total}. Narrow the filters to see the rest.</p>` : '';
    if (this.activeTab === 'meetings') return this.renderMeetings(items) + more;
    if (this.activeTab === 'action-items') return this.renderActionItems(items) + more;
    if (this.activeTab === 'waiting-for') return this.renderWaitingFor(items) + more;
    return this.renderFollowUps(items) + more;
  },

  rowActions(kind, item, ownerId, quick) {
    const buttons = [];
    if (quick && item.status !== quick.status && this.canChangeStatus(ownerId)) {
      buttons.push(`<button type="button" class="btn btn-sm btn-outline-success py-0 px-2" data-ft-action="status" data-ft-kind="${kind}" data-id="${esc(item.id)}" data-status="${esc(quick.status)}">${esc(quick.label)}</button>`);
    }
    if (this.canWrite()) buttons.push(`<button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" data-ft-action="edit" data-ft-kind="${kind}" data-id="${esc(item.id)}">Edit</button>`);
    if (this.canDelete()) buttons.push(`<button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" data-ft-action="delete" data-ft-kind="${kind}" data-id="${esc(item.id)}" aria-label="Delete ${esc(item.title)}"><i class="fa-solid fa-trash"></i></button>`);
    return `<div class="d-flex gap-1 justify-content-end flex-wrap">${buttons.join('')}</div>`;
  },

  renderMeetings(items) {
    return `
      <div class="table-responsive-container">
        <table class="table-enterprise w-100" style="font-size: 0.84rem;">
          <thead><tr><th>Meeting</th><th>Project</th><th>When</th><th>Organizer</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
          <tbody>
            ${items.map((m) => `
              <tr>
                <td><button type="button" class="btn btn-link p-0 text-start fw-semibold" data-ft-action="open-meeting" data-id="${esc(m.id)}">${esc(m.title)}</button>
                  <div class="small text-muted">${esc(m.participantIds.length)} participant(s)${m.location ? ` · ${esc(m.location)}` : ''}</div></td>
                <td>${esc(this.projectName(m.projectId))}</td>
                <td>${esc(formatDateTime(m.scheduledAt))}<div class="small text-muted">${esc(m.durationMinutes)} min</div></td>
                <td>${esc(this.userName(m.organizerId))}</td>
                <td>${badge(m.status)}</td>
                <td>${this.rowActions('meetings', m, m.organizerId, null)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div id="ft-meeting-detail" class="mt-3" aria-live="polite"></div>`;
  },

  renderActionItems(items, { compact = false } = {}) {
    const today = todayStr();
    return `
      <div class="table-responsive-container">
        <table class="table-enterprise w-100" style="font-size: 0.84rem;">
          <thead><tr><th>Action item</th>${compact ? '' : '<th>Project</th>'}<th>Owner</th><th>Due</th><th>Priority</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
          <tbody>
            ${items.map((a) => {
              const overdue = a.dueDate && a.dueDate < today && !['Completed', 'Cancelled'].includes(a.status);
              return `
              <tr>
                <td class="fw-semibold">${esc(a.title)}${a.description ? `<div class="small text-muted fw-normal" style="white-space: pre-wrap;">${esc(a.description)}</div>` : ''}</td>
                ${compact ? '' : `<td>${esc(this.projectName(a.projectId))}</td>`}
                <td>${esc(this.userName(a.ownerId))}</td>
                <td class="${overdue ? 'text-danger fw-semibold' : ''}">${esc(formatDate(a.dueDate))}${overdue ? ' <span class="small">(overdue)</span>' : ''}</td>
                <td>${badge(a.priority)}</td>
                <td>${badge(a.status)}</td>
                <td>${this.rowActions('action-items', a, a.ownerId, { status: 'Completed', label: 'Complete' })}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },

  waitingOnLabel(w) {
    const parts = [];
    if (w.waitingOnUserId) parts.push(this.userName(w.waitingOnUserId));
    if (w.waitingOnTeamId) parts.push(`Team ${w.waitingOnTeamId}`);
    if (w.waitingOnName) parts.push(w.waitingOnName);
    return parts.join(' · ') || '—';
  },

  renderWaitingFor(items) {
    const today = todayStr();
    return `
      <div class="table-responsive-container">
        <table class="table-enterprise w-100" style="font-size: 0.84rem;">
          <thead><tr><th>Waiting for</th><th>Project</th><th>Waiting on</th><th>Tracked by</th><th>Expected</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
          <tbody>
            ${items.map((w) => {
              const late = w.expectedDate && w.expectedDate < today && ['Waiting', 'Follow-up Needed'].includes(w.status);
              return `
              <tr>
                <td class="fw-semibold">${esc(w.title)}${w.relatedType ? `<div class="small text-muted fw-normal">About: ${esc(RELATED_TYPES[w.relatedType] || w.relatedType)}</div>` : ''}</td>
                <td>${esc(this.projectName(w.projectId))}</td>
                <td>${esc(this.waitingOnLabel(w))}</td>
                <td>${esc(this.userName(w.ownerId))}</td>
                <td class="${late ? 'text-danger fw-semibold' : ''}">${esc(formatDate(w.expectedDate))}</td>
                <td>${badge(w.status)}</td>
                <td>${this.rowActions('waiting-for', w, w.ownerId, { status: 'Resolved', label: 'Resolve' })}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },

  renderFollowUps(items) {
    const today = todayStr();
    return `
      <div class="table-responsive-container">
        <table class="table-enterprise w-100" style="font-size: 0.84rem;">
          <thead><tr><th>Follow-up</th><th>Project</th><th>Owner</th><th>Due</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
          <tbody>
            ${items.map((f) => {
              const overdue = f.dueDate && f.dueDate < today && f.status === 'Open';
              return `
              <tr>
                <td class="fw-semibold">${esc(f.title)}${f.relatedType ? `<div class="small text-muted fw-normal">About: ${esc(RELATED_TYPES[f.relatedType] || f.relatedType)}</div>` : ''}</td>
                <td>${esc(this.projectName(f.projectId))}</td>
                <td>${esc(this.userName(f.ownerId))}</td>
                <td class="${overdue ? 'text-danger fw-semibold' : ''}">${esc(formatDate(f.dueDate))}${overdue ? ' <span class="small">(overdue)</span>' : ''}</td>
                <td>${badge(f.status)}</td>
                <td>${this.rowActions('follow-ups', f, f.ownerId, { status: 'Completed', label: 'Complete' })}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },

  async showMeetingDetail(meetingId) {
    const panel = document.getElementById('ft-meeting-detail');
    if (!panel) return;
    this.selectedMeetingId = meetingId;
    panel.innerHTML = '<p class="text-muted small mb-0" role="status">Loading meeting…</p>';
    try {
      const [meeting, actions] = await Promise.all([
        MeetingService.getMeeting(meetingId),
        ActionItemService.listActionItems({ meetingId, limit: PAGE_SIZE }),
      ]);
      if (this.selectedMeetingId !== meetingId) return;
      const link = meeting.meetingLink && /^https?:\/\//i.test(meeting.meetingLink)
        ? `<a href="${esc(meeting.meetingLink)}" target="_blank" rel="noopener noreferrer">Join link</a>`
        : '';
      panel.innerHTML = `
        <div class="border rounded-3 p-3 bg-body-tertiary">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
            <div>
              <h3 class="fs-6 fw-bold mb-1">${esc(meeting.title)} ${badge(meeting.status)}</h3>
              <div class="small text-muted">${esc(this.projectName(meeting.projectId))} · ${esc(formatDateTime(meeting.scheduledAt))} · ${esc(meeting.durationMinutes)} min${meeting.location ? ` · ${esc(meeting.location)}` : ''} ${link}</div>
            </div>
            <button type="button" class="btn-close" data-ft-action="close-meeting" aria-label="Close meeting details"></button>
          </div>
          <div class="small mb-2"><span class="fw-semibold">Organizer:</span> ${esc(this.userName(meeting.organizerId))}
            · <span class="fw-semibold">Participants:</span> ${meeting.participantIds.length ? meeting.participantIds.map((id) => esc(this.userName(id))).join(', ') : 'none listed'}</div>
          ${meeting.agenda ? `<div class="small mb-2"><div class="fw-semibold">Agenda</div><div style="white-space: pre-wrap;">${esc(meeting.agenda)}</div></div>` : ''}
          ${meeting.notes ? `<div class="small mb-2"><div class="fw-semibold">Notes</div><div style="white-space: pre-wrap;">${esc(meeting.notes)}</div></div>` : ''}
          <div class="d-flex justify-content-between align-items-center mt-3 mb-2">
            <h4 class="fs-6 fw-semibold mb-0">Action items from this meeting (${esc(actions.total)})</h4>
            ${this.canWrite() ? `<button type="button" class="btn btn-sm btn-outline-primary" data-ft-action="add-meeting-action" data-id="${esc(meeting.id)}" data-project="${esc(meeting.projectId)}"><i class="fa-solid fa-plus me-1"></i>Add action item</button>` : ''}
          </div>
          ${actions.items.length ? this.renderActionItems(actions.items, { compact: true }) : '<p class="small text-muted mb-0">No action items recorded for this meeting yet.</p>'}
        </div>`;
    } catch (err) {
      panel.innerHTML = `<p class="text-danger small mb-0" role="alert">${esc(describeError(err))}</p>`;
    }
  },

  async onContentClick(e) {
    const el = e.target.closest('[data-ft-action]');
    if (!el) return;
    const action = el.getAttribute('data-ft-action');
    const id = el.getAttribute('data-id');
    const kind = el.getAttribute('data-ft-kind');
    if (action === 'open-meeting') return this.showMeetingDetail(id);
    if (action === 'close-meeting') {
      this.selectedMeetingId = null;
      document.getElementById('ft-meeting-detail').innerHTML = '';
      return;
    }
    if (action === 'add-meeting-action') {
      return this.openForm('action-items', null, { meetingId: id, projectId: el.getAttribute('data-project') });
    }
    if (action === 'status') return this.changeStatus(kind, id, el.getAttribute('data-status'));
    if (action === 'edit') {
      try {
        const record = await this.fetchRecord(kind, id);
        this.openForm(kind, record);
      } catch (err) {
        this.toast(describeError(err), 'danger');
      }
      return;
    }
    if (action === 'delete') return this.confirmDelete(kind, id);
  },

  fetchRecord(kind, id) {
    if (kind === 'meetings') return MeetingService.getMeeting(id);
    if (kind === 'action-items') return ActionItemService.getActionItem(id);
    if (kind === 'waiting-for') return WaitingForService.getWaitingForItem(id);
    return FollowUpService.getFollowUp(id);
  },

  async changeStatus(kind, id, status) {
    try {
      if (kind === 'action-items') await ActionItemService.updateStatus(id, status);
      else if (kind === 'waiting-for') await WaitingForService.updateStatus(id, status);
      else if (kind === 'follow-ups') await FollowUpService.updateStatus(id, status);
      this.toast(`Marked ${status}`, 'success');
      await this.loadTab();
    } catch (err) {
      this.toast(describeError(err), 'danger');
    }
  },

  confirmDelete(kind, id) {
    const tab = TABS.find((t) => t.key === kind);
    this.app.confirmModal({
      title: `Delete ${tab.noun}`,
      bodyHtml: `<p class="mb-0">Delete this ${esc(tab.noun)}? This cannot be undone.${kind === 'meetings' ? ' Its action items are kept and unlinked from the meeting.' : ''}</p>`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          if (kind === 'meetings') await MeetingService.deleteMeeting(id);
          else if (kind === 'action-items') await ActionItemService.deleteActionItem(id);
          else if (kind === 'waiting-for') await WaitingForService.deleteWaitingForItem(id);
          else await FollowUpService.deleteFollowUp(id);
          if (kind === 'meetings' && this.selectedMeetingId === id) this.selectedMeetingId = null;
          this.toast(`Deleted ${tab.noun}`, 'success');
          await this.loadTab();
        } catch (err) {
          this.toast(describeError(err), 'danger');
        }
      },
    });
  },

  // ------------------------------------------------------------------
  // Forms (shared modal). The modal's save callback is synchronous, so the
  // form returns false to stay open and closes itself after a successful save.
  // ------------------------------------------------------------------

  projectOptions(selected) {
    return this.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)} (${esc(p.code || p.id)})</option>`).join('');
  },

  userOptions(selected, { allowNone = false, noneLabel = 'None' } = {}) {
    const selectedIds = Array.isArray(selected) ? selected : [selected];
    return `${allowNone ? `<option value="">${esc(noneLabel)}</option>` : ''}${this.users
      .map((u) => `<option value="${esc(u.id)}" ${selectedIds.includes(u.id) ? 'selected' : ''}>${esc(`${u.firstName} ${u.lastName}`.trim())} (${esc(u.role)})</option>`)
      .join('')}`;
  },

  statusOptions(kind, selected) {
    return STATUSES[kind].map((s) => `<option value="${esc(s)}" ${s === selected ? 'selected' : ''}>${esc(s)}</option>`).join('');
  },

  field(label, id, control, hint = '') {
    return `<div class="mb-2"><label class="form-label small fw-semibold mb-1" for="${id}">${label}</label>${control}${hint ? `<div class="form-text">${hint}</div>` : ''}</div>`;
  },

  formHtml(kind, r, preset) {
    const projectId = r ? r.projectId : preset.projectId || this.projectFilter || (this.projects[0] && this.projects[0].id) || '';
    const lockedProject = !!r || !!preset.meetingId;
    const projectField = this.field('Project', 'ft-f-project',
      `<select id="ft-f-project" class="form-select form-select-sm" ${lockedProject ? 'disabled' : ''} required>${this.projectOptions(projectId)}</select>`,
      r ? 'Records stay in their project.' : '');
    const title = this.field('Title', 'ft-f-title', `<input id="ft-f-title" class="form-control form-control-sm" maxlength="255" required value="${esc(r ? r.title : '')}">`);
    const me = this.me ? this.me.id : '';
    const errorBox = '<div id="ft-form-error" class="text-danger small mt-2" role="alert"></div>';

    if (kind === 'meetings') {
      return `${projectField}${title}
        <div class="row g-2">
          <div class="col-md-6">${this.field('Date and time', 'ft-f-when', `<input id="ft-f-when" type="datetime-local" class="form-control form-control-sm" required value="${esc(r ? toLocalInput(r.scheduledAt) : '')}">`)}</div>
          <div class="col-md-3">${this.field('Minutes', 'ft-f-duration', `<input id="ft-f-duration" type="number" min="5" max="1440" step="5" class="form-control form-control-sm" value="${esc(r ? r.durationMinutes : 30)}">`)}</div>
          <div class="col-md-3">${this.field('Status', 'ft-f-status', `<select id="ft-f-status" class="form-select form-select-sm">${this.statusOptions(kind, r ? r.status : 'Scheduled')}</select>`)}</div>
        </div>
        <div class="row g-2">
          <div class="col-md-6">${this.field('Location', 'ft-f-location', `<input id="ft-f-location" class="form-control form-control-sm" maxlength="255" value="${esc(r ? r.location : '')}">`)}</div>
          <div class="col-md-6">${this.field('Meeting link', 'ft-f-link', `<input id="ft-f-link" type="url" class="form-control form-control-sm" placeholder="https://" value="${esc(r ? r.meetingLink : '')}">`)}</div>
        </div>
        ${this.field('Organizer', 'ft-f-organizer', `<select id="ft-f-organizer" class="form-select form-select-sm">${this.userOptions(r ? r.organizerId : me)}</select>`)}
        ${this.field('Participants', 'ft-f-participants', `<select id="ft-f-participants" class="form-select form-select-sm" multiple size="5">${this.userOptions(r ? r.participantIds : [])}</select>`, 'Hold Ctrl (or ⌘) to select several people. Participants must be part of the project.')}
        ${this.field('Agenda', 'ft-f-agenda', `<textarea id="ft-f-agenda" class="form-control form-control-sm" rows="3">${esc(r ? r.agenda : '')}</textarea>`)}
        ${this.field('Notes', 'ft-f-notes', `<textarea id="ft-f-notes" class="form-control form-control-sm" rows="3">${esc(r ? r.notes : '')}</textarea>`)}
        ${errorBox}`;
    }

    const owner = this.field(kind === 'waiting-for' ? 'Tracked by' : 'Owner', 'ft-f-owner', `<select id="ft-f-owner" class="form-select form-select-sm">${this.userOptions(r ? r.ownerId : me)}</select>`);
    const description = this.field('Description', 'ft-f-description', `<textarea id="ft-f-description" class="form-control form-control-sm" rows="3">${esc(r ? r.description : '')}</textarea>`);
    const status = this.field('Status', 'ft-f-status', `<select id="ft-f-status" class="form-select form-select-sm">${this.statusOptions(kind, r ? r.status : STATUSES[kind][0])}</select>`);

    if (kind === 'action-items') {
      return `${projectField}${title}
        <div class="row g-2">
          <div class="col-md-6">${owner}</div>
          <div class="col-md-6">${this.field('Due date', 'ft-f-due', `<input id="ft-f-due" type="date" class="form-control form-control-sm" value="${esc(r ? r.dueDate : '')}">`)}</div>
        </div>
        <div class="row g-2">
          <div class="col-md-6">${this.field('Priority', 'ft-f-priority', `<select id="ft-f-priority" class="form-select form-select-sm">${PRIORITIES.map((p) => `<option value="${p}" ${p === (r ? r.priority : 'Medium') ? 'selected' : ''}>${p}</option>`).join('')}</select>`)}</div>
          <div class="col-md-6">${status}</div>
        </div>
        ${this.field('From meeting', 'ft-f-meeting', `<select id="ft-f-meeting" class="form-select form-select-sm" ${preset.meetingId ? 'disabled' : ''}><option value="">Loading meetings…</option></select>`)}
        ${description}${errorBox}`;
    }

    const related = `
      <div class="row g-2">
        <div class="col-md-5">${this.field('Related to', 'ft-f-related-type', `<select id="ft-f-related-type" class="form-select form-select-sm"><option value="">Nothing specific</option>${Object.entries(RELATED_TYPES)
          .filter(([key]) => !(kind === 'waiting-for' && key === 'waiting_for'))
          .map(([key, label]) => `<option value="${key}" ${r && r.relatedType === key ? 'selected' : ''}>${label}</option>`).join('')}</select>`)}</div>
        <div class="col-md-7">${this.field('Record', 'ft-f-related-id', `<select id="ft-f-related-id" class="form-select form-select-sm" disabled><option value="">—</option></select>`)}</div>
      </div>`;

    if (kind === 'waiting-for') {
      return `${projectField}${title}
        <div class="row g-2">
          <div class="col-md-6">${this.field('Waiting on (portal user)', 'ft-f-on-user', `<select id="ft-f-on-user" class="form-select form-select-sm">${this.userOptions(r ? r.waitingOnUserId : '', { allowNone: true, noneLabel: 'No portal user' })}</select>`)}</div>
          <div class="col-md-6">${this.field('…or a named person / organisation', 'ft-f-on-name', `<input id="ft-f-on-name" class="form-control form-control-sm" maxlength="255" placeholder="e.g. Vendor legal team" value="${esc(r ? r.waitingOnName : '')}">`)}</div>
        </div>
        <div class="row g-2">
          <div class="col-md-4">${owner}</div>
          <div class="col-md-4">${this.field('Expected by', 'ft-f-due', `<input id="ft-f-due" type="date" class="form-control form-control-sm" value="${esc(r ? r.expectedDate : '')}">`)}</div>
          <div class="col-md-4">${status}</div>
        </div>
        ${related}${description}${errorBox}`;
    }

    return `${projectField}${title}
      <div class="row g-2">
        <div class="col-md-4">${owner}</div>
        <div class="col-md-4">${this.field('Due date', 'ft-f-due', `<input id="ft-f-due" type="date" class="form-control form-control-sm" value="${esc(r ? r.dueDate : '')}">`)}</div>
        <div class="col-md-4">${status}</div>
      </div>
      ${related}${description}${errorBox}`;
  },

  /** Fills the meeting picker (action items) for the chosen project. */
  async fillMeetingPicker(overlay, projectId, selected) {
    const select = overlay.querySelector('#ft-f-meeting');
    if (!select) return;
    try {
      const { items } = await MeetingService.listMeetings({ projectId, limit: PAGE_SIZE });
      select.innerHTML = `<option value="">Not from a meeting</option>${items
        .map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.title)} · ${esc(formatDateTime(m.scheduledAt))}</option>`)
        .join('')}`;
    } catch {
      select.innerHTML = '<option value="">Meetings could not be loaded</option>';
    }
  },

  /** Fills the related-record picker from the chosen project's records of that type. */
  async fillRelatedPicker(overlay, projectId, type, selectedId, selfId) {
    const select = overlay.querySelector('#ft-f-related-id');
    if (!select) return;
    if (!type) {
      select.innerHTML = '<option value="">—</option>';
      select.disabled = true;
      return;
    }
    select.disabled = true;
    select.innerHTML = '<option value="">Loading…</option>';
    const scope = { projectId, limit: PAGE_SIZE };
    try {
      let records = [];
      if (type === 'meeting') records = (await MeetingService.listMeetings(scope)).items.map((m) => ({ id: m.id, label: m.title }));
      else if (type === 'action_item') records = (await ActionItemService.listActionItems(scope)).items.map((a) => ({ id: a.id, label: a.title }));
      else if (type === 'waiting_for') records = (await WaitingForService.listWaitingFor(scope)).items.map((w) => ({ id: w.id, label: w.title }));
      else if (type === 'issue') records = (await IssueService.getIssues({ projectId })).map((i) => ({ id: i.id, label: `${i.code || ''} ${i.title || ''}`.trim() }));
      else if (type === 'risk') records = (await RiskService.getRisks({ projectId })).map((x) => ({ id: x.id, label: `${x.code || ''} ${x.title || ''}`.trim() }));
      else if (type === 'dependency') records = (await DependencyService.getDependencies({ projectId })).map((d) => ({ id: d.id, label: `${d.code || ''} ${d.title || d.name || d.id}`.trim() }));
      records = records.filter((x) => x.id !== selfId);
      select.innerHTML = records.length
        ? `<option value="">Choose…</option>${records.map((x) => `<option value="${esc(x.id)}" ${x.id === selectedId ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}`
        : '<option value="">No records of this type in the project</option>';
      select.disabled = records.length === 0;
    } catch {
      select.innerHTML = '<option value="">Records could not be loaded</option>';
    }
  },

  collect(kind, overlay, r, preset) {
    const val = (sel) => overlay.querySelector(sel)?.value ?? '';
    const fields = { title: val('#ft-f-title').trim() };
    if (!r) fields.projectId = preset.projectId || val('#ft-f-project');
    if (kind === 'meetings') {
      const when = val('#ft-f-when');
      Object.assign(fields, {
        scheduledAt: when ? new Date(when).toISOString() : '',
        durationMinutes: Number(val('#ft-f-duration')) || 30,
        status: val('#ft-f-status'),
        location: val('#ft-f-location'),
        meetingLink: val('#ft-f-link').trim(),
        organizerId: val('#ft-f-organizer'),
        participantIds: Array.from(overlay.querySelector('#ft-f-participants').selectedOptions).map((o) => o.value),
        agenda: val('#ft-f-agenda'),
        notes: val('#ft-f-notes'),
      });
      return fields;
    }
    Object.assign(fields, { ownerId: val('#ft-f-owner'), status: val('#ft-f-status'), description: val('#ft-f-description') });
    if (kind === 'action-items') {
      Object.assign(fields, {
        dueDate: val('#ft-f-due'),
        priority: val('#ft-f-priority'),
        meetingId: preset.meetingId || val('#ft-f-meeting'),
      });
      return fields;
    }
    const relatedType = val('#ft-f-related-type');
    const relatedId = relatedType ? val('#ft-f-related-id') : '';
    Object.assign(fields, { relatedType: relatedId ? relatedType : '', relatedId });
    if (kind === 'waiting-for') {
      Object.assign(fields, { waitingOnUserId: val('#ft-f-on-user'), waitingOnName: val('#ft-f-on-name').trim(), expectedDate: val('#ft-f-due') });
    } else {
      fields.dueDate = val('#ft-f-due');
    }
    return fields;
  },

  save(kind, id, fields) {
    if (kind === 'meetings') return id ? MeetingService.updateMeeting(id, fields) : MeetingService.createMeeting(fields);
    if (kind === 'action-items') return id ? ActionItemService.updateActionItem(id, fields) : ActionItemService.createActionItem(fields);
    if (kind === 'waiting-for') return id ? WaitingForService.updateWaitingForItem(id, fields) : WaitingForService.createWaitingForItem(fields);
    return id ? FollowUpService.updateFollowUp(id, fields) : FollowUpService.createFollowUp(fields);
  },

  openForm(kind, record, preset = {}) {
    if (!this.canWrite()) return;
    if (!this.projects.length) {
      this.toast('No projects are available to you.', 'danger');
      return;
    }
    const tab = TABS.find((t) => t.key === kind);
    const title = `${record ? 'Edit' : 'New'} ${tab.noun}`;
    let saving = false;
    this.app.openModal(title, this.formHtml(kind, record, preset), (overlay) => {
      if (saving) return false;
      const errorBox = overlay.querySelector('#ft-form-error');
      const fields = this.collect(kind, overlay, record, preset);
      if (!fields.title) {
        errorBox.textContent = 'A title is required.';
        return false;
      }
      saving = true;
      const saveBtn = overlay.querySelector('#global-modal-save-btn');
      if (saveBtn) saveBtn.disabled = true;
      errorBox.textContent = '';
      this.save(kind, record ? record.id : null, fields)
        .then(async () => {
          overlay.classList.remove('show');
          this.toast(`${record ? 'Updated' : 'Created'} ${tab.noun}`, 'success');
          if (kind === 'action-items' && preset.meetingId) this.selectedMeetingId = preset.meetingId;
          await this.loadTab();
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
    const projectSelect = overlay.querySelector('#ft-f-project');
    const currentProject = () => (record ? record.projectId : preset.projectId || projectSelect.value);
    if (kind === 'action-items') {
      this.fillMeetingPicker(overlay, currentProject(), record ? record.meetingId : preset.meetingId);
      projectSelect.addEventListener('change', () => this.fillMeetingPicker(overlay, currentProject(), ''));
    }
    if (kind === 'waiting-for' || kind === 'follow-ups') {
      const typeSelect = overlay.querySelector('#ft-f-related-type');
      const selfId = record ? record.id : undefined;
      this.fillRelatedPicker(overlay, currentProject(), typeSelect.value, record ? record.relatedId : '', selfId);
      typeSelect.addEventListener('change', () => this.fillRelatedPicker(overlay, currentProject(), typeSelect.value, '', selfId));
      projectSelect.addEventListener('change', () => this.fillRelatedPicker(overlay, currentProject(), typeSelect.value, '', selfId));
    }
  },
};
