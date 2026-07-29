/* app.js - Central Application Controller and routing framework */

import { Storage } from './storage.js';
import { Calculations } from './calculations.js';
import { Filters } from './filters.js';
import { Excel } from './excel.js';
import { DashboardModule } from './dashboard.js';
import { ExcelEngineModule } from './excelEngine.js';
import { ProjectsModule } from './projects.js';
import { CustomersModule } from './customers.js';
import { ResourcePlannerModule } from './resourcePlanner.js';
import { TimeLoggingModule } from './timeLogging.js';
import { LeaveTrackerModule } from './leaveTracker.js';
import { WeekendPlannerModule } from './weekendPlanner.js';
import { RiskEngineModule } from './riskEngine.js';
import { ForecastEngineModule } from './forecastEngine.js';
import { ReportsHubModule } from './reportsHub.js';
import { GanttModule } from './gantt.js';
import { ActionCenterModule } from './actionCenter.js';
import { AppIntegrationModule } from './appIntegration.js';
import { MigrationConfig } from './migrationConfig.js';
import { SettingsModule } from './settings.js';

class EnterprisePortalApp {
  constructor() {
    this.currentTheme = 'light';
    this.currentPage = 'dashboard';
    
    // Core Collections to show interactive filters and excel exports
    this.projectsList = [
      { id: 'PRJ001', name: 'Project Ares Core Upgrade', client: 'AeroSpace Inc.', manager: 'John Doe', progress: 75, budget: 120000, status: 'in-progress' },
      { id: 'PRJ002', name: 'Zeus Security Shield Framework', client: 'Defense Lab', manager: 'Sarah Connor', progress: 95, budget: 450000, status: 'in-progress' },
      { id: 'PRJ003', name: 'Hermes Logistic Router API', client: 'Speedy Delivery', manager: 'Alex Mercer', progress: 100, budget: 85000, status: 'completed' },
      { id: 'PRJ004', name: 'Chronos Real-time Scheduler', client: 'Global Bank Corp.', manager: 'Michael Scott', progress: 15, budget: 310000, status: 'planning' },
      { id: 'PRJ005', name: 'Demeter Agro-Sensors Cloud', client: 'GreenField Farms', manager: 'Pam Beesly', progress: 0, budget: 95000, status: 'on-hold' }
    ];
    
    this.customersList = [
      { id: 'CST101', name: 'AeroSpace Inc.', industry: 'Aviation', contact: 'William Vance', projects: 2, status: 'active' },
      { id: 'CST102', name: 'Defense Lab', industry: 'Government', contact: 'Richard Winters', projects: 1, status: 'active' },
      { id: 'CST103', name: 'Speedy Delivery', industry: 'Logistics', contact: 'James Cole', projects: 3, status: 'active' },
      { id: 'CST104', name: 'Global Bank Corp.', industry: 'Finance', contact: 'Linus Larrabee', projects: 1, status: 'active' },
      { id: 'CST105', name: 'GreenField Farms', industry: 'Agriculture', contact: 'Dwight Schrute', projects: 1, status: 'inactive' }
    ];
    
    this.resourcesList = [
      { id: 'RES201', name: 'Alice Smith', role: 'Lead Developer', dept: 'Dev', allocation: 100, status: 'allocated' },
      { id: 'RES202', name: 'Bob Johnson', role: 'Fullstack Dev', dept: 'Dev', allocation: 100, status: 'allocated' },
      { id: 'RES203', name: 'Clara Oswald', role: 'QA Lead', dept: 'QA', allocation: 50, status: 'allocated' },
      { id: 'RES204', name: 'David Miller', role: 'Business Analyst', dept: 'BA', allocation: 0, status: 'pending' },
      { id: 'RES205', name: 'Elena Rostova', role: 'Product Manager', dept: 'Product Manager', allocation: 80, status: 'allocated' }
    ];
    
    this.leavesList = [
      { id: 'LV001', name: 'Alice Smith', type: 'Annual Leave', start: '2026-08-10', end: '2026-08-15', days: 5, status: 'approved' },
      { id: 'LV002', name: 'David Miller', type: 'Sick Leave', start: '2026-07-28', end: '2026-07-30', days: 2, status: 'pending' },
      { id: 'LV003', name: 'Elena Rostova', type: 'Personal Day', start: '2026-08-01', end: '2026-08-01', days: 1, status: 'approved' }
    ];
  }

  /**
   * Initializes the application shell
   */
  init() {
    this.initTheme();
    
    // Sync with stored projects from local storage on load to ensure live metrics consistency
    const stored = Storage.get('projects');
    if (stored && Array.isArray(stored) && stored.length > 0) {
      this.projectsList = stored;
    }
    
    this.setupGlobalEvents();
    this.setupRouting();
    this.setupModal();
    this.setupToasts();
    
    // Initialize active dashboard view
    DashboardModule.init(this);
    window.portalAppInstance = this;

    // Initialize Integration Harness (Keyboard shortcuts, Command Palette, Autosave, A11y)
    AppIntegrationModule.init(this);
    
    // Initialize Settings & User session
    SettingsModule.init(this);
    
    this.showToast('Enterprise PM Portal fully integrated & active', 'info');
  }

  /**
   * Load theme preference from storage and apply to body
   */
  initTheme() {
    const savedTheme = Storage.getTheme();
    this.setTheme(savedTheme);
  }

  /**
   * Set theme and update theme toggle icon/visuals
   */
  setTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    Storage.setTheme(theme);
    
    const themeBtnIcon = document.querySelector('#theme-toggle-btn i');
    if (themeBtnIcon) {
      if (theme === 'dark') {
        themeBtnIcon.className = 'fa-regular fa-sun';
      } else {
        themeBtnIcon.className = 'fa-regular fa-moon';
      }
    }
    
    // Redraw charts if dashboard is active so they adopt dark-theme colors
    if (this.currentPage === 'dashboard') {
      DashboardModule.renderAllCharts();
    }
  }

  /**
   * Universal Toast messaging system
   */
  setupToasts() {
    // Create container if it doesn't exist
    if (!document.getElementById('toast-container')) {
      const container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'warning') icon = 'fa-circle-exclamation';
    if (type === 'danger') icon = 'fa-circle-xmark';

    toast.innerHTML = `
      <i class="fa-solid ${icon} text-${type}-custom" style="color: var(--brand-${type}); font-size: 1.1rem;"></i>
      <div class="toast-message">${message}</div>
      <button class="toast-close" type="button"><i class="fa-solid fa-xmark"></i></button>
    `;

    container.appendChild(toast);

    // Auto close handler
    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
      toast.style.animation = 'slideIn 0.25s reverse ease-out';
      toast.addEventListener('animationend', () => toast.remove());
    };

    closeBtn.addEventListener('click', dismiss);
    setTimeout(dismiss, 4000);
  }

  /**
   * Universal Modal Dialog system
   */
  setupModal() {
    // Create global modal markup if not already there
    let overlay = document.getElementById('global-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-modal-overlay';
      overlay.className = 'custom-modal-overlay';
      overlay.innerHTML = `
        <div class="custom-modal">
          <div class="modal-header-custom">
            <h5 class="modal-title-custom" id="global-modal-title">Modal Title</h5>
            <button class="modal-close-custom" id="global-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body-custom" id="global-modal-body">
            <!-- Dynamic Content -->
          </div>
          <div class="modal-footer-custom" id="global-modal-footer">
            <button class="btn-enterprise btn-enterprise-secondary" id="global-modal-cancel-btn">Cancel</button>
            <button class="btn-enterprise btn-enterprise-primary" id="global-modal-save-btn">Save Changes</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    // Close listeners
    const closeBtn = overlay.querySelector('#global-modal-close-btn');
    const cancelBtn = overlay.querySelector('#global-modal-cancel-btn');
    
    const closeModal = () => {
      overlay.classList.remove('show');
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    // Close on overlay clicking
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  /**
   * Opens the reusable modal
   * @param {string} title 
   * @param {string} bodyHtml 
   * @param {function} onSave - Callback receiving the modal overlay ref
   */
  openModal(title, bodyHtml, onSave) {
    const overlay = document.getElementById('global-modal-overlay');
    if (!overlay) return;

    overlay.querySelector('#global-modal-title').textContent = title;
    overlay.querySelector('#global-modal-body').innerHTML = bodyHtml;
    
    const footer = overlay.querySelector('#global-modal-footer');
    footer.innerHTML = `
      <button class="btn-enterprise btn-enterprise-secondary" id="global-modal-cancel-btn">Cancel</button>
      <button class="btn-enterprise btn-enterprise-primary" id="global-modal-save-btn">Save Changes</button>
    `;

    const closeModal = () => overlay.classList.remove('show');
    overlay.querySelector('#global-modal-cancel-btn').onclick = closeModal;
    overlay.querySelector('#global-modal-close-btn').onclick = closeModal;

    overlay.querySelector('#global-modal-save-btn').onclick = () => {
      if (typeof onSave === 'function') {
        const result = onSave(overlay);
        if (result !== false) {
          closeModal();
        }
      } else {
        closeModal();
      }
    };

    overlay.classList.add('show');
  }

  /**
   * Opens a reusable confirmation modal overlay
   */
  confirmModal({ title = 'Confirm Action', bodyHtml = 'Are you sure?', confirmText = 'Confirm', confirmClass = 'btn-enterprise-danger', onConfirm }) {
    const overlay = document.getElementById('global-modal-overlay');
    if (!overlay) return;

    overlay.querySelector('#global-modal-title').textContent = title;
    overlay.querySelector('#global-modal-body').innerHTML = bodyHtml;

    const footer = overlay.querySelector('#global-modal-footer');
    footer.innerHTML = `
      <button class="btn-enterprise btn-enterprise-secondary" id="global-modal-cancel-btn">Cancel</button>
      <button class="btn-enterprise ${confirmClass}" id="global-modal-confirm-btn">${confirmText}</button>
    `;

    const closeModal = () => overlay.classList.remove('show');
    overlay.querySelector('#global-modal-cancel-btn').onclick = closeModal;
    overlay.querySelector('#global-modal-close-btn').onclick = closeModal;

    overlay.querySelector('#global-modal-confirm-btn').onclick = () => {
      closeModal();
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
    };

    overlay.classList.add('show');
  }

  /**
   * Client-side routing between portal view panels
   */
  setupRouting() {
    const navLinks = document.querySelectorAll('#sidebar .menu-link, #top-navbar .breadcrumb-link');
    
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        if (page) {
          this.switchPage(page);
        }
      });
    });

    // Handle home link
    const brandLink = document.querySelector('.brand-logo');
    if (brandLink) {
      brandLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchPage('dashboard');
      });
    }
  }

  switchPage(pageId) {
    // Hide active containers, show current container
    const allPages = document.querySelectorAll('.page-container');
    const targetPage = document.getElementById(`page-${pageId}`);
    
    if (!targetPage) {
      console.warn(`Target page view 'page-${pageId}' does not exist.`);
      return;
    }

    allPages.forEach(p => p.classList.remove('active'));
    targetPage.classList.add('active');

    // Update Sidebar states
    const allMenuItems = document.querySelectorAll('#sidebar .menu-item');
    allMenuItems.forEach(item => item.classList.remove('active'));
    
    const activeLink = document.querySelector(`#sidebar .menu-link[data-page="${pageId}"]`);
    if (activeLink) {
      activeLink.closest('.menu-item').classList.add('active');
    }

    // Update Breadcrumb
    const breadcrumbLabel = document.getElementById('navbar-breadcrumb-label');
    if (breadcrumbLabel) {
      // Capitalize page name cleanly
      const nameMap = {
        'dashboard': 'Executive Dashboard',
        'action-center': 'Executive Action Center',
        'projects': 'Projects Portfolio',
        'customers': 'Customers Registry',
        'resources': 'Human Resources',
        'resource-planner': 'Resource Allocation Planner',
        'time-logging': 'Daily Time Logging',
        'leave-tracker': 'Time Off & Leave Tracker',
        'weekend-planner': 'Weekend Delivery Planner',
        'forecast': 'Automatic Forecast Engine',
        'gantt': 'Interactive Gantt Workspace',
        'risks': 'Risk Registers & Audits',
        'reports': 'Executive Reports',
        'settings': 'Portal Settings'
      };
      breadcrumbLabel.textContent = nameMap[pageId] || (pageId.charAt(0).toUpperCase() + pageId.slice(1));
    }

    // Set page state
    this.currentPage = pageId;

    // Load page modules
    if (pageId === 'dashboard') {
      DashboardModule.renderAllCharts();
    } else if (pageId === 'action-center') {
      ActionCenterModule.init(this);
    } else if (pageId === 'projects') {
      ProjectsModule.init(this);
    } else if (pageId === 'customers') {
      CustomersModule.init(this);
    } else if (pageId === 'resources') {
      this.initResourcesPage();
    } else if (pageId === 'resource-planner') {
      ResourcePlannerModule.init(this);
    } else if (pageId === 'time-logging') {
      TimeLoggingModule.init(this);
    } else if (pageId === 'leave-tracker') {
      this.initLeavesPage();
    } else if (pageId === 'weekend-planner') {
      WeekendPlannerModule.init(this);
    } else if (pageId === 'forecast') {
      ForecastEngineModule.init(this);
    } else if (pageId === 'gantt') {
      GanttModule.init(this);
    } else if (pageId === 'risks') {
      RiskEngineModule.init(this);
    } else if (pageId === 'reports') {
      ExcelEngineModule.init(this);
      ReportsHubModule.init(this);
    } else if (pageId === 'settings') {
      SettingsModule.init(this);
    }

    // Close sidebar on mobile after selecting a link
    if (document.body.classList.contains('sidebar-open')) {
      document.body.classList.remove('sidebar-open');
    }

    // Scroll main window to top
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.scrollTop = 0;

    // Dispatch custom page switch event for AI integration
    window.dispatchEvent(new CustomEvent('portal-page-switched', { detail: { pageId } }));
  }

  /**
   * Sets up global navigation and shell interactions
   */
  setupGlobalEvents() {
    // Theme toggler click
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(nextTheme);
        this.showToast(`Switched to ${nextTheme} theme mode`, 'success');
      });
    }

    // Sidebar Toggling
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (window.innerWidth < 992) {
          document.body.classList.toggle('sidebar-open');
        } else {
          document.body.classList.toggle('sidebar-collapsed');
          // Adjust charts inside dashboard if active
          if (this.currentPage === 'dashboard') {
            setTimeout(() => DashboardModule.renderAllCharts(), 300);
          }
        }
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        document.body.classList.remove('sidebar-open');
      });
    }

    // Notifications Dropdown toggle
    const notifyBtn = document.getElementById('notifications-toggle-btn');
    const dropdown = document.getElementById('notifications-dropdown-menu');

    if (notifyBtn && dropdown) {
      notifyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('show');
      });

      dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }

  /* =========================================================================
     PAGE INITIALIZATIONS (Adding Interactive lists/search filters dynamically)
     ========================================================================= */

  /**
   * Project Management panel render & filtering
   */
  initProjectsPage() {
    const listBody = document.getElementById('projects-table-body');
    if (!listBody) return;

    const renderTable = (items) => {
      listBody.innerHTML = '';
      if (items.length === 0) {
        listBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No projects match the criteria.</td></tr>`;
        return;
      }

      items.forEach(p => {
        const tr = document.createElement('tr');
        
        // Progress fill color based on status/rate
        let fillCol = 'var(--brand-primary)';
        if (p.status === 'completed') fillCol = 'var(--brand-success)';
        if (p.status === 'on-hold') fillCol = 'var(--brand-warning)';

        tr.innerHTML = `
          <td><div class="table-project-title">${p.id}</div></td>
          <td>
            <div class="table-project-cell">
              <span class="table-project-title">${p.name}</span>
              <span class="table-project-client">${p.client}</span>
            </div>
          </td>
          <td><span class="text-secondary-custom">${p.manager}</span></td>
          <td>
            <span class="table-progress-bar">
              <span class="table-progress-fill" style="width: ${p.progress}%; background-color: ${fillCol}"></span>
            </span>
            <span class="table-progress-text">${p.progress}%</span>
          </td>
          <td class="font-semibold">$${p.budget.toLocaleString()}</td>
          <td><span class="status-badge ${p.status}">${p.status.replace('-', ' ')}</span></td>
        `;
        listBody.appendChild(tr);
      });
    };

    // Initial render
    renderTable(this.projectsList);

    // Dynamic Filter handlers
    const searchInp = document.getElementById('project-search-input');
    const statusSelect = document.getElementById('project-status-select');

    const triggerFilter = () => {
      const query = searchInp ? searchInp.value : '';
      const status = statusSelect ? statusSelect.value : 'all';
      
      let filtered = Filters.bySearch(this.projectsList, query, ['id', 'name', 'client', 'manager']);
      filtered = Filters.byStatus(filtered, status, 'status');
      
      renderTable(filtered);
    };

    if (searchInp) searchInp.addEventListener('input', triggerFilter);
    if (statusSelect) statusSelect.addEventListener('change', triggerFilter);

    // CSV Spreadsheet Export integration
    const exportBtn = document.getElementById('project-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const query = searchInp ? searchInp.value : '';
        const status = statusSelect ? statusSelect.value : 'all';
        let filtered = Filters.bySearch(this.projectsList, query, ['id', 'name', 'client', 'manager']);
        filtered = Filters.byStatus(filtered, status, 'status');

        const headers = ['Project ID', 'Project Name', 'Client Name', 'Project Manager', 'Progress %', 'Budget ($)', 'Status'];
        const keys = ['id', 'name', 'client', 'manager', 'progress', 'budget', 'status'];
        
        const ok = Excel.exportToCSV(headers, filtered, keys, 'Enterprise_Projects');
        if (ok) this.showToast('Spreadsheet exported successfully', 'success');
      });
    }

    // Modal creation dialog integration
    const createBtn = document.getElementById('project-create-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const bodyHtml = `
          <form id="new-project-form" class="row g-3">
            <div class="col-md-6">
              <label class="form-label font-semibold">Project Name</label>
              <input type="text" class="form-control select-enterprise w-100" id="m-proj-name" placeholder="E.g. Apollo Client Platform" required />
            </div>
            <div class="col-md-6">
              <label class="form-label font-semibold">Client</label>
              <input type="text" class="form-control select-enterprise w-100" id="m-proj-client" placeholder="E.g. SpaceX Logistics" required />
            </div>
            <div class="col-md-6">
              <label class="form-label font-semibold">Manager</label>
              <input type="text" class="form-control select-enterprise w-100" id="m-proj-mgr" placeholder="E.g. Arthur Dent" required />
            </div>
            <div class="col-md-6">
              <label class="form-label font-semibold">Budget ($)</label>
              <input type="number" class="form-control select-enterprise w-100" id="m-proj-budget" placeholder="E.g. 150000" required />
            </div>
            <div class="col-md-6">
              <label class="form-label font-semibold">Initial Status</label>
              <select class="form-select select-enterprise w-100" id="m-proj-status">
                <option value="planning">Planning</option>
                <option value="in-progress">In Progress</option>
                <option value="on-hold">On Hold</option>
              </select>
            </div>
          </form>
        `;

        this.openModal('Initiate New Enterprise Project', bodyHtml, (overlay) => {
          const name = overlay.querySelector('#m-proj-name').value;
          const client = overlay.querySelector('#m-proj-client').value;
          const mgr = overlay.querySelector('#m-proj-mgr').value;
          const budget = overlay.querySelector('#m-proj-budget').value;
          const status = overlay.querySelector('#m-proj-status').value;

          if (!name || !client || !mgr || !budget) {
            this.showToast('Please fill out all required parameters', 'warning');
            return false; // keeps modal open
          }

          const newId = `PRJ00${this.projectsList.length + 1}`;
          const newPrj = {
            id: newId,
            name,
            client,
            manager: mgr,
            progress: 0,
            budget: Number(budget),
            status
          };

          this.projectsList.unshift(newPrj);
          this.showToast(`New Project ${newId} initiated successfully`, 'success');
          
          // Re-trigger rendering
          triggerFilter();
          return true; // close modal
        });
      });
    }
  }

  /**
   * Customers registry dashboard initializations
   */
  initCustomersPage() {
    const listBody = document.getElementById('customers-table-body');
    if (!listBody) return;

    const renderTable = (items) => {
      listBody.innerHTML = '';
      if (items.length === 0) {
        listBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No customers match the criteria.</td></tr>`;
        return;
      }

      items.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><div class="table-project-title">${c.id}</div></td>
          <td><span class="font-semibold">${c.name}</span></td>
          <td><span class="text-secondary-custom">${c.industry}</span></td>
          <td><div class="text-secondary-custom">${c.contact}</div></td>
          <td><span class="status-badge ${c.status}">${c.status}</span></td>
        `;
        listBody.appendChild(tr);
      });
    };

    renderTable(this.customersList);

    const searchInp = document.getElementById('customer-search-input');
    const statusSelect = document.getElementById('customer-status-select');

    const triggerFilter = () => {
      const query = searchInp ? searchInp.value : '';
      const status = statusSelect ? statusSelect.value : 'all';
      
      let filtered = Filters.bySearch(this.customersList, query, ['id', 'name', 'industry', 'contact']);
      filtered = Filters.byStatus(filtered, status, 'status');
      
      renderTable(filtered);
    };

    if (searchInp) searchInp.addEventListener('input', triggerFilter);
    if (statusSelect) statusSelect.addEventListener('change', triggerFilter);
  }

  /**
   * HR Allocation grid list initializations
   */
  initResourcesPage() {
    const listBody = document.getElementById('resources-table-body');
    if (!listBody) return;

    const renderTable = (items) => {
      listBody.innerHTML = '';
      if (items.length === 0) {
        listBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No resources match the criteria.</td></tr>`;
        return;
      }

      items.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><div class="table-project-title">${r.id}</div></td>
          <td><span class="font-semibold">${r.name}</span></td>
          <td><span class="text-secondary-custom">${r.role}</span></td>
          <td><span class="text-secondary-custom">${r.dept}</span></td>
          <td>
            <span class="table-progress-bar">
              <span class="table-progress-fill" style="width: ${r.allocation}%; background-color: var(--brand-info)"></span>
            </span>
            <span class="table-progress-text">${r.allocation}%</span>
          </td>
        `;
        listBody.appendChild(tr);
      });
    };

    renderTable(this.resourcesList);

    const searchInp = document.getElementById('resource-search-input');
    const deptSelect = document.getElementById('resource-dept-select');

    const triggerFilter = () => {
      const query = searchInp ? searchInp.value : '';
      const dept = deptSelect ? deptSelect.value : 'all';
      
      let filtered = Filters.bySearch(this.resourcesList, query, ['id', 'name', 'role', 'dept']);
      filtered = Filters.byStatus(filtered, dept, 'dept');
      
      renderTable(filtered);
    };

    if (searchInp) searchInp.addEventListener('input', triggerFilter);
    if (deptSelect) deptSelect.addEventListener('change', triggerFilter);
  }

  /**
   * Leave Management dashboard initializations
   */
  initLeavesPage() {
    LeaveTrackerModule.init(this);
  }
}

// Instantiate on Document Ready
document.addEventListener('DOMContentLoaded', () => {
  const portal = new EnterprisePortalApp();
  portal.init();
});
