/* userManagement.js - Enterprise User Management, Roles & Access Control Module */

import { Authentication } from './authentication.js';
import { Storage } from './storage.js';
import { EmailGeneratorModule } from './emailGenerator.js';

export const UserManagementModule = {
  app: null,
  users: [],
  roles: ['Administrator', 'Project Manager', 'Product Manager', 'Developer', 'Business Analyst', 'QA', 'Viewer'],
  departments: ['Dev', 'QA', 'BA', 'Product Manager'],

  init(appInstance) {
    this.app = appInstance;
    Authentication.init();
    this.loadUsers();
    this.setupEventListeners();
    this.render();
  },

  loadUsers() {
    this.users = Authentication.getUsers() || [];
    this.saveUsers();
  },

  saveUsers() {
    Authentication.saveUsers(this.users);
    if (this.app) {
      this.app.usersList = this.users;
      
      // Also sync new users into resources list so they appear across staffing & dropdowns
      let resList = Storage.getResources();
      if (!resList || resList.length === 0) {
        resList = this.app.resourcesList || [];
      }
      
      let updated = false;
      this.users.forEach((u, idx) => {
        const uName = (u.name || `${u.firstName || ''} ${u.lastName || ''}`).trim();
        if (uName && !resList.some(r => r.name === uName)) {
          resList.push({
            id: u.id || `RES${300 + idx}`,
            name: uName,
            role: u.role || 'Team Member',
            dept: u.department || 'Dev',
            allocation: 100,
            status: 'allocated'
          });
          updated = true;
        }
      });
      
      if (updated) {
        Storage.saveResources(resList);
        this.app.resourcesList = resList;
      }
    }
  },

  setupEventListeners() {
    const addBtn = document.getElementById('settings-btn-add-user');
    if (addBtn) {
      const newBtn = addBtn.cloneNode(true);
      if (addBtn.parentNode) addBtn.parentNode.replaceChild(newBtn, addBtn);
      newBtn.addEventListener('click', () => {
        this.openUserModal();
      });
    }
  },

  render() {
    this.loadUsers();
    const tableBody = document.getElementById('settings-users-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (this.users.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No team members registered.</td></tr>`;
      return;
    }

    this.users.forEach(u => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';

      const statusBadge = u.status === 'active' 
        ? '<span class="badge bg-success-subtle text-success font-semibold">Active</span>'
        : '<span class="badge bg-secondary-subtle text-muted font-semibold">Inactive</span>';

      const avatarHtml = u.avatar 
        ? `<img src="${u.avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" alt="Avatar" />`
        : `<div class="avatar-circle font-bold d-inline-flex align-items-center justify-content-center me-2" style="width: 32px; height: 32px; border-radius: 50%; background-color: var(--brand-primary); color: white; font-size: 0.75rem;">
            ${(u.firstName?.[0] || u.name?.[0] || 'U')}${(u.lastName?.[0] || '')}
           </div>`;

      tr.innerHTML = `
        <td style="padding: 12px 16px;">
          <div class="d-flex align-items-center gap-2">
            ${avatarHtml}
            <div>
              <div class="font-bold text-primary-custom" style="color: var(--text-primary); font-size: 0.9rem;">${u.name || u.firstName + ' ' + u.lastName}</div>
              <small class="text-muted d-block" style="font-size: 0.75rem;">Manager: ${u.manager || 'N/A'}</small>
            </div>
          </div>
        </td>
        <td style="padding: 12px 16px;"><span class="font-mono text-secondary-custom" style="font-size: 0.85rem;">${u.email}</span></td>
        <td style="padding: 12px 16px;"><span class="badge bg-light text-dark border font-semibold">${u.department || 'Dev'}</span></td>
        <td style="padding: 12px 16px;"><span class="font-semibold text-primary" style="font-size: 0.85rem;">${u.role}</span></td>
        <td style="padding: 12px 16px;">${statusBadge}</td>
        <td class="text-center" style="padding: 12px 16px;">
          <div class="dropdown">
            <button class="btn btn-sm btn-light border py-1 px-2 font-semibold" type="button" data-bs-toggle="dropdown">
              Actions <i class="fa-solid fa-chevron-down ms-1" style="font-size: 0.7rem;"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-sm">
              <li><button class="dropdown-item py-1.5 font-semibold text-primary btn-action-edit" data-id="${u.id}"><i class="fa-solid fa-pen me-2"></i> Edit User</button></li>
              <li><button class="dropdown-item py-1.5 font-semibold text-info btn-action-email" data-id="${u.id}"><i class="fa-solid fa-paper-plane me-2"></i> Send Credentials</button></li>
              <li><button class="dropdown-item py-1.5 font-semibold text-warning btn-action-reset" data-id="${u.id}"><i class="fa-solid fa-key me-2"></i> Reset Password</button></li>
              <li><button class="dropdown-item py-1.5 font-semibold ${u.status === 'active' ? 'text-secondary' : 'text-success'} btn-action-toggle-status" data-id="${u.id}">
                <i class="fa-solid ${u.status === 'active' ? 'fa-user-slash' : 'fa-user-check'} me-2"></i> ${u.status === 'active' ? 'Deactivate Account' : 'Activate Account'}
              </button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item py-1.5 font-semibold text-danger btn-action-delete" data-id="${u.id}"><i class="fa-solid fa-trash me-2"></i> Delete User</button></li>
            </ul>
          </div>
        </td>
      `;

      tableBody.appendChild(tr);
    });

    // Attach row action listeners
    this.attachRowActionListeners();
  },

  attachRowActionListeners() {
    const editBtns = document.querySelectorAll('.btn-action-edit');
    const emailBtns = document.querySelectorAll('.btn-action-email');
    const resetBtns = document.querySelectorAll('.btn-action-reset');
    const toggleBtns = document.querySelectorAll('.btn-action-toggle-status');
    const deleteBtns = document.querySelectorAll('.btn-action-delete');

    editBtns.forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.openUserModal(id);
      });
    });

    emailBtns.forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const target = this.users.find(u => u.id === id);
        if (target) {
          EmailGeneratorModule.sendCredentials(target, 'iRely@123');
          if (this.app) this.app.showToast(`Mail client triggered for ${target.email}`, 'info');
        }
      });
    });

    resetBtns.forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const res = Authentication.resetPassword(this.users.find(u => u.id === id)?.email, 'iRely@123');
        if (res.success) {
          if (this.app) this.app.showToast(`Password reset to 'iRely@123' for user.`, 'success');
          this.render();
        }
      });
    });

    toggleBtns.forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const target = this.users.find(u => u.id === id);
        if (target) {
          target.status = target.status === 'active' ? 'inactive' : 'active';
          this.saveUsers();
          if (this.app) this.app.showToast(`Account status set to ${target.status}`, 'info');
          this.render();
        }
      });
    });

    deleteBtns.forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        this.deleteUser(id);
      });
    });
  },

  deleteUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    if (user.email === 'admin@company.com') {
      if (this.app) this.app.showToast('Root System Administrator account cannot be deleted.', 'danger');
      return;
    }

    const execute = () => {
      this.users = this.users.filter(u => u.id !== userId);
      this.saveUsers();
      if (this.app) this.app.showToast(`User ${user.name || user.email} deleted successfully.`, 'info');
      this.render();
    };

    if (this.app && typeof this.app.confirmModal === 'function') {
      this.app.confirmModal({
        title: 'Delete Team Member Account',
        bodyHtml: `<div class="p-2"><p class="mb-1 text-danger font-semibold">Are you sure you want to delete user account <strong>${user.name}</strong> (${user.email})?</p><p class="text-secondary text-xs mb-0">This action will revoke all system access for this user.</p></div>`,
        confirmText: 'Delete User Account',
        confirmClass: 'btn-enterprise-danger',
        onConfirm: execute
      });
    } else {
      execute();
    }
  },

  openUserModal(userId = null) {
    const target = userId ? this.users.find(u => u.id === userId) : null;
    const isEdit = !!target;
    const title = isEdit ? 'Edit Team Member / User Profile' : 'Add New Enterprise User Account';

    let roleOptions = '';
    this.roles.forEach(r => {
      const sel = (target && target.role === r) ? 'selected' : '';
      roleOptions += `<option value="${r}" ${sel}>${r}</option>`;
    });

    let deptOptions = '';
    this.departments.forEach(d => {
      const sel = (target && target.department === d) ? 'selected' : '';
      deptOptions += `<option value="${d}" ${sel}>${d}</option>`;
    });

    const bodyHtml = `
      <form id="user-edit-form" class="row g-3">
        <div class="col-md-6">
          <label class="form-label font-semibold">First Name *</label>
          <input type="text" class="form-control select-enterprise w-100" id="usr-fname" value="${target ? (target.firstName || target.name.split(' ')[0]) : ''}" required placeholder="First name" />
        </div>
        
        <div class="col-md-6">
          <label class="form-label font-semibold">Last Name *</label>
          <input type="text" class="form-control select-enterprise w-100" id="usr-lname" value="${target ? (target.lastName || target.name.split(' ').slice(1).join(' ')) : ''}" required placeholder="Last name" />
        </div>

        <div class="col-md-12">
          <label class="form-label font-semibold">Email Address (Username) *</label>
          <input type="email" class="form-control select-enterprise w-100" id="usr-email" value="${target ? target.email : ''}" required placeholder="name@company.com" ${isEdit ? 'readonly style="background-color: var(--bg-light);"' : ''} />
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Department *</label>
          <select class="form-select select-enterprise w-100" id="usr-dept" required>
            ${deptOptions}
          </select>
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Assigned System Role *</label>
          <select class="form-select select-enterprise w-100" id="usr-role" required>
            ${roleOptions}
          </select>
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Phone Number</label>
          <input type="text" class="form-control select-enterprise w-100" id="usr-phone" value="${target ? (target.phone || '') : ''}" placeholder="+1 (555) 000-0000" />
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Reporting Manager</label>
          <input type="text" class="form-control select-enterprise w-100" id="usr-manager" value="${target ? (target.manager || 'System Administrator') : 'System Administrator'}" placeholder="Manager Name" />
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Account Status</label>
          <select class="form-select select-enterprise w-100" id="usr-status">
            <option value="active" ${!target || target.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${target && target.status !== 'active' ? 'selected' : ''}>Inactive / Suspended</option>
          </select>
        </div>

        ${!isEdit ? `
          <div class="col-md-6 d-flex align-items-center pt-4">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" id="usr-send-email-check" checked />
              <label class="form-check-label font-semibold text-primary" for="usr-send-email-check">Send credentials email automatically</label>
            </div>
          </div>
        ` : ''}
      </form>
    `;

    this.app.openModal(title, bodyHtml, (overlay) => {
      const fName = overlay.querySelector('#usr-fname').value.trim();
      const lName = overlay.querySelector('#usr-lname').value.trim();
      const email = overlay.querySelector('#usr-email').value.trim();
      const dept = overlay.querySelector('#usr-dept').value;
      const role = overlay.querySelector('#usr-role').value;
      const phone = overlay.querySelector('#usr-phone').value.trim();
      const manager = overlay.querySelector('#usr-manager').value.trim();
      const status = overlay.querySelector('#usr-status').value;
      const sendEmailCheck = overlay.querySelector('#usr-send-email-check')?.checked;

      if (!fName || !lName || !email) {
        if (this.app) this.app.showToast('First name, last name, and email address are required.', 'warning');
        return false;
      }

      if (isEdit) {
        const idx = this.users.findIndex(u => u.id === target.id);
        if (idx !== -1) {
          this.users[idx] = {
            ...this.users[idx],
            firstName: fName,
            lastName: lName,
            name: `${fName} ${lName}`,
            department: dept,
            role,
            phone,
            manager,
            status
          };
          this.saveUsers();
          if (this.app) this.app.showToast(`Updated user profile for ${fName} ${lName}`, 'success');
        }
      } else {
        // Check duplicate email
        if (this.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
          if (this.app) this.app.showToast('A user with this email address already exists.', 'danger');
          return false;
        }

        const newUser = {
          id: `USR00${this.users.length + 1}`,
          firstName: fName,
          lastName: lName,
          name: `${fName} ${lName}`,
          email,
          passwordHash: 'iRely@123',
          department: dept,
          role,
          phone,
          manager: manager || 'System Administrator',
          status,
          avatar: '',
          mustChangePassword: true,
          createdAt: new Date().toISOString()
        };

        this.users.push(newUser);
        this.saveUsers();

        if (sendEmailCheck) {
          EmailGeneratorModule.sendCredentials(newUser, 'iRely@123');
        }

        if (this.app) this.app.showToast(`User account created successfully for ${newUser.name}`, 'success');
      }

      this.render();
      return true;
    });
  }
};
