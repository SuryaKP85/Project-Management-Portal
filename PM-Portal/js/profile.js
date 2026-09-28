/* profile.js - Profile Management and Avatar Engine (server-backed, Sprint 12) */

import { Authentication } from './authentication.js';
import { UserService } from './services/userService.js';

/**
 * Name, department and photo are stored on the V2 user record through the
 * user service. Phone, language and timezone have no server field yet and
 * remain on the local session record as display preferences.
 */
const LOCAL_PREFERENCE_FIELDS = ['phone', 'language', 'timezone'];

export const ProfileModule = {
  app: null,
  user: null,

  init(appInstance) {
    this.app = appInstance;
    this.loadProfile();
    this.setupListeners();
    this.syncAvatarAcrossUI();
    // Refresh the session record from the server so the page never shows a
    // stale name or photo; the form is repopulated when the response arrives.
    this.refreshFromServer();
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
    if (roleInp) roleInp.value = this.user.role || 'Team Member';
    if (langInp) langInp.value = this.user.language || 'en';
    if (tzInp) tzInp.value = this.user.timezone || 'UTC-05:00';

    this.renderAvatarPreview();
  },

  async refreshFromServer() {
    try {
      const serverUser = await Authentication.refreshSession();
      if (serverUser) {
        this.applyServerUser(serverUser);
        this.loadProfile();
        this.syncAvatarAcrossUI();
      }
    } catch (err) {
      console.warn('Could not refresh profile from the server:', err && err.message);
    }
  },

  renderAvatarPreview() {
    const previewEl = document.getElementById('profile-avatar-preview');
    if (!previewEl) return;

    if (this.user && this.user.avatar) {
      previewEl.innerHTML = `
        <img src="${this.user.avatar}" alt="Profile Avatar" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid var(--brand-primary); box-shadow: var(--shadow-md);" />
      `;
    } else {
      const initials = this.user ? `${(this.user.firstName?.[0] || this.user.name?.[0] || 'A')}${(this.user.lastName?.[0] || '')}` : 'A';
      previewEl.innerHTML = `
        <div class="d-flex align-items-center justify-content-center font-bold text-white shadow-sm" style="width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, var(--brand-primary), var(--brand-accent)); font-size: 2rem;">
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
      removeBtn.addEventListener('click', () => this.saveAvatar(''));
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
    reader.onload = (e) => this.saveAvatar(e.target.result);
    reader.readAsDataURL(file);
  },

  /** Stores the photo on the server profile ('' removes it). */
  async saveAvatar(dataUrl) {
    if (!this.user) return;
    try {
      const updated = await UserService.updateProfile(this.user.id, { avatarUrl: dataUrl || '' });
      this.applyServerUser(updated);
      this.renderAvatarPreview();
      this.syncAvatarAcrossUI();
      if (this.app) this.app.showToast(dataUrl ? 'Profile photo updated successfully.' : 'Profile photo removed.', dataUrl ? 'success' : 'info');
    } catch (err) {
      if (this.app) this.app.showToast(`Could not save the photo: ${(err && err.message) || 'server error'}`, 'warning');
    }
  },

  async saveProfile() {
    if (!this.user) return;

    const nameInp = document.getElementById('profile-full-name');
    const phoneInp = document.getElementById('profile-phone');
    const deptInp = document.getElementById('profile-dept');
    const langInp = document.getElementById('profile-language');
    const tzInp = document.getElementById('profile-timezone');

    const fullName = nameInp ? nameInp.value.trim() : '';
    if (!fullName) {
      if (this.app) this.app.showToast('Please enter your name.', 'warning');
      return;
    }
    const [firstName, ...rest] = fullName.split(/\s+/);
    const lastName = rest.join(' ') || this.user.lastName || '';

    // Display preferences with no server field stay on the session record.
    const preferences = {
      phone: phoneInp ? phoneInp.value.trim() : this.user.phone,
      language: langInp ? langInp.value : this.user.language,
      timezone: tzInp ? tzInp.value : this.user.timezone,
    };

    try {
      const updated = await UserService.updateProfile(this.user.id, {
        firstName,
        lastName,
        department: deptInp ? deptInp.value : this.user.department,
      });
      this.applyServerUser(updated, preferences);
      this.syncAvatarAcrossUI();
      if (this.app) this.app.showToast('Profile details saved successfully.', 'success');
    } catch (err) {
      if (this.app) this.app.showToast(`Could not save profile: ${(err && err.message) || 'server error'}`, 'warning');
    }
  },

  /**
   * Rebuilds the session record from the server user, carrying over the
   * local display preferences. The server is the only source for identity.
   */
  applyServerUser(serverUser, preferences = null) {
    const previous = this.user || Authentication.getCurrentUser() || {};
    const session = Authentication.toSessionUser(serverUser);
    if (!session) return;
    for (const field of LOCAL_PREFERENCE_FIELDS) {
      const value = preferences && preferences[field] !== undefined ? preferences[field] : previous[field];
      if (value !== undefined) session[field] = value;
    }
    this.user = session;
    Authentication.setCurrentUser(session);
  },

  syncAvatarAcrossUI() {
    this.user = Authentication.getCurrentUser();
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
        navAvatar.innerHTML = `<span class="avatar-circle font-bold d-inline-flex align-items-center justify-content-center" style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--brand-primary), var(--brand-accent)); color: #fff; font-size: 0.8rem;">${initials}</span>`;
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
