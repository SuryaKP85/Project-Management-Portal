/* settings.js - Portal Settings, User Management, RBAC & Sharing */

import { Storage } from './storage.js';

export const SettingsModule = {
  app: null,
  users: [],
  currentUser: null,

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
  },

  /**
   * Loads users list from storage or initializes default list
   */
  loadUsers() {
    let stored = Storage.get('portal_users');
    const ALLOWED_DEPTS = ['Dev', 'QA', 'BA', 'Product Manager'];
    const mapDept = (d) => {
      if (d === 'Engineering') return 'Dev';
      if (d === 'Design') return 'BA';
      if (d === 'QA / Test') return 'QA';
      if (d === 'Product') return 'Product Manager';
      if (ALLOWED_DEPTS.includes(d)) return d;
      return 'Dev';
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
        { id: 'USR001', name: 'Prashanth K', email: 'surya.prashanth.kp@gmail.com', dept: 'Dev', role: 'admin', status: 'active' },
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
      active = this.users[0] || { id: 'USR001', name: 'Prashanth K', email: 'surya.prashanth.kp@gmail.com', dept: 'Engineering', role: 'admin' };
      Storage.set('current_user', active);
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
   * Synchronize profile picture and user name across top navbar and sidebar
   */
  syncAvatarAcrossUI() {
    if (!this.currentUser) return;
    const avatarSrc = this.currentUser.avatar || 'assets/baby_feet.jpg';

    // Settings Preview
    const setPrev = document.getElementById('settings-avatar-preview');
    if (setPrev) setPrev.src = avatarSrc;

    // Sidebar Avatar & Info
    const sbAvatar = document.getElementById('sidebar-user-avatar');
    if (sbAvatar) sbAvatar.src = avatarSrc;

    const sbName = document.getElementById('sidebar-user-name');
    if (sbName) sbName.textContent = this.currentUser.name || 'Prashanth K';

    const sbRole = document.getElementById('sidebar-user-role');
    if (sbRole) sbRole.textContent = this.currentUser.role === 'admin' ? 'Admin Lead' : 'Team Member';

    // Top Header Avatar
    const hdrAvatar = document.getElementById('header-user-avatar');
    if (hdrAvatar) hdrAvatar.src = avatarSrc;
  },

  /**
   * Populate personal account form
   */
  renderProfileForm() {
    const nameInp = document.getElementById('settings-user-name');
    const roleInp = document.getElementById('settings-user-role');
    const emailInp = document.getElementById('settings-user-email');
    const deptInp = document.getElementById('settings-user-dept');

    if (nameInp) nameInp.value = this.currentUser.name || '';
    if (roleInp) roleInp.value = (this.currentUser.role === 'admin' ? 'Administrator (Full Access)' : 'Standard Member (Entry Only)');
    if (emailInp) emailInp.value = this.currentUser.email || '';
    if (deptInp) deptInp.value = this.currentUser.dept || 'Engineering';
  },

  /**
   * Save active user profile details
   */
  saveProfile() {
    const name = document.getElementById('settings-user-name').value.trim();
    const email = document.getElementById('settings-user-email').value.trim();
    const dept = document.getElementById('settings-user-dept').value;

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

    const depts = ['Dev', 'QA', 'BA', 'Product Manager'];
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
      const name = overlay.querySelector('#u-name').value.trim();
      const email = overlay.querySelector('#u-email').value.trim();
      const dept = overlay.querySelector('#u-dept').value;
      const role = overlay.querySelector('#u-role').value;
      const status = overlay.querySelector('#u-status').value;

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
          this.currentUser = { id: 'USR001', name: 'Prashanth K', email: 'surya.prashanth.kp@gmail.com', dept: 'Dev', role: 'admin', status: 'active' };
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
