/* profile.js - Profile Management and Avatar Engine */

import { Authentication } from './authentication.js';
import { Storage } from './storage.js';

export const ProfileModule = {
  app: null,
  user: null,

  init(appInstance) {
    this.app = appInstance;
    this.loadProfile();
    this.setupListeners();
    this.syncAvatarAcrossUI();
  },

  loadProfile() {
    this.user = Authentication.getCurrentUser();
    if (!this.user) return;

    // Populate profile inputs if element exists
    const nameInp = document.getElementById('profile-full-name');
    const emailInp = document.getElementById('profile-email');
    const phoneInp = document.getElementById('profile-phone');
    const deptInp = document.getElementById('profile-dept');
    const roleInp = document.getElementById('profile-role');
    const langInp = document.getElementById('profile-language');
    const tzInp = document.getElementById('profile-timezone');

    if (nameInp) nameInp.value = this.user.name || `${this.user.firstName || ''} ${this.user.lastName || ''}`.trim();
    if (emailInp) emailInp.value = this.user.email || '';
    if (phoneInp) phoneInp.value = this.user.phone || '';
    if (deptInp) deptInp.value = this.user.department || 'Dev';
    if (roleInp) roleInp.value = this.user.role || 'Administrator';
    if (langInp) langInp.value = this.user.language || 'en';
    if (tzInp) tzInp.value = this.user.timezone || 'UTC-05:00';

    this.renderAvatarPreview();
  },

  renderAvatarPreview() {
    const previewEl = document.getElementById('profile-avatar-preview');
    if (!previewEl) return;

    if (this.user && this.user.avatar) {
      previewEl.innerHTML = `
        <img src="${this.user.avatar}" alt="Profile Avatar" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid var(--brand-primary);" />
      `;
    } else {
      const initials = this.user ? `${(this.user.firstName?.[0] || this.user.name?.[0] || 'A')}${(this.user.lastName?.[0] || '')}` : 'A';
      previewEl.innerHTML = `
        <div class="d-flex align-items-center justify-content-center font-bold text-white shadow-sm" style="width: 100px; height: 100px; border-radius: 50%; background-color: var(--brand-primary); font-size: 2.2rem; border: 3px solid var(--border-color);">
          ${initials}
        </div>
      `;
    }
  },

  setupListeners() {
    const form = document.getElementById('profile-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveProfile();
      });
    }

    // Drag and Drop & File Upload for Avatar
    const dropZone = document.getElementById('profile-avatar-dropzone');
    const fileInp = document.getElementById('profile-avatar-file-input');
    const removeBtn = document.getElementById('profile-avatar-remove-btn');

    if (dropZone && fileInp) {
      dropZone.addEventListener('click', () => fileInp.click());

      ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropZone.classList.add('border-primary', 'bg-primary-subtle');
        });
      });

      ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropZone.classList.remove('border-primary', 'bg-primary-subtle');
        });
      });

      dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          this.handleImageUpload(files[0]);
        }
      });

      fileInp.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleImageUpload(e.target.files[0]);
        }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (this.user) {
          this.user.avatar = '';
          this.updateUserData(this.user);
          this.renderAvatarPreview();
          this.syncAvatarAcrossUI();
          if (this.app) this.app.showToast('Profile photo removed.', 'info');
        }
      });
    }
  },

  handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
      if (this.app) this.app.showToast('Please upload an image file (PNG, JPG, WEBP).', 'warning');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (this.app) this.app.showToast('Image size exceeds 5MB limit.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target.result;
      if (this.user) {
        this.user.avatar = base64Data;
        this.updateUserData(this.user);
        this.renderAvatarPreview();
        this.syncAvatarAcrossUI();
        if (this.app) this.app.showToast('Profile photo updated successfully.', 'success');
      }
    };
    reader.readAsDataURL(file);
  },

  saveProfile() {
    if (!this.user) return;

    const nameInp = document.getElementById('profile-full-name');
    const phoneInp = document.getElementById('profile-phone');
    const deptInp = document.getElementById('profile-dept');
    const langInp = document.getElementById('profile-language');
    const tzInp = document.getElementById('profile-timezone');

    if (nameInp) this.user.name = nameInp.value.trim();
    if (phoneInp) this.user.phone = phoneInp.value.trim();
    if (deptInp) this.user.department = deptInp.value;
    if (langInp) this.user.language = langInp.value;
    if (tzInp) this.user.timezone = tzInp.value;

    this.updateUserData(this.user);
    this.syncAvatarAcrossUI();
    if (this.app) this.app.showToast('Profile details saved successfully.', 'success');
  },

  updateUserData(updatedUser) {
    this.user = updatedUser;
    Authentication.setCurrentUser(updatedUser);

    // Update in users registry
    const users = Authentication.getUsers() || [];
    const idx = users.findIndex(u => u.id === updatedUser.id);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...updatedUser };
      Authentication.saveUsers(users);
    }
  },

  syncAvatarAcrossUI() {
    this.user = Authentication.getCurrentUser() || Storage.get('current_user');
    if (!this.user) return;

    const avatarSrc = this.user.avatar || 'assets/baby_feet.jpg';

    // Settings Preview
    const setPrev = document.getElementById('settings-avatar-preview');
    if (setPrev) setPrev.src = avatarSrc;

    // Top-right corner avatar
    const hdrAvatar = document.getElementById('header-user-avatar');
    if (hdrAvatar) hdrAvatar.src = avatarSrc;

    const navAvatar = document.getElementById('top-user-avatar');
    if (navAvatar) {
      if (this.user.avatar) {
        navAvatar.innerHTML = `<img src="${this.user.avatar}" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" />`;
      } else {
        const initials = `${(this.user.firstName?.[0] || this.user.name?.[0] || 'A')}${(this.user.lastName?.[0] || '')}`;
        navAvatar.innerHTML = `<span class="avatar-circle font-bold d-inline-flex align-items-center justify-content-center" style="width: 32px; height: 32px; border-radius: 50%; background-color: var(--brand-primary); color: white; font-size: 0.8rem;">${initials}</span>`;
      }
    }

    // Top-right user display name
    const navName = document.getElementById('top-user-name');
    if (navName) {
      const fullName = (this.user.name || this.user.firstName || 'User').trim();
      navName.textContent = fullName.split(' ')[0] || fullName;
    }

    // Sidebar bottom-left corner avatar
    const sbAvatar = document.getElementById('sidebar-user-avatar');
    if (sbAvatar) sbAvatar.src = avatarSrc;

    // Sidebar bottom-left corner name (display first name)
    const sbName = document.getElementById('sidebar-user-name');
    if (sbName) {
      const fullName = (this.user.name || this.user.firstName || 'User').trim();
      sbName.textContent = fullName.split(' ')[0] || fullName;
    }
  }
};
