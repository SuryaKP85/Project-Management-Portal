/* settings.js - Portal Settings, User Management, RBAC & Sharing */

import { Storage } from './storage.js';
import { AuthService } from './services/authService.js';

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

export const SettingsModule = {
  app: null,
  users: [],
  currentUser: null,
  /** Authenticated V2 user from GET /api/v1/auth/me; authoritative when present. */
  v2User: null,

  /**
   * Initializes the Settings Module
   */
  init(appInstance) {
    this.app = appInstance;
    window.portalSettingsInstance = this;
    this.loadUsers();
    this.loadCurrentUser();
    this.setupEventListeners();
    this.render();
    // Refresh the chrome from the authenticated V2 session. Deliberately not
    // awaited: the local profile renders immediately and is replaced when the
    // server responds.
    this.hydrateFromServer();
  },

  /**
   * Loads users list from storage or initializes default list
   */
  loadUsers() {
    let stored = Storage.get('portal_users');
    const ALLOWED_DEPTS = ['Project Manager', 'Product Manager', 'Dev', 'QA', 'BA'];
    const mapDept = (d) => {
      if (d === 'PM' || d === 'Project Manager') return 'Project Manager';
      if (d === 'Engineering') return 'Dev';
      if (d === 'Design') return 'BA';
      if (d === 'QA / Test') return 'QA';
      if (d === 'Product') return 'Product Manager';
      if (ALLOWED_DEPTS.includes(d)) return d;
      return 'Project Manager';
    };

    if (stored && Array.isArray(stored) && stored.length > 0) {
      this.users = stored.map(u => ({
        ...u,
        dept: mapDept(u.dept)
      }));
      Storage.set('portal_users', this.users);
    } else {
      // Default users mapped with departments and roles
      this.users = [
        { id: 'USR001', name: 'Surya Prashanth', email: 'surya.prashanth.kp@gmail.com', dept: 'Project Manager', role: 'admin', status: 'active' },
        { id: 'USR002', name: 'Alice Smith', email: 'alice.smith@enterprise.com', dept: 'Dev', role: 'member', status: 'active' },
        { id: 'USR003', name: 'Bob Johnson', email: 'bob.johnson@enterprise.com', dept: 'Dev', role: 'member', status: 'active' },
        { id: 'USR004', name: 'Clara Oswald', email: 'clara.oswald@enterprise.com', dept: 'QA', role: 'member', status: 'active' },
        { id: 'USR005', name: 'David Miller', email: 'david.miller@enterprise.com', dept: 'BA', role: 'member', status: 'active' },
        { id: 'USR006', name: 'Elena Rostova', email: 'elena.rostova@enterprise.com', dept: 'Product Manager', role: 'admin', status: 'active' }
      ];
      Storage.set('portal_users', this.users);
    }
  },

  /**
   * Loads or sets active user session
   */
  loadCurrentUser() {
    let active = Storage.get('current_user');
    if (!active || !active.id) {
      // Display-only fallback held in memory. It is deliberately NOT persisted:
      // writing it to storage recreated the V1 session marker after logout,
      // which is the flag requireAuth() checks.
      active = this.users[0] || { id: 'USR001', name: 'Surya Prashanth', email: 'surya.prashanth.kp@gmail.com', dept: 'Project Manager', role: 'admin' };
    }
    this.currentUser = active;
    if (this.app) {
      this.app.currentUser = active;
    }
    this.syncAvatarAcrossUI();
  },

  /**
   * Checks if active user has delete permissions (Admin only)
   */
  canDelete() {
    return this.currentUser && this.currentUser.role === 'admin';
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
      btnRemoveAvatar.addEventListener('click', () => {
        if (this.currentUser) {
          this.currentUser.avatar = '';
          const idx = this.users.findIndex(u => u.id === this.currentUser.id);
          if (idx !== -1) this.users[idx].avatar = '';
          Storage.set('current_user', this.currentUser);
          Storage.set('portal_users', this.users);
          this.syncAvatarAcrossUI();
          if (this.app) this.app.showToast('Profile photo removed.', 'info');
        }
      });
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

    // Switch active user selector
    const userSwitcher = document.getElementById('settings-active-user-select');
    if (userSwitcher) {
      userSwitcher.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        const targetUser = this.users.find(u => u.id === selectedId);
        if (targetUser) {
          this.currentUser = targetUser;
          Storage.set('current_user', targetUser);
          if (this.app) this.app.currentUser = targetUser;
          this.app.showToast(`Switched active session to ${targetUser.name} (${targetUser.role.toUpperCase()})`, 'success');
          this.render();
          // Notify app to refresh UI delete button states
          window.dispatchEvent(new CustomEvent('portal-user-switched', { detail: targetUser }));
        }
      });
    }
  },

  /**
   * Render Settings Page
   */
  render() {
    this.renderProfileForm();
    this.renderUsersTable();
    this.renderUserSwitcher();
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
    reader.onload = (e) => {
      const base64Data = e.target.result;
      if (this.currentUser) {
        this.currentUser.avatar = base64Data;
        const idx = this.users.findIndex(u => u.id === this.currentUser.id);
        if (idx !== -1) {
          this.users[idx] = { ...this.currentUser };
        }
        Storage.set('current_user', this.currentUser);
        Storage.set('portal_users', this.users);
        this.syncAvatarAcrossUI();
        this.renderUsersTable();
        if (this.app) this.app.showToast('Profile photo updated successfully!', 'success');
      }
    };
    reader.readAsDataURL(file);
  },

  /**
   * Loads the authenticated V2 user and refreshes the profile chrome.
   * Best-effort: if the session is missing or the request fails, the existing
   * V1.1 local profile continues to drive the UI unchanged.
   */
  async hydrateFromServer() {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) return;
      this.v2User = user;
      this.syncAvatarAcrossUI();
      this.renderProfileForm();
    } catch (err) {
      console.warn('Could not load authenticated profile; using local profile:', err && err.message);
    }
  },

  /**
   * Resolves the display profile, preferring the authenticated V2 user over the
   * local V1.1 record. Returns display-ready values only.
   */
  resolveProfile() {
    const v2 = this.v2User;
    const v1 = this.currentUser || {};

    const fullName = v2
      ? `${v2.firstName || ''} ${v2.lastName || ''}`.trim() || v2.email || 'User'
      : (v1.name || 'Surya Prashanth').trim();

    // A locally uploaded V1 avatar (data URI) still wins, since it is an
    // explicit user choice made in this portal.
    const avatarSrc =
      v1.avatar || (v2 && v2.avatarUrl) || this.buildInitialsAvatar(fullName);

    const role = v2 ? v2.role : v1.role;

    return {
      fullName,
      firstName: fullName.split(' ')[0] || fullName,
      avatarSrc,
      roleLabel: V2_ROLE_LABELS[role] || (role === 'admin' ? 'Admin Lead' : 'Team Member'),
      roleFormLabel:
        V2_ROLE_FORM_LABELS[role] ||
        (role === 'admin' ? 'Administrator (Full Access)' : 'Standard Member (Entry Only)'),
      email: (v2 && v2.email) || v1.email || '',
      dept: (v2 && (v2.department || v2.title)) || v1.dept || 'Engineering',
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
    if (emailInp) emailInp.value = profile.email;

    // The department control is a <select> with a fixed option list. Assigning a
    // value it does not offer silently blanks the control, so only apply a
    // match and otherwise leave the current selection intact.
    if (deptInp) {
      const hasOption = Array.from(deptInp.options || []).some((o) => o.value === profile.dept);
      if (hasOption) deptInp.value = profile.dept;
    }
  },

  /**
   * Save active user profile details
   */
  saveProfile() {
    const name = document.getElementById('settings-user-name')?.value?.trim() || '';
    const email = document.getElementById('settings-user-email')?.value?.trim() || '';
    const dept = document.getElementById('settings-user-dept')?.value || 'Dev';

    if (!name || !email) {
      this.app.showToast('Please enter a valid name and email address', 'warning');
      return;
    }

    this.currentUser.name = name;
    this.currentUser.email = email;
    this.currentUser.dept = dept;

    // Update in users list
    const idx = this.users.findIndex(u => u.id === this.currentUser.id);
    if (idx !== -1) {
      this.users[idx] = { ...this.currentUser };
    }

    Storage.set('current_user', this.currentUser);
    Storage.set('portal_users', this.users);

    // Sync resources list if member exists
    const resList = this.app.resourcesList || [];
    const resIdx = resList.findIndex(r => r.name === name || r.id === this.currentUser.id);
    if (resIdx !== -1) {
      resList[resIdx].name = name;
      resList[resIdx].dept = dept;
      Storage.set('resources', resList);
      this.app.resourcesList = resList;
    }

    this.app.showToast('User profile details updated successfully', 'success');
    this.syncAvatarAcrossUI();
    this.render();
  },

  /**
   * Render active user session dropdown in settings
   */
  renderUserSwitcher() {
    const select = document.getElementById('settings-active-user-select');
    if (!select) return;

    select.innerHTML = '';
    this.users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.name} [${u.dept}] (${u.role === 'admin' ? 'Admin' : 'Member - Entry Only'})`;
      if (u.id === this.currentUser.id) opt.selected = true;
      select.appendChild(opt);
    });
  },

  /**
   * Render Team Users Table in Settings
   */
  renderUsersTable() {
    const body = document.getElementById('settings-users-table-body');
    if (!body) return;

    body.innerHTML = '';
    if (this.users.length === 0) {
      body.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No team users registered.</td></tr>`;
      return;
    }

    this.users.forEach(u => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';

      const roleBadge = u.role === 'admin' 
        ? '<span class="badge bg-danger-subtle text-danger font-semibold">Admin (Full Access)</span>' 
        : '<span class="badge bg-info-subtle text-info font-semibold">Member (Entry Only)</span>';

      tr.innerHTML = `
        <td style="padding: 10px 16px; font-weight: 600;">${u.name}</td>
        <td style="color: var(--text-secondary);">${u.email}</td>
        <td><span class="badge bg-light text-dark font-semibold border">${u.dept}</span></td>
        <td>${roleBadge}</td>
        <td><span class="badge ${u.status === 'active' ? 'bg-success' : 'bg-secondary'}">${u.status}</span></td>
        <td class="text-center">
          <div class="d-flex justify-content-center gap-1">
            <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="window.portalSettingsInstance.openUserModal('${u.id}')" title="Edit User">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="window.portalSettingsInstance.deleteUser('${u.id}')" title="Delete User">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;
      body.appendChild(tr);
    });

    window.portalSettingsInstance = this;
  },

  /**
   * Open Modal to Add / Edit User
   */
  openUserModal(userId = null) {
    const target = userId ? this.users.find(u => u.id === userId) : null;
    const isEdit = !!target;
    const title = isEdit ? 'Edit User Details' : 'Add New Team Member / User';

    const depts = ['Project Manager', 'Product Manager', 'Dev', 'QA', 'BA'];
    let deptOptions = '';
    depts.forEach(d => {
      const sel = (target && target.dept === d) ? 'selected' : '';
      deptOptions += `<option value="${d}" ${sel}>${d}</option>`;
    });

    const bodyHtml = `
      <form id="user-edit-form" class="row g-3">
        <div class="col-md-12">
          <label class="form-label font-semibold">Full Name *</label>
          <input type="text" class="form-control select-enterprise w-100" id="u-name" value="${target ? target.name : ''}" required placeholder="E.g. Jane Doe" />
        </div>
        
        <div class="col-md-12">
          <label class="form-label font-semibold">Email Address *</label>
          <input type="email" class="form-control select-enterprise w-100" id="u-email" value="${target ? target.email : ''}" required placeholder="jane.doe@enterprise.com" />
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Department *</label>
          <select class="form-select select-enterprise w-100" id="u-dept" required>
            ${deptOptions}
          </select>
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">System Role & Access *</label>
          <select class="form-select select-enterprise w-100" id="u-role" required>
            <option value="member" ${target && target.role === 'member' ? 'selected' : ''}>Standard Member (Entry Only - No Delete)</option>
            <option value="admin" ${target && target.role === 'admin' ? 'selected' : ''}>Administrator (Full Access)</option>
          </select>
          <div class="text-xs text-muted mt-1">Standard members cannot delete time logs or resources.</div>
        </div>

        <div class="col-md-12">
          <label class="form-label font-semibold">Account Status</label>
          <select class="form-select select-enterprise w-100" id="u-status">
            <option value="active" ${target && target.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${target && target.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>

        ${isEdit ? `
          <div class="col-12 mt-3 pt-3 border-top d-flex justify-content-between align-items-center">
            <button type="button" class="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" id="btn-delete-user-modal">
              <i class="fa-solid fa-trash-can"></i> Delete User Account
            </button>
            <span class="text-muted small">User ID: ${target.id}</span>
          </div>
        ` : ''}
      </form>
    `;

    this.app.openModal(title, bodyHtml, (overlay) => {
      const name = overlay.querySelector('#u-name')?.value?.trim() || '';
      const email = overlay.querySelector('#u-email')?.value?.trim() || '';
      const dept = overlay.querySelector('#u-dept')?.value || 'Dev';
      const role = overlay.querySelector('#u-role')?.value || 'member';
      const status = overlay.querySelector('#u-status')?.value || 'active';

      if (!name || !email) {
        this.app.showToast('Please enter name and email address', 'warning');
        return false;
      }

      if (isEdit) {
        const idx = this.users.findIndex(u => u.id === target.id);
        if (idx !== -1) {
          this.users[idx] = { ...this.users[idx], name, email, dept, role, status };
        }
        this.app.showToast(`Updated details for ${name}`, 'success');
      } else {
        const newId = `USR00${this.users.length + 1}`;
        const newUser = { id: newId, name, email, dept, role, status };
        this.users.push(newUser);
        this.app.showToast(`Added new user ${name} under ${dept}`, 'success');
      }

      Storage.set('portal_users', this.users);

      // Sync to resources list so they appear in Resource Planner & Daily Time Logging!
      const resList = Storage.get('resources') || this.app.resourcesList || [];
      const existingRes = resList.find(r => r.name === name || (target && r.name === target.name));
      if (existingRes) {
        existingRes.name = name;
        existingRes.dept = dept;
        existingRes.role = role === 'admin' ? 'Lead' : 'Team Specialist';
      } else {
        const newResId = `RES20${resList.length + 1}`;
        resList.push({
          id: newResId,
          name,
          role: role === 'admin' ? 'Lead / Manager' : 'Team Member',
          dept,
          allocation: 0,
          status: 'pending'
        });
      }
      Storage.set('resources', resList);
      this.app.resourcesList = resList;

      this.render();
      return true;
    });

    // Attach listener for Delete User Account button inside modal overlay if editing
    if (isEdit) {
      setTimeout(() => {
        const modalEl = document.getElementById('global-modal-overlay');
        if (modalEl) {
          const modalDelBtn = modalEl.querySelector('#btn-delete-user-modal');
          if (modalDelBtn) {
            modalDelBtn.addEventListener('click', () => {
              const cancelBtn = modalEl.querySelector('#global-modal-cancel-btn') || modalEl.querySelector('#global-modal-close-btn');
              if (cancelBtn) cancelBtn.click();
              this.deleteUser(target.id);
            });
          }
        }
      }, 100);
    }
  },

  /**
   * Delete user account
   */
  deleteUser(userId) {
    if (!this.canDelete()) {
      this.app.showToast('Delete permission restricted: Standard team members have entry-only access. Switch active session profile to an Administrator to delete user accounts.', 'danger');
      return;
    }

    const user = this.users.find(u => u.id === userId);
    if (!user) {
      this.app.showToast('Selected user profile was not found or already removed.', 'warning');
      return;
    }

    const executeDelete = () => {
      this.users = this.users.filter(u => u.id !== userId);
      Storage.set('portal_users', this.users);
      
      // Also remove from resources list
      let resList = Storage.get('resources') || this.app.resourcesList || [];
      resList = resList.filter(r => r.name !== user.name && r.id !== userId);
      Storage.set('resources', resList);
      this.app.resourcesList = resList;

      // Handle edge case if current logged-in session user was deleted
      if (this.currentUser && this.currentUser.id === userId) {
        if (this.users.length > 0) {
          this.currentUser = this.users[0];
        } else {
          this.currentUser = { id: 'USR001', name: 'Surya Prashanth', email: 'surya.prashanth.kp@gmail.com', dept: 'Project Manager', role: 'admin', status: 'active' };
          this.users.push(this.currentUser);
          Storage.set('portal_users', this.users);
        }
        Storage.set('current_user', this.currentUser);
        if (this.app) this.app.currentUser = this.currentUser;
        window.dispatchEvent(new CustomEvent('portal-user-switched', { detail: this.currentUser }));
      }

      this.app.showToast(`User account '${user.name}' removed from system successfully.`, 'info');
      this.render();
    };

    if (this.app && typeof this.app.confirmModal === 'function') {
      this.app.confirmModal({
        title: 'Delete User Account',
        bodyHtml: `
          <div class="p-2">
            <p class="mb-2 font-semibold text-danger" style="font-size: 0.95rem;">Are you sure you want to delete user account <strong>${user.name}</strong> (${user.email})?</p>
            <p class="text-secondary text-xs mb-0">This will permanently remove their user profile, permissions, and corresponding entry in the Resource Planner.</p>
          </div>
        `,
        confirmText: 'Delete User Account',
        confirmClass: 'btn-enterprise-danger',
        onConfirm: executeDelete
      });
    } else {
      executeDelete();
    }
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
            <input type="text" id="share-url-input" class="form-control select-enterprise" value="${devUrl}" readonly />
            <button class="btn btn-enterprise btn-enterprise-primary" id="btn-copy-share-url" type="button">
              <i class="fa-solid fa-copy"></i> Copy Link
            </button>
          </div>
        </div>

        <div class="alert alert-info border-info-subtle bg-info-subtle text-info-emphasis p-3 rounded text-xs" style="font-size: 0.8rem;">
          <i class="fa-solid fa-shield-halved me-1"></i>
          <strong>Department & Role Control:</strong> When team members join, assign them to their respective department. Standard members will be granted entry-only permissions (cannot delete records).
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
