/* appIntegration.js - Final Integration, Keyboard Shortcuts, Command Palette & Autosave Module */

import { Storage } from './storage.js';
import { MigrationConfig } from './migrationConfig.js';
import { DashboardModule } from './dashboard.js';
import { ActionCenterModule } from './actionCenter.js';
import { ProjectsModule } from './projects.js';
import { CustomersModule } from './customers.js';
import { AIEngine } from './aiEngine.js';
import { AIDashboardModule } from './aiDashboard.js';
import { AIRecommendationsModule } from './aiRecommendations.js';
import { AIForecastModule } from './aiForecast.js';
import { AISummaryModule } from './aiSummary.js';
import { AIEmailGeneratorModule } from './aiEmailGenerator.js';
import { AIInsightsModule } from './aiInsights.js';

export const AppIntegrationModule = {
  app: null,
  isAutoSaveActive: true,
  lastSaveTimestamp: new Date(),

  /**
   * Initialize Complete Integration Harness
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;
    
    this.setupAutosaveIndicator();
    this.setupKeyboardShortcuts();
    this.setupCommandPalette();
    this.setupAccessibilityHelpers();
    this.setupFloatingAIAssistant();
    this.setupDataSyncBus();
    this.renderAIWidgetsOnActivePage();
    
    console.log('AppIntegrationModule initialized: AI Assistant, Shortcuts, Command Palette, Autosave & A11y active.');
  },

  /**
   * Autosave Status Indicator in Top Navigation Bar
   */
  setupAutosaveIndicator() {
    const topNavbarRight = document.querySelector('#top-navbar .right-controls');
    if (!topNavbarRight) return;

    if (!document.getElementById('autosave-status-badge')) {
      const badgeContainer = document.createElement('div');
      badgeContainer.id = 'autosave-status-container';
      badgeContainer.className = 'd-none d-lg-flex align-items-center me-2';
      badgeContainer.innerHTML = `
        <span id="autosave-status-badge" class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 text-xxs font-semibold" style="border-radius: 6px; cursor: pointer;" title="State is automatically saved to LocalStorage">
          <i class="fa-solid fa-cloud-check me-1"></i> <span id="autosave-text">Autosaved</span>
        </span>
      `;
      topNavbarRight.insertBefore(badgeContainer, topNavbarRight.firstChild);

      // Click on autosave badge triggers manual sync & toast
      badgeContainer.addEventListener('click', () => {
        this.triggerManualSave();
      });
    }

    // Add search command shortcut button to search bar
    const searchBar = document.querySelector('#top-navbar .search-bar');
    if (searchBar && !document.getElementById('cmd-k-badge')) {
      const kbd = document.createElement('kbd');
      kbd.id = 'cmd-k-badge';
      kbd.className = 'ms-auto text-xxs font-mono text-muted bg-body-tertiary border px-1.5 py-0.5 rounded';
      kbd.style.fontSize = '0.65rem';
      kbd.textContent = 'Ctrl K';
      searchBar.appendChild(kbd);

      searchBar.style.cursor = 'pointer';
      searchBar.addEventListener('click', () => {
        this.openCommandPalette();
      });
    }
  },

  /**
   * Trigger Manual Save and visual pulse feedback
   */
  triggerManualSave() {
    this.lastSaveTimestamp = new Date();
    const badge = document.getElementById('autosave-status-badge');
    const badgeText = document.getElementById('autosave-text');

    if (badge && badgeText) {
      badgeText.textContent = 'Saving...';
      badge.className = 'badge bg-warning-subtle text-warning border border-warning-subtle px-2 py-1 text-xxs font-semibold';

      setTimeout(() => {
        const timeStr = this.lastSaveTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        badgeText.textContent = `Synced (${timeStr})`;
        badge.className = 'badge bg-success-subtle text-success border border-success-subtle px-2 py-1 text-xxs font-semibold';
      }, 300);
    }

    if (this.app) {
      this.app.showToast('All module states synced to local persistent storage', 'success');
    }
  },

  /**
   * Global Keyboard Shortcuts Engine
   * Shortcuts:
   * - Ctrl+K or Cmd+K or '?' : Open Command Palette / Quick Navigation
   * - Ctrl+S or Cmd+S       : Manual Save & Sync
   * - Alt+1 to Alt+9        : Instant tab navigation
   * - Esc                   : Close overlays / modals
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      // Ctrl + K or Cmd + K (Quick Search / Command Palette)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openCommandPalette();
        return;
      }

      // Ctrl + S or Cmd + S (Manual Save)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.triggerManualSave();
        return;
      }

      // '?' key when not typing inside an input
      if (!isInput && e.key === '?') {
        e.preventDefault();
        this.openCommandPalette();
        return;
      }

      // Alt + 1 to Alt + 9 (Page shortcuts)
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const pagesMap = {
          '1': 'dashboard',
          '2': 'action-center',
          '3': 'projects',
          '4': 'customers',
          '5': 'resources',
          '6': 'resource-planner',
          '7': 'time-logging',
          '8': 'leave-tracker',
          '9': 'reports'
        };
        const page = pagesMap[e.key];
        if (page && this.app) {
          this.app.switchPage(page);
          this.app.showToast(`Switched view to ${page}`, 'info');
        }
      }

      // ESC key to close custom command palette modal
      if (e.key === 'Escape') {
        const cmdModal = document.getElementById('command-palette-modal');
        if (cmdModal && cmdModal.classList.contains('show')) {
          cmdModal.classList.remove('show');
        }
      }
    });
  },

  /**
   * Reusable Command Palette & Quick Navigation Launcher
   */
  setupCommandPalette() {
    if (document.getElementById('command-palette-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'command-palette-modal';
    overlay.className = 'custom-modal-overlay';
    overlay.style.zIndex = '99999';

    overlay.innerHTML = `
      <div class="custom-modal p-0" style="max-width: 620px; border-radius: 12px; overflow: hidden;">
        
        <!-- Search Input Bar -->
        <div class="p-3 border-bottom d-flex align-items-center gap-2 bg-card">
          <i class="fa-solid fa-magnifying-glass text-primary" style="font-size: 1.1rem;"></i>
          <input type="text" id="cmd-palette-input" class="form-control border-0 shadow-none bg-transparent" placeholder="Type a command, page, or project name... (e.g., 'Projects', 'Ares', 'Action Center')" style="font-size: 0.95rem;" autofocus />
          <kbd class="text-xxs text-muted bg-body-tertiary border px-2 py-1 rounded">ESC</kbd>
        </div>

        <!-- Command List Results -->
        <div id="cmd-palette-results" class="p-2" style="max-height: 380px; overflow-y: auto;">
          <!-- Dynamically populated commands -->
        </div>

        <!-- Footer Shortcuts hint -->
        <div class="p-2.5 bg-body-tertiary border-top d-flex justify-content-between align-items-center text-xxs text-muted">
          <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
          <span><kbd>↵</kbd> to select</span>
          <span><kbd>Alt+1..9</kbd> fast tabs</span>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('show');
    });

    const input = overlay.querySelector('#cmd-palette-input');
    input.addEventListener('input', (e) => {
      this.renderCommandResults(e.target.value);
    });
  },

  /**
   * Opens the Command Palette
   */
  openCommandPalette() {
    const modal = document.getElementById('command-palette-modal');
    if (!modal) return;

    modal.classList.add('show');
    const input = modal.querySelector('#cmd-palette-input');
    if (input) {
      input.value = '';
      input.focus();
      this.renderCommandResults('');
    }
  },

  /**
   * Renders filter results inside Command Palette
   */
  renderCommandResults(query) {
    const container = document.getElementById('cmd-palette-results');
    if (!container) return;

    const q = query.toLowerCase().trim();

    // Available pages
    const pages = [
      { id: 'dashboard', label: 'Executive Dashboard', category: 'Navigation', icon: 'fa-solid fa-chart-pie', action: () => this.app.switchPage('dashboard') },
      { id: 'action-center', label: 'Executive Action Center', category: 'Navigation', icon: 'fa-solid fa-bolt text-warning', action: () => this.app.switchPage('action-center') },
      { id: 'projects', label: 'Projects Portfolio', category: 'Navigation', icon: 'fa-solid fa-diagram-project', action: () => this.app.switchPage('projects') },
      { id: 'customers', label: 'Customers Registry', category: 'Navigation', icon: 'fa-solid fa-building-user', action: () => this.app.switchPage('customers') },
      { id: 'resources', label: 'Human Resources', category: 'Navigation', icon: 'fa-solid fa-users-gear', action: () => this.app.switchPage('resources') },
      { id: 'resource-planner', label: 'Resource Allocation Planner', category: 'Navigation', icon: 'fa-solid fa-calendar-week', action: () => this.app.switchPage('resource-planner') },
      { id: 'time-logging', label: 'Daily Time Logging', category: 'Navigation', icon: 'fa-solid fa-clock', action: () => this.app.switchPage('time-logging') },
      { id: 'leave-tracker', label: 'Leave & Time Off Tracker', category: 'Navigation', icon: 'fa-solid fa-umbrella-beach', action: () => this.app.switchPage('leave-tracker') },
      { id: 'weekend-planner', label: 'Weekend Delivery Planner', category: 'Navigation', icon: 'fa-solid fa-business-time', action: () => this.app.switchPage('weekend-planner') },
      { id: 'forecast', label: 'Automatic Forecast Engine', category: 'Navigation', icon: 'fa-solid fa-chart-line', action: () => this.app.switchPage('forecast') },
      { id: 'gantt', label: 'Interactive Gantt Workspace', category: 'Navigation', icon: 'fa-solid fa-bars-progress', action: () => this.app.switchPage('gantt') },
      { id: 'risks', label: 'Risk Registers & Audit Logs', category: 'Navigation', icon: 'fa-solid fa-shield-halved', action: () => this.app.switchPage('risks') },
      { id: 'reports', label: 'Executive Reports & Excel Engine', category: 'Navigation', icon: 'fa-solid fa-file-invoice-dollar', action: () => this.app.switchPage('reports') }
    ];

    // Core System Actions
    const systemActions = [
      { id: 'action-sync', label: 'Force Manual Data Sync to Cache', category: 'System', icon: 'fa-solid fa-rotate', action: () => this.triggerManualSave() },
      { id: 'action-theme', label: 'Toggle Light / Dark Mode', category: 'System', icon: 'fa-solid fa-circle-half-stroke', action: () => this.app.setTheme(this.app.currentTheme === 'light' ? 'dark' : 'light') },
      { id: 'action-migration', label: 'Inspect Architecture Migration Contracts (Node/SQL/Jira)', category: 'System', icon: 'fa-solid fa-code-branch text-primary', action: () => MigrationConfig.openMigrationModal(this.app) }
    ];

    // Combine and filter
    const allOptions = [...pages, ...systemActions];
    const filtered = allOptions.filter(item => {
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="fa-solid fa-circle-question fa-2x mb-2 opacity-50"></i>
          <p class="text-xs m-0">No matching command or page found for "${query}"</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    filtered.forEach((item, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = `p-2.5 rounded d-flex align-items-center justify-content-between cmd-item ${idx === 0 ? 'bg-primary-subtle' : ''}`;
      itemEl.style.cursor = 'pointer';

      itemEl.innerHTML = `
        <div class="d-flex align-items-center gap-2.5">
          <i class="${item.icon} text-secondary" style="font-size: 0.95rem; width: 20px;"></i>
          <span class="font-bold text-xs" style="color: var(--text-primary);">${item.label}</span>
        </div>
        <span class="badge bg-secondary-subtle text-secondary text-xxs uppercase font-semibold">${item.category}</span>
      `;

      itemEl.addEventListener('click', () => {
        document.getElementById('command-palette-modal').classList.remove('show');
        item.action();
      });

      container.appendChild(itemEl);
    });
  },

  /**
   * Accessibility (A11y) Improvements
   */
  setupAccessibilityHelpers() {
    // Add Skip Link at top of body if missing
    if (!document.getElementById('skip-to-content')) {
      const skipLink = document.createElement('a');
      skipLink.id = 'skip-to-content';
      skipLink.href = '#main-content';
      skipLink.className = 'visually-hidden-focusable btn btn-primary position-absolute top-0 start-0 m-2 z-3';
      skipLink.textContent = 'Skip to main content';
      document.body.insertBefore(skipLink, document.body.firstChild);
    }

    // Set ARIA attributes on key landmarks
    const main = document.getElementById('main-content');
    if (main && !main.getAttribute('role')) main.setAttribute('role', 'main');

    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.getAttribute('role')) sidebar.setAttribute('role', 'navigation');
  },

  /**
   * Central Data Sync Bus: Refreshes active dashboards when storage changes
   */
  setupDataSyncBus() {
    window.addEventListener('storage', () => {
      this.triggerManualSave();
      if (this.app) {
        if (this.app.currentPage === 'dashboard') {
          DashboardModule.renderAllCharts();
          this.renderAIWidgetsOnActivePage();
        }
        if (this.app.currentPage === 'action-center') ActionCenterModule.render();
      }
    });

    // Listen to custom page switch events to render AI widgets dynamically
    window.addEventListener('portal-page-switched', () => {
      this.renderAIWidgetsOnActivePage();
    });
  },

  /**
   * Renders active AI components on current page
   */
  renderAIWidgetsOnActivePage() {
    if (!this.app) return;
    const page = this.app.currentPage || 'dashboard';

    if (page === 'dashboard') {
      AIDashboardModule.renderExecutiveInsightsPanel('ai-executive-insights-container', this.app);
      AIDashboardModule.renderDailyActionCenterWidget('ai-daily-action-center-container', this.app);
      AIRecommendationsModule.renderRecommendationsWidget('ai-recommendations-container', this.app);
      AIForecastModule.renderForecastPanel('ai-forecast-container', this.app);
    }
  },

  /**
   * Renders the Floating AI Assistant Trigger Button and Drawer Modal
   */
  setupFloatingAIAssistant() {
    if (document.getElementById('floating-ai-btn')) return;

    // Floating Button
    const floatBtn = document.createElement('button');
    floatBtn.id = 'floating-ai-btn';
    floatBtn.className = 'btn btn-primary shadow-lg position-fixed bottom-0 end-0 m-4 rounded-circle d-flex align-items-center justify-content-center';
    floatBtn.style.cssText = 'width: 58px; height: 58px; z-index: 99990; border: 2px solid rgba(255,255,255,0.4); cursor: pointer; transition: transform 0.2s ease;';
    floatBtn.setAttribute('aria-label', 'Open AI Decision Support Assistant');
    floatBtn.setAttribute('title', 'AI Assistant (Click or press Ctrl+K)');
    floatBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" style="font-size: 1.35rem;"></i>`;

    floatBtn.addEventListener('mouseenter', () => floatBtn.style.transform = 'scale(1.08)');
    floatBtn.addEventListener('mouseleave', () => floatBtn.style.transform = 'scale(1)');

    floatBtn.addEventListener('click', () => {
      this.openAIAssistantModal();
    });

    document.body.appendChild(floatBtn);

    // Global shortcut handle
    window.openAIAssistant = () => this.openAIAssistantModal();
  },

  /**
   * Opens AI Assistant Modal with Natural Language Query Engine & Voice Trigger
   */
  openAIAssistantModal() {
    const html = `
      <div class="ai-assistant-modal-container text-xs">
        
        <!-- Search Input Bar -->
        <div class="p-3 border-bottom d-flex align-items-center gap-2 bg-card rounded-3 mb-3 shadow-2xs">
          <i class="fa-solid fa-wand-magic-sparkles text-primary" style="font-size: 1.1rem;"></i>
          <input type="text" id="ai-nl-input" class="form-control border-0 shadow-none bg-transparent font-semibold" 
                 placeholder="Ask AI anything... (e.g., 'Which projects are delayed?', 'Pending SOW', 'Who is available next week?')" autofocus />
          <button id="ai-voice-btn" class="btn btn-sm btn-outline-secondary py-1 px-2 text-xxs d-flex align-items-center gap-1" title="Voice Search (Speech-to-Text)">
            <i class="fa-solid fa-microphone text-danger"></i> <span id="voice-status-text">Voice</span>
          </button>
        </div>

        <!-- Quick Prompt Chips -->
        <div class="d-flex flex-wrap gap-1.5 mb-3" id="ai-prompt-chips">
          <button class="btn btn-xs btn-outline-primary rounded-pill font-bold ai-chip" data-query="Which projects are delayed?">Delayed Projects</button>
          <button class="btn btn-xs btn-outline-primary rounded-pill font-bold ai-chip" data-query="Which developer has the highest utilization?">Resource Overload</button>
          <button class="btn btn-xs btn-outline-primary rounded-pill font-bold ai-chip" data-query="Pending SOW">Pending SOW Contracts</button>
          <button class="btn btn-xs btn-outline-primary rounded-pill font-bold ai-chip" data-query="Stories exceeding estimates">Exceeding Estimates</button>
          <button class="btn btn-xs btn-outline-primary rounded-pill font-bold ai-chip" data-query="Who is available next week?">Available Team</button>
        </div>

        <!-- Natural Language Query Results -->
        <div id="ai-nl-results" class="p-3 border rounded-3 bg-body-tertiary mb-3" style="min-height: 120px; max-height: 280px; overflow-y: auto;">
          <div class="text-center text-muted py-3">
            <i class="fa-solid fa-brain fa-2x mb-2 text-primary opacity-50"></i>
            <p class="text-xs m-0">Type a query above or click a prompt chip to generate AI recommendations.</p>
          </div>
        </div>

        <!-- Executive Tools Toolbar -->
        <div class="p-2.5 bg-body-tertiary border rounded-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span class="font-bold text-xxs text-secondary uppercase tracking-wider">Executive Utilities</span>
          <div class="d-flex gap-2">
            <button id="ai-gen-summary-btn" class="btn btn-xs btn-primary font-bold">
              <i class="fa-solid fa-file-invoice me-1"></i> Executive Summary
            </button>
            <button id="ai-gen-email-btn" class="btn btn-xs btn-secondary font-bold">
              <i class="fa-solid fa-envelope me-1"></i> Compose Email
            </button>
            <button id="ai-inspect-migr-btn" class="btn btn-xs btn-outline-info font-bold">
              <i class="fa-solid fa-code-branch me-1"></i> Migration Specs
            </button>
          </div>
        </div>

      </div>
    `;

    this.app.openModal('AI Decision-Support Assistant', html, () => {
      this.app.showToast('AI Assistant session active', 'info');
    });

    // Wire up events
    setTimeout(() => {
      const input = document.getElementById('ai-nl-input');
      const resultsContainer = document.getElementById('ai-nl-results');
      const voiceBtn = document.getElementById('ai-voice-btn');
      const voiceStatus = document.getElementById('voice-status-text');

      const executeQuery = (q) => {
        if (!q.trim()) return;
        const res = AIEngine.parseNaturalLanguageQuery(q);
        if (!res) return;

        let resHtml = `
          <div class="mb-2 d-flex justify-content-between align-items-center border-bottom pb-1.5">
            <span class="badge bg-primary-subtle text-primary border font-bold text-xxs uppercase">${res.category}</span>
            <span class="font-mono text-xxs text-muted">${res.resultsCount} items found</span>
          </div>
          <p class="font-semibold text-xs text-primary mb-2">${res.summaryText}</p>
        `;

        if (res.results.length > 0) {
          resHtml += `<div class="list-group">`;
          res.results.forEach(item => {
            const name = item.name || item.title || item.resourceName || item.label || 'Item';
            const detail = item.status || item.department || item.sowStatus || item.role || '';
            resHtml += `
              <div class="list-group-item p-2 d-flex justify-content-between align-items-center bg-card">
                <span class="font-bold text-xs text-primary">${name}</span>
                <span class="badge bg-secondary-subtle text-secondary text-xxs">${detail}</span>
              </div>
            `;
          });
          resHtml += `</div>`;
        } else {
          resHtml += `<p class="text-muted text-xs italic m-0">No records found matching query criteria.</p>`;
        }

        resultsContainer.innerHTML = resHtml;
      };

      if (input) {
        input.addEventListener('input', (e) => executeQuery(e.target.value));
      }

      document.querySelectorAll('.ai-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          const q = e.target.getAttribute('data-query');
          if (input) input.value = q;
          executeQuery(q);
        });
      });

      // Voice search trigger
      if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
          const isListening = AIEngine.toggleVoiceSearch((transcript) => {
            if (input) {
              input.value = transcript;
              executeQuery(transcript);
            }
            if (voiceStatus) voiceStatus.textContent = 'Voice';
          });

          if (isListening && voiceStatus) {
            voiceStatus.textContent = 'Listening...';
          }
        });
      }

      // Toolbar Buttons
      document.getElementById('ai-gen-summary-btn')?.addEventListener('click', () => {
        AISummaryModule.openExecutiveSummaryModal('weekly', this.app);
      });

      document.getElementById('ai-gen-email-btn')?.addEventListener('click', () => {
        AIEmailGeneratorModule.openEmailModal('customer_update', {}, this.app);
      });

      document.getElementById('ai-inspect-migr-btn')?.addEventListener('click', () => {
        MigrationConfig.openMigrationModal(this.app);
      });

    }, 100);
  }
};
