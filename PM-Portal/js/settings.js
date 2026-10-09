/* settings.js - Portal Settings, User Administration (V2 user directory) & Sharing */

import { Storage } from './storage.js';
import { safeImageUrl } from './safeHtml.js';
import { Authentication } from './authentication.js';
import { AuthService } from './services/authService.js';
import { UserService } from './services/userService.js';
import { MicrosoftService } from './services/microsoftService.js';

/**
 * Sprint 12: the V2 server is the only user directory. This module lists,
 * creates, edits, activates/deactivates users and sets passwords through the
 * user API. Nothing about users is written to browser storage.
 */

/** V2 UserRole -> compact label used in the sidebar/header chrome. */
const V2_ROLE_LABELS = {
  'admin': 'Admin Lead',
  'project-manager': 'Project Manager',
  'product-manager': 'Product Manager',
  'team-member': 'Team Member',
  'viewer': 'Viewer',
};

/** V2 UserRole -> descriptive label used in the Settings profile form. */
const V2_ROLE_FORM_LABELS = {
  'admin': 'Administrator (Full Access)',
  'project-manager': 'Project Manager (Delivery)',
  'product-manager': 'Product Manager (Strategy)',
  'team-member': 'Team Member (Execution)',
  'viewer': 'Viewer (Read Only)',
};

const V2_ROLES = ['admin', 'project-manager', 'product-manager', 'team-member', 'viewer'];
const DEPARTMENTS = ['Project Manager', 'Product Manager', 'Dev', 'QA', 'BA'];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const SettingsModule = {
  app: null,
  /** V2 SafeUser records as returned by GET /users. */
  users: [],
  /** Session-derived summary kept for V1.1 permission checks (role: admin | member). */
  currentUser: null,
  /** Authenticated V2 user from GET /api/v1/auth/me; authoritative when present. */
  v2User: null,

  /**
   * Initializes the Settings Module
   */
  init(appInstance) {
    this.app = appInstance;
    window.portalSettingsInstance = this;
    this.loadCurrentUser();
    this.setupEventListeners();
    this.render();
    this.announceMicrosoftResult();
    // Refresh from the authenticated V2 session. Deliberately not awaited: the
    // session record renders immediately and is replaced when the server responds.
    this.hydrateFromServer();
  },

  /**
   * After a successful Microsoft callback the server redirects with
   * ?microsoft=connected. Announce it once, strip it from the address bar and
   * open Settings so the connected account is visible.
   */
  announceMicrosoftResult() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    if (params.get('microsoft') !== 'connected') return;
    params.delete('microsoft');
    const query = params.toString();
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    } catch (e) { /* history unavailable */ }
    if (this.app) {
      this.app.showToast('Microsoft 365 account connected.', 'success');
      if (typeof this.app.switchPage === 'function') setTimeout(() => this.app.switchPage('settings'), 0);
    }
  },

  /** Loads and renders the Microsoft 365 connection state for the signed-in user. */
  async loadMicrosoftStatus() {
    const body = document.getElementById('settings-microsoft-body');
    if (!body) return;
    try {
      this.microsoftStatus = await MicrosoftService.getStatus();
      this.microsoftError = null;
    } catch (err) {
      this.microsoftStatus = null;
      this.microsoftError = (err && err.message) || 'The Microsoft 365 status could not be loaded.';
    }
    this.renderMicrosoft();
  },

  renderMicrosoft() {
    const body = document.getElementById('settings-microsoft-body');
    if (!body) return;
    const s = this.microsoftStatus;
    if (this.microsoftError) {
      body.innerHTML = `<p class="text-danger small mb-0" role="alert"><i class="fa-solid fa-circle-exclamation me-1"></i>${esc(this.microsoftError)}</p>`;
      return;
    }
    if (!s) {
      body.innerHTML = '<p class="text-muted small mb-0" role="status">Checking Microsoft 365 connection…</p>';
      return;
    }
    if (s.connected) {
      const when = s.connectedAt ? new Date(s.connectedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      body.innerHTML = `
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <div class="font-semibold"><i class="fa-solid fa-circle-check text-success me-1"></i>Connected as <span class="text-primary">${esc(s.accountEmail || 'your Microsoft account')}</span></div>
            <div class="small text-muted">Connected ${esc(when)} · ${s.canSendMail ? 'Outlook calendar (read) and sending email you confirm.' : 'Outlook calendar (read-only).'}</div>
          </div>
          <button type="button" id="settings-btn-microsoft-disconnect" class="btn-enterprise btn-enterprise-secondary text-danger">
            <i class="fa-solid fa-link-slash me-1"></i> Disconnect
          </button>
        </div>
        ${s.canSendMail ? '' : `
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 border-top pt-3 mt-3">
          <div class="small">Outlook sending is not enabled for this connection. Reconnecting asks Microsoft for permission to send email you confirm.</div>
          <button type="button" id="settings-btn-microsoft-reconnect" class="btn-enterprise btn-enterprise-primary">
            <i class="fa-solid fa-rotate me-1"></i> Reconnect to enable Outlook sending
          </button>
        </div>`}`;
      document.getElementById('settings-btn-microsoft-disconnect')?.addEventListener('click', () => this.disconnectMicrosoft());
      const reconnectBtn = document.getElementById('settings-btn-microsoft-reconnect');
      reconnectBtn?.addEventListener('click', () => this.connectMicrosoft(reconnectBtn));
      return;
    }
    if (!s.configured) {
      body.innerHTML = `
        <p class="small mb-0" role="status"><i class="fa-solid fa-circle-info text-secondary me-1"></i>
          Microsoft 365 integration is not configured on this server. An administrator must set the Microsoft application credentials and token encryption key before accounts can be connected.</p>`;
      return;
    }
    body.innerHTML = `
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div>
          <div class="font-semibold">Not connected</div>
          <div class="small text-muted">Connect your Microsoft 365 account to see upcoming Outlook events in My Work and send email you confirm from the email composer. The portal requests calendar read access and permission to send mail; your portal sign-in does not change.</div>
        </div>
        <button type="button" id="settings-btn-microsoft-connect" class="btn-enterprise btn-enterprise-primary">
          <i class="fa-solid fa-plug me-1"></i> Connect Microsoft 365
        </button>
      </div>`;
    document.getElementById('settings-btn-microsoft-connect')?.addEventListener('click', () => this.connectMicrosoft());
  },

  async connectMicrosoft(btn = document.getElementById('settings-btn-microsoft-connect')) {
    if (btn) btn.disabled = true;
    try {
      await MicrosoftService.connect();
    } catch (err) {
      if (btn) btn.disabled = false;
      if (this.app) this.app.showToast(`Could not start the Microsoft connection: ${(err && err.message) || 'server error'}`, 'warning');
    }
  },

  disconnectMicrosoft() {
    const run = async () => {
      try {
        this.microsoftStatus = await MicrosoftService.disconnect();
        this.microsoftError = null;
        this.renderMicrosoft();
        if (this.app) this.app.showToast('Microsoft 365 account disconnected.', 'info');
      } catch (err) {
        if (this.app) this.app.showToast(`Could not disconnect: ${(err && err.message) || 'server error'}`, 'warning');
      }
    };
    if (this.app && typeof this.app.confirmModal === 'function') {
      this.app.confirmModal({
        title: 'Disconnect Microsoft 365',
        bodyHtml: '<div class="p-2"><p class="mb-0 small text-secondary">The portal will delete its stored access to your Microsoft 365 account. Outlook events will no longer appear in My Work until you connect again.</p></div>',
        confirmText: 'Disconnect',
        confirmClass: 'btn-enterprise-danger',
        onConfirm: run,
      });
    } else {
      run();
    }
  },

  isAdmin() {
    return (this.v2User?.role || this.currentUser?.v2Role) === 'admin';
  },

  /**
   * Checks if the signed-in user has delete/administration permissions (Admin only)
   */
  canDelete() {
    return this.isAdmin();
  },

  /**
   * Derives the module's current-user summary from the authenticated session
   * record. Never persisted: the session record itself is the only copy.
   */
  loadCurrentUser() {
    const session = Authentication.getCurrentUser();
    this.currentUser = session
      ? {
        id: session.id,
        name: session.name,
        email: session.email,
        dept: session.department || '',
        role: session.v2Role === 'admin' ? 'admin' : 'member',
        v2Role: session.v2Role,
        avatar: session.avatar || '',
      }
      : null;
    if (this.app) {
      this.app.currentUser = this.currentUser;
    }
    this.syncAvatarAcrossUI();
  },

  /** Loads the user directory from the server. Admins also see inactive accounts. */
  async loadUsers() {
    try {
      this.users = await UserService.getUsers({ includeInactive: this.isAdmin() });
    } catch (err) {
      this.users = [];
      if (this.app) this.app.showToast(`Could not load users: ${(err && err.message) || 'server unavailable'}`, 'warning');
    }
  },

  /**
   * Register settings page event listeners
   */
  setupEventListeners() {
    // Save personal profile form
    const profileForm = document.getElementById('settings-profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveProfile();
      });
    }

    // Live display name listener for instant bottom-left corner update
    const nameInp = document.getElementById('settings-user-name');
    if (nameInp) {
      nameInp.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        const firstName = val ? (val.split(' ')[0] || val) : 'User';
        const sbName = document.getElementById('sidebar-user-name');
        if (sbName) sbName.textContent = firstName;
        const hdrName = document.getElementById('top-user-name');
        if (hdrName) hdrName.textContent = firstName;
      });
    }

    // Avatar Photo Change Button and File Input
    const btnUploadAvatar = document.getElementById('settings-btn-upload-avatar');
    const avatarInput = document.getElementById('settings-avatar-input');
    const btnRemoveAvatar = document.getElementById('settings-btn-remove-avatar');

    if (btnUploadAvatar && avatarInput) {
      btnUploadAvatar.addEventListener('click', () => avatarInput.click());
      avatarInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleAvatarUpload(e.target.files[0]);
          avatarInput.value = '';
        }
      });
    }

    if (btnRemoveAvatar) {
      btnRemoveAvatar.addEventListener('click', () => this.updateAvatar(''));
    }

    // Add user button
    const btnAddUser = document.getElementById('settings-btn-add-user');
    if (btnAddUser) {
      const newBtn = btnAddUser.cloneNode(true);
      btnAddUser.parentNode.replaceChild(newBtn, btnAddUser);
      newBtn.addEventListener('click', () => this.openUserModal());
    }

    // Share app button
    const btnShareApp = document.getElementById('settings-btn-share');
    if (btnShareApp) {
      const newShareBtn = btnShareApp.cloneNode(true);
      btnShareApp.parentNode.replaceChild(newShareBtn, btnShareApp);
      newShareBtn.addEventListener('click', () => this.openShareModal());
    }
  },

  /**
   * Render Settings Page
   */
  render() {
    this.renderProfileForm();
    this.renderUsersTable();
    this.syncAvatarAcrossUI();
  },

  /**
   * Handle avatar image file selection & Base64 conversion
   */
  handleAvatarUpload(file) {
    if (!file.type.startsWith('image/')) {
      if (this.app) this.app.showToast('Please select a valid image file (PNG, JPG, WEBP).', 'warning');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (this.app) this.app.showToast('Image file size exceeds 5MB limit.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => this.updateAvatar(e.target.result);
    reader.readAsDataURL(file);
  },

  /** Saves the avatar on the server profile ('' removes it). */
  async updateAvatar(dataUrl) {
    if (!this.v2User) {
      if (this.app) this.app.showToast('Sign in again to update your profile photo.', 'warning');
      return;
    }
    try {
      const updated = await UserService.updateProfile(this.v2User.id, { avatarUrl: dataUrl || '' });
      this.applyProfile(updated);
      if (this.app) this.app.showToast(dataUrl ? 'Profile photo updated successfully!' : 'Profile photo removed.', dataUrl ? 'success' : 'info');
    } catch (err) {
      if (this.app) this.app.showToast(`Could not save the photo: ${(err && err.message) || 'server error'}`, 'warning');
    }
  },

  /** Applies an updated server profile to the session record and the chrome. */
  applyProfile(updated) {
    if (!updated) return;
    this.v2User = updated;
    Authentication.setCurrentUser(Authentication.toSessionUser(updated));
    this.loadCurrentUser();
    const idx = this.users.findIndex((u) => u.id === updated.id);
    if (idx !== -1) this.users[idx] = updated;
    this.renderProfileForm();
    this.renderUsersTable();
  },

  /**
   * Loads the authenticated V2 user and the user directory, then refreshes
   * the profile chrome and the accounts table.
   */
  async hydrateFromServer() {
    try {
      const user = await AuthService.getCurrentUser();
      if (user) {
        this.v2User = user;
        Authentication.setCurrentUser(Authentication.toSessionUser(user));
        this.loadCurrentUser();
        this.renderProfileForm();
      }
    } catch (err) {
      console.warn('Could not load authenticated profile:', err && err.message);
    }
    await this.loadUsers();
    this.renderUsersTable();
    await this.loadMicrosoftStatus();
  },

  /**
   * Resolves the display profile from the authenticated V2 user, falling back
   * to the session record until the server responds. Display-ready values only.
   */
  resolveProfile() {
    const v2 = this.v2User;
    const v1 = this.currentUser || {};

    const fullName = v2
      ? `${v2.firstName || ''} ${v2.lastName || ''}`.trim() || v2.email || 'User'
      : (v1.name || 'User').trim();

    // Sprint 25: only a safe image source (an https URL or an uploaded raster image) is shown.
    const avatarSrc = safeImageUrl((v2 && v2.avatarUrl) || v1.avatar) || this.buildInitialsAvatar(fullName);
    const role = v2 ? v2.role : v1.v2Role;

    return {
      fullName,
      firstName: fullName.split(' ')[0] || fullName,
      avatarSrc,
      roleLabel: V2_ROLE_LABELS[role] || 'Team Member',
      roleFormLabel: V2_ROLE_FORM_LABELS[role] || 'Team Member (Execution)',
      email: (v2 && v2.email) || v1.email || '',
      dept: (v2 && (v2.department || v2.title)) || v1.dept || '',
    };
  },

  /**
   * Builds an initials avatar as an inline SVG data URI, so it can be assigned
   * to the existing <img> elements without any markup change.
   */
  buildInitialsAvatar(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0])
      : (parts[0] ? parts[0].slice(0, 2) : 'U');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">`
      + `<rect width="64" height="64" rx="32" fill="#4f46e5"/>`
      + `<text x="32" y="41" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif"`
      + ` font-size="26" font-weight="600" fill="#ffffff">${initials.toUpperCase()}</text></svg>`;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  },

  /**
   * Synchronize profile picture and user name across top navbar and sidebar
   */
  syncAvatarAcrossUI() {
    if (!this.currentUser && !this.v2User) return;
    const profile = this.resolveProfile();

    // Settings Preview
    const setPrev = document.getElementById('settings-avatar-preview');
    if (setPrev) setPrev.src = profile.avatarSrc;

    // Sidebar Avatar & Info (Bottom Left Corner)
    const sbAvatar = document.getElementById('sidebar-user-avatar');
    if (sbAvatar) sbAvatar.src = profile.avatarSrc;

    const sbName = document.getElementById('sidebar-user-name');
    if (sbName) sbName.textContent = profile.firstName;

    const sbRole = document.getElementById('sidebar-user-role');
    if (sbRole) sbRole.textContent = profile.roleLabel;

    // Top Header Avatar (Top Right Corner)
    const hdrAvatar = document.getElementById('header-user-avatar');
    if (hdrAvatar) {
      hdrAvatar.src = profile.avatarSrc;
      hdrAvatar.alt = profile.fullName;
      hdrAvatar.title = `${profile.fullName} (${profile.roleLabel})`;
    }

    const hdrName = document.getElementById('top-user-name');
    if (hdrName) hdrName.textContent = profile.firstName;
  },

  /**
   * Populate personal account form
   */
  renderProfileForm() {
    const nameInp = document.getElementById('settings-user-name');
    const roleInp = document.getElementById('settings-user-role');
    const emailInp = document.getElementById('settings-user-email');
    const deptInp = document.getElementById('settings-user-dept');

    if (!this.currentUser && !this.v2User) return;
    const profile = this.resolveProfile();

    if (nameInp) nameInp.value = profile.fullName;
    if (roleInp) roleInp.value = profile.roleFormLabel;
    if (emailInp) {
      // The sign-in email is the account identity; it is not editable here.
      emailInp.value = profile.email;
      emailInp.readOnly = true;
    }

    // The department control is a <select> with a fixed option list. Assigning a
    // value it does not offer silently blanks the control, so only apply a
    // match and otherwise leave the current selection intact.
    if (deptInp) {
      const hasOption = Array.from(deptInp.options || []).some((o) => o.value === profile.dept);
      if (hasOption) deptInp.value = profile.dept;
    }
  },

  /**
   * Save the signed-in user's profile details on the server
   */
  async saveProfile() {
    if (!this.v2User) {
      this.app.showToast('Sign in again to update your profile.', 'warning');
      return;
    }
    const name = document.getElementById('settings-user-name')?.value?.trim() || '';
    const dept = document.getElementById('settings-user-dept')?.value || '';
    if (!name) {
      this.app.showToast('Please enter your name', 'warning');
      return;
    }
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(' ') || this.v2User.lastName || '';
    try {
      const updated = await UserService.updateProfile(this.v2User.id, { firstName, lastName, department: dept });
      this.applyProfile(updated);
      this.app.showToast('User profile details updated successfully', 'success');
      this.syncAvatarAcrossUI();
    } catch (err) {
      this.app.showToast(`Could not save profile: ${(err && err.message) || 'server error'}`, 'warning');
    }
  },

  fullName(u) {
    return `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || u.id;
  },

  /**
   * Render Team Users Table in Settings from the V2 user directory
   */
  renderUsersTable() {
    const body = document.getElementById('settings-users-table-body');
    if (!body) return;

    body.innerHTML = '';
    if (this.users.length === 0) {
      body.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No user accounts returned by the server.</td></tr>`;
      return;
    }

    const admin = this.isAdmin();
    const selfId = this.v2User?.id || this.currentUser?.id;

    this.users.forEach((u) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';
      const isSelf = u.id === selfId;
      const active = u.isActive !== false;
      const roleBadge = u.role === 'admin'
        ? `<span class="badge bg-danger-subtle text-danger font-semibold">${esc(V2_ROLE_FORM_LABELS[u.role])}</span>`
        : `<span class="badge bg-info-subtle text-info font-semibold">${esc(V2_ROLE_FORM_LABELS[u.role] || u.role)}</span>`;
      const actions = [];
      if (admin || isSelf) {
        actions.push(`<button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="window.portalSettingsInstance.openUserModal('${esc(u.id)}')" title="Edit user"><i class="fa-solid fa-pen-to-square"></i><span class="visually-hidden">Edit</span></button>`);
      }
      if (admin) {
        actions.push(`<button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="window.portalSettingsInstance.openSetPasswordModal('${esc(u.id)}')" title="Set password"><i class="fa-solid fa-key"></i><span class="visually-hidden">Set password</span></button>`);
        if (!isSelf) {
          actions.push(active
            ? `<button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="window.portalSettingsInstance.setUserStatus('${esc(u.id)}', false)" title="Deactivate user"><i class="fa-solid fa-user-slash"></i><span class="visually-hidden">Deactivate</span></button>`
            : `<button class="btn btn-sm btn-outline-success py-0 px-2" onclick="window.portalSettingsInstance.setUserStatus('${esc(u.id)}', true)" title="Activate user"><i class="fa-solid fa-user-check"></i><span class="visually-hidden">Activate</span></button>`);
        }
      }

      tr.innerHTML = `
        <td style="padding: 10px 16px; font-weight: 600;">${esc(this.fullName(u))}${isSelf ? ' <span class="badge bg-light text-secondary border ms-1">You</span>' : ''}</td>
        <td style="color: var(--text-secondary);">${esc(u.email)}</td>
        <td><span class="badge bg-light text-dark font-semibold border">${esc(u.department || u.title || '—')}</span></td>
        <td>${roleBadge}</td>
        <td><span class="badge ${active ? 'bg-success' : 'bg-secondary'}">${active ? 'Active' : 'Inactive'}</span></td>
        <td class="text-center">
          <div class="d-flex justify-content-center gap-1">${actions.join('') || '<span class="text-muted small">—</span>'}</div>
        </td>
      `;
      body.appendChild(tr);
    });

    window.portalSettingsInstance = this;
  },

  /**
   * Open Modal to Add (register) or Edit a user on the server
   */
  openUserModal(userId = null) {
    const target = userId ? this.users.find((u) => u.id === userId) : null;
    const isEdit = !!target;
    const admin = this.isAdmin();
    const isSelf = !!target && target.id === (this.v2User?.id || this.currentUser?.id);
    if (!isEdit && !admin) {
      this.app.showToast('Only administrators can create user accounts.', 'warning');
      return;
    }
    if (isEdit && !admin && !isSelf) {
      this.app.showToast('You may only edit your own profile.', 'warning');
      return;
    }
    const title = isEdit ? 'Edit User Details' : 'Add New Team Member / User';

    const deptOptions = ['<option value="">— None —</option>']
      .concat(DEPARTMENTS.map((d) => `<option value="${esc(d)}" ${target && target.department === d ? 'selected' : ''}>${esc(d)}</option>`))
      .join('');
    const roleOptions = V2_ROLES
      .map((r) => `<option value="${r}" ${(target ? target.role === r : r === 'team-member') ? 'selected' : ''}>${esc(V2_ROLE_FORM_LABELS[r])}</option>`)
      .join('');

    const bodyHtml = `
      <form id="user-edit-form" class="row g-3">
        <div class="col-md-6">
          <label class="form-label font-semibold" for="u-first-name">First Name *</label>
          <input type="text" class="form-control select-enterprise w-100" id="u-first-name" value="${esc(target ? target.firstName : '')}" required placeholder="Jane" />
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" for="u-last-name">Last Name *</label>
          <input type="text" class="form-control select-enterprise w-100" id="u-last-name" value="${esc(target ? target.lastName : '')}" required placeholder="Doe" />
        </div>
        <div class="col-md-12">
          <label class="form-label font-semibold" for="u-email">Email Address *</label>
          <input type="email" class="form-control select-enterprise w-100" id="u-email" value="${esc(target ? target.email : '')}" ${isEdit ? 'readonly' : 'required'} placeholder="jane.doe@enterprise.com" />
          ${isEdit ? '<div class="small text-muted mt-1">The sign-in email is the account identity and cannot be changed here.</div>' : ''}
        </div>
        ${isEdit ? '' : `
        <div class="col-md-12">
          <label class="form-label font-semibold" for="u-password">Temporary Password *</label>
          <input type="password" class="form-control select-enterprise w-100" id="u-password" required autocomplete="new-password" placeholder="At least 8 characters, mixed case, number and symbol" />
        </div>`}
        <div class="col-md-6">
          <label class="form-label font-semibold" for="u-dept">Department</label>
          <select class="form-select select-enterprise w-100" id="u-dept">${deptOptions}</select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" for="u-title">Job Title</label>
          <input type="text" class="form-control select-enterprise w-100" id="u-title" value="${esc(target ? (target.title || '') : '')}" placeholder="Senior Engineer" />
        </div>
        ${admin ? `
        <div class="col-md-6">
          <label class="form-label font-semibold" for="u-role">System Role & Access *</label>
          <select class="form-select select-enterprise w-100" id="u-role" required>${roleOptions}</select>
        </div>
        ${isEdit && !isSelf ? `
        <div class="col-md-6">
          <label class="form-label font-semibold" for="u-status">Account Status</label>
          <select class="form-select select-enterprise w-100" id="u-status">
            <option value="active" ${target.isActive !== false ? 'selected' : ''}>Active</option>
            <option value="inactive" ${target.isActive === false ? 'selected' : ''}>Inactive</option>
          </select>
        </div>` : ''}` : ''}
        ${isEdit ? `<div class="col-12 mt-2"><span class="text-muted small">User ID: ${esc(target.id)}</span></div>` : ''}
      </form>
    `;

    this.app.openModal(title, bodyHtml, (overlay) => {
      const read = (id) => overlay.querySelector(`#${id}`)?.value ?? '';
      const payload = {
        firstName: read('u-first-name').trim(),
        lastName: read('u-last-name').trim(),
        email: read('u-email').trim(),
        password: isEdit ? '' : read('u-password'),
        department: read('u-dept'),
        title: read('u-title').trim(),
        role: admin ? (read('u-role') || undefined) : undefined,
        isActive: admin && isEdit && !isSelf ? read('u-status') !== 'inactive' : undefined,
      };
      if (!payload.firstName || !payload.lastName || (!isEdit && !payload.email)) {
        this.app.showToast('Please enter first name, last name and email address', 'warning');
        return false;
      }
      if (!isEdit) {
        const policy = Authentication.validatePasswordPolicy(payload.password);
        if (!policy.valid) {
          this.app.showToast('Temporary password does not meet the policy: ' + policy.errors.join(', '), 'warning');
          return false;
        }
      }
      this.submitUserModal(target, payload);
      return true;
    });
  },

  /** Persists the modal's changes on the server: register, profile, role, status. */
  async submitUserModal(target, payload) {
    try {
      if (!target) {
        const created = await UserService.register({
          email: payload.email,
          password: payload.password,
          firstName: payload.firstName,
          lastName: payload.lastName,
          role: payload.role || 'team-member',
          department: payload.department || undefined,
          title: payload.title || undefined,
        });
        this.app.showToast(`Created user account for ${this.fullName(created)}`, 'success');
      } else {
        const profileChanged =
          payload.firstName !== target.firstName || payload.lastName !== target.lastName
          || payload.department !== (target.department || '') || payload.title !== (target.title || '');
        let updated = target;
        if (profileChanged) {
          updated = await UserService.updateProfile(target.id, {
            firstName: payload.firstName,
            lastName: payload.lastName,
            department: payload.department,
            title: payload.title,
          });
        }
        if (payload.role && payload.role !== target.role) {
          updated = await UserService.updateUserRole(target.id, payload.role);
        }
        if (payload.isActive !== undefined && payload.isActive !== (target.isActive !== false)) {
          updated = await UserService.setStatus(target.id, payload.isActive);
        }
        if (updated && updated.id === this.v2User?.id) this.applyProfile(updated);
        this.app.showToast(`Updated details for ${this.fullName(updated || target)}`, 'success');
      }
    } catch (err) {
      this.app.showToast(`Could not save user: ${(err && err.message) || 'server error'}`, 'warning');
    }
    await this.loadUsers();
    this.renderUsersTable();
  },

  /** Admin: activate or deactivate an account on the server. */
  async setUserStatus(userId, isActive) {
    if (!this.isAdmin()) {
      this.app.showToast('Only administrators can change account status.', 'warning');
      return;
    }
    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      this.app.showToast('Selected user account was not found.', 'warning');
      return;
    }
    const run = async () => {
      try {
        await UserService.setStatus(userId, isActive);
        this.app.showToast(`${this.fullName(user)} is now ${isActive ? 'active' : 'inactive'}.`, 'info');
      } catch (err) {
        this.app.showToast(`Could not change status: ${(err && err.message) || 'server error'}`, 'warning');
      }
      await this.loadUsers();
      this.renderUsersTable();
    };
    if (!isActive && this.app && typeof this.app.confirmModal === 'function') {
      this.app.confirmModal({
        title: 'Deactivate User Account',
        bodyHtml: `<div class="p-2"><p class="mb-2 font-semibold text-danger" style="font-size: 0.95rem;">Deactivate <strong>${esc(this.fullName(user))}</strong> (${esc(user.email)})?</p><p class="text-secondary small mb-0">The account stays on record but can no longer sign in until it is reactivated.</p></div>`,
        confirmText: 'Deactivate',
        confirmClass: 'btn-enterprise-danger',
        onConfirm: run,
      });
    } else {
      run();
    }
  },

  /** Admin: set another user's password (not a recovery workflow). */
  openSetPasswordModal(userId) {
    if (!this.isAdmin()) {
      this.app.showToast('Only administrators can set passwords.', 'warning');
      return;
    }
    const user = this.users.find((u) => u.id === userId);
    if (!user) return;
    const bodyHtml = `
      <form id="user-password-form" class="row g-3">
        <div class="col-12"><p class="text-secondary small mb-0">Set a new password for <strong>${esc(this.fullName(user))}</strong> (${esc(user.email)}). Share it with them securely; they can change it afterwards.</p></div>
        <div class="col-md-6">
          <label class="form-label font-semibold" for="u-new-password">New Password *</label>
          <input type="password" class="form-control select-enterprise w-100" id="u-new-password" required autocomplete="new-password" />
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" for="u-confirm-password">Confirm Password *</label>
          <input type="password" class="form-control select-enterprise w-100" id="u-confirm-password" required autocomplete="new-password" />
        </div>
      </form>`;
    this.app.openModal('Set User Password', bodyHtml, (overlay) => {
      const pw = overlay.querySelector('#u-new-password')?.value || '';
      const confirm = overlay.querySelector('#u-confirm-password')?.value || '';
      if (pw !== confirm) {
        this.app.showToast('New password and confirmation do not match.', 'warning');
        return false;
      }
      const policy = Authentication.validatePasswordPolicy(pw);
      if (!policy.valid) {
        this.app.showToast('Password does not meet the policy: ' + policy.errors.join(', '), 'warning');
        return false;
      }
      UserService.setPassword(userId, pw)
        .then(() => this.app.showToast(`Password set for ${this.fullName(user)}.`, 'success'))
        .catch((err) => this.app.showToast(`Could not set password: ${(err && err.message) || 'server error'}`, 'warning'));
      return true;
    });
  },

  /**
   * Open Share Modal for team collaboration
   */
  openShareModal() {
    const devUrl = window.location.href;

    const bodyHtml = `
      <div class="p-2">
        <p class="text-secondary" style="font-size: 0.9rem;">
          You can share this live application URL with your team members across departments to allow them to log daily effort and view real-time project metrics.
        </p>

        <div class="mb-3">
          <label class="form-label font-semibold">App Share URL</label>
          <div class="input-group">
            <input type="text" id="share-url-input" class="form-control select-enterprise" value="${esc(devUrl)}" readonly />
            <button class="btn btn-enterprise btn-enterprise-primary" id="btn-copy-share-url" type="button">
              <i class="fa-solid fa-copy"></i> Copy Link
            </button>
          </div>
        </div>

        <div class="alert alert-info border-info-subtle bg-info-subtle text-info-emphasis p-3 rounded small" style="font-size: 0.8rem;">
          <i class="fa-solid fa-shield-halved me-1"></i>
          <strong>Accounts:</strong> Team members sign in with the account an administrator creates for them here. Roles and access are enforced by the server.
        </div>
      </div>
    `;

    this.app.openModal('Share Application with Team Members', bodyHtml, (overlay) => {
      const copyBtn = overlay.querySelector('#btn-copy-share-url');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(devUrl).then(() => {
            this.app.showToast('Share link copied to clipboard!', 'success');
          }).catch(() => {
            this.app.showToast('Share link selected. Copy manually.', 'info');
          });
        });
      }
      return true;
    });
  }
};

// Storage is imported for parity with the other settings-page helpers that
// persist non-identity preferences; user records are never written to it.
void Storage;
