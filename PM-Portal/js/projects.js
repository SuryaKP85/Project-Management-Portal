/* projects.js - Interactive Projects Module for Enterprise registers, filtering, bulk actions, and autosaving details */

import { Storage } from './storage.js';
import { Filters } from './filters.js';
import { Excel } from './excel.js';

export const ProjectsModule = {
  app: null,
  projects: [],
  selectedIds: new Set(),
  
  // Sorting state
  sortKey: 'id',
  sortAsc: true,
  
  // Pagination state
  currentPage: 1,
  pageSize: 10,
  
  // Active filters state
  filters: {
    search: '',
    customer: 'all',
    project: 'all',
    sprint: 'all',
    status: 'all',
    risk: 'all',
    developer: 'all',
    qa: 'all',
    ba: 'all',
    month: 'all',
    quarter: 'all',
    year: 'all'
  },
  
  // Debounce timers for autosave
  autosaveTimer: null,

  /**
   * Initialize Projects Module
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;
    
    // Load and align projects list with local storage
    this.loadProjects();
    
    // Reset selection state
    this.selectedIds.clear();
    
    // Register UI element event listeners
    this.setupEventListeners();
    
    // Populate filter dropdown lists dynamically from data
    this.populateFilterDropdowns();
    
    // Render view
    this.render();
  },

  /**
   * Loads projects from LocalStorage or falls back to app's default register list
   */
  loadProjects() {
    let stored = Storage.get('projects');
    if (!stored || !Array.isArray(stored) || stored.length === 0) {
      // Map and enrich the initial projects list with required fields for filters/forms
      const defaultList = this.app.projectsList || [];
      const enriched = defaultList.map((p, index) => {
        // Derive or mock clean values for advanced features
        const mockSprints = ['Sprint 42', 'Sprint 43', 'Sprint 41', 'Sprint 44', 'Sprint 40'];
        const mockRisks = ['Low', 'Medium', 'Low', 'High', 'Critical'];
        const mockDevs = ['Bob Johnson', 'Alice Smith', 'Bob Johnson', 'Alice Smith', 'Bob Johnson'];
        const mockQAs = ['David Miller', 'David Miller', 'David Miller', 'David Miller', 'David Miller'];
        const mockBAs = ['Sarah Connor', 'John Doe', 'Pam Beesly', 'John Doe', 'Sarah Connor'];
        
        // Months and Quarters mapped to 2026
        const mockDates = [
          { start: '2026-07-01', end: '2026-07-15', m: 'July', q: 'Q3', y: '2026' },
          { start: '2026-07-10', end: '2026-08-05', m: 'July', q: 'Q3', y: '2026' },
          { start: '2026-06-15', end: '2026-07-10', m: 'June', q: 'Q2', y: '2026' },
          { start: '2026-07-20', end: '2026-08-20', m: 'July', q: 'Q3', y: '2026' },
          { start: '2026-05-10', end: '2026-06-15', m: 'May', q: 'Q2', y: '2026' }
        ];
        
        const dateConf = mockDates[index % mockDates.length];

        return {
          id: p.id || `PRJ00${index + 1}`,
          name: p.name || 'Enriched Enterprise Project',
          client: p.client || 'Enterprise Corp.',
          manager: p.manager || 'Alex Mercer',
          progress: p.progress !== undefined ? p.progress : 50,
          budget: p.budget || 150000,
          status: p.status || 'in-progress',
          sprint: p.sprint || mockSprints[index % mockSprints.length],
          risk: p.risk || mockRisks[index % mockRisks.length],
          developer: p.developer || mockDevs[index % mockDevs.length],
          qa: p.qa || mockQAs[index % mockQAs.length],
          ba: p.ba || mockBAs[index % mockBAs.length],
          estimatedStart: p.estimatedStart || dateConf.start,
          estimatedEnd: p.estimatedEnd || dateConf.end,
          actualStart: p.actualStart || '',
          actualEnd: p.actualEnd || '',
          remarks: p.remarks || '',
          month: p.month || dateConf.m,
          quarter: p.quarter || dateConf.q,
          year: p.year || dateConf.y
        };
      });
      
      this.projects = enriched;
      Storage.set('projects', enriched);
    } else {
      this.projects = stored;
    }
    
    // Sync back to app instance for other pages' compatibility
    this.app.projectsList = this.projects;
  },

  /**
   * Save changes to LocalStorage and sync with central state
   */
  saveProjects() {
    Storage.set('projects', this.projects);
    this.app.projectsList = this.projects;
  },

  /**
   * Setup Event Listeners for search, filtering, sorting, bulk updates, and forms
   */
  setupEventListeners() {
    // 1. Search Box
    const searchInp = document.getElementById('project-search-input');
    if (searchInp) {
      searchInp.value = this.filters.search;
      searchInp.addEventListener('input', (e) => {
        this.filters.search = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    // 2. Toggle Advanced Filters Panel
    const toggleBtn = document.getElementById('toggle-adv-filters-btn');
    const advPanel = document.getElementById('advanced-filters-panel');
    if (toggleBtn && advPanel) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = advPanel.style.display === 'none';
        advPanel.style.display = isHidden ? 'block' : 'none';
        toggleBtn.classList.toggle('active', isHidden);
      });
    }

    // 3. Reset Filters
    const resetBtn = document.getElementById('reset-filters-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetAllFilters();
      });
    }

    // 4. Set up individual Advanced Filter dropdown change listeners
    const selectFilters = [
      { id: 'filter-customer', key: 'customer' },
      { id: 'filter-project', key: 'project' },
      { id: 'filter-sprint', key: 'sprint' },
      { id: 'filter-status', key: 'status' },
      { id: 'filter-risk', key: 'risk' },
      { id: 'filter-developer', key: 'developer' },
      { id: 'filter-qa', key: 'qa' },
      { id: 'filter-ba', key: 'ba' },
      { id: 'filter-month', key: 'month' },
      { id: 'filter-quarter', key: 'quarter' },
      { id: 'filter-year', key: 'year' }
    ];

    selectFilters.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) {
        el.addEventListener('change', (e) => {
          this.filters[item.key] = e.target.value;
          this.currentPage = 1;
          this.render();
        });
      }
    });

    // 5. Select All checkbox logic
    const selectAllCheck = document.getElementById('project-select-all');
    if (selectAllCheck) {
      selectAllCheck.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const visibleProjects = this.getFilteredAndSortedProjects();
        
        // Paginate sliced projects currently displayed
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const pageItems = visibleProjects.slice(startIndex, startIndex + this.pageSize);
        
        pageItems.forEach(p => {
          if (checked) {
            this.selectedIds.add(p.id);
          } else {
            this.selectedIds.delete(p.id);
          }
        });
        
        this.renderTableRowsOnly();
        this.updateBulkActionPanel();
      });
    }

    // 6. Sortable Headers
    const headers = [
      { id: 'th-code', key: 'id' },
      { id: 'th-name', key: 'name' },
      { id: 'th-pm', key: 'manager' },
      { id: 'th-sprint', key: 'sprint' },
      { id: 'th-risk', key: 'risk' },
      { id: 'th-progress', key: 'progress' },
      { id: 'th-budget', key: 'budget' },
      { id: 'th-status', key: 'status' }
    ];

    headers.forEach(h => {
      const el = document.getElementById(h.id);
      if (el) {
        el.addEventListener('click', () => {
          if (this.sortKey === h.key) {
            this.sortAsc = !this.sortAsc;
          } else {
            this.sortKey = h.key;
            this.sortAsc = true;
          }
          this.render();
        });
      }
    });

    // 7. Pagination rows limit
    const pageLimit = document.getElementById('pagination-limit');
    if (pageLimit) {
      pageLimit.addEventListener('change', (e) => {
        this.pageSize = parseInt(e.target.value, 10);
        this.currentPage = 1;
        this.render();
      });
    }

    // 8. Bulk action updates
    const bulkStatus = document.getElementById('bulk-status-select');
    if (bulkStatus) {
      bulkStatus.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val || this.selectedIds.size === 0) return;
        
        this.projects.forEach(p => {
          if (this.selectedIds.has(p.id)) {
            p.status = val;
          }
        });
        
        this.saveProjects();
        this.app.showToast(`Updated status to '${val}' for ${this.selectedIds.size} projects`, 'success');
        bulkStatus.value = '';
        this.selectedIds.clear();
        this.render();
      });
    }

    const bulkRisk = document.getElementById('bulk-risk-select');
    if (bulkRisk) {
      bulkRisk.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val || this.selectedIds.size === 0) return;
        
        this.projects.forEach(p => {
          if (this.selectedIds.has(p.id)) {
            p.risk = val;
          }
        });
        
        this.saveProjects();
        this.app.showToast(`Updated risk to '${val}' for ${this.selectedIds.size} projects`, 'success');
        bulkRisk.value = '';
        this.selectedIds.clear();
        this.render();
      });
    }

    // 9. Bulk operation buttons
    const bulkDup = document.getElementById('bulk-duplicate-btn');
    if (bulkDup) {
      bulkDup.addEventListener('click', () => {
        if (this.selectedIds.size === 0) return;
        
        const clones = [];
        let maxNum = this.getMaxProjectCodeNum();
        
        this.projects.forEach(p => {
          if (this.selectedIds.has(p.id)) {
            maxNum++;
            const newCode = `PRJ${String(maxNum).padStart(3, '0')}`;
            clones.push({
              ...p,
              id: newCode,
              name: `${p.name} (Copy)`
            });
          }
        });
        
        this.projects = [...clones, ...this.projects];
        this.saveProjects();
        this.app.showToast(`Successfully duplicated ${this.selectedIds.size} projects`, 'success');
        this.selectedIds.clear();
        this.render();
      });
    }

    const bulkArc = document.getElementById('bulk-archive-btn');
    if (bulkArc) {
      bulkArc.addEventListener('click', () => {
        if (this.selectedIds.size === 0) return;
        
        this.projects.forEach(p => {
          if (this.selectedIds.has(p.id)) {
            p.status = 'archived';
          }
        });
        
        this.saveProjects();
        this.app.showToast(`Archived ${this.selectedIds.size} projects successfully`, 'success');
        this.selectedIds.clear();
        this.render();
      });
    }

    const bulkDel = document.getElementById('bulk-delete-btn');
    if (bulkDel) {
      bulkDel.addEventListener('click', () => {
        if (this.selectedIds.size === 0) return;
        
        const count = this.selectedIds.size;
        const doBulkDelete = () => {
          this.projects = this.projects.filter(p => !this.selectedIds.has(p.id));
          this.saveProjects();
          this.app.showToast(`Successfully deleted ${count} projects`, 'success');
          this.selectedIds.clear();
          this.render();
        };

        if (this.app && typeof this.app.confirmModal === 'function') {
          this.app.confirmModal({
            title: 'Delete Selected Projects',
            bodyHtml: `<div class="p-2"><p class="mb-2 font-semibold text-danger">Are you sure you want to permanently delete these ${count} selected projects?</p></div>`,
            confirmText: 'Delete Selected',
            confirmClass: 'btn-enterprise-danger',
            onConfirm: doBulkDelete
          });
        } else {
          doBulkDelete();
        }
      });
    }

    const bulkClear = document.getElementById('bulk-clear-selection-btn');
    if (bulkClear) {
      bulkClear.addEventListener('click', () => {
        this.selectedIds.clear();
        const selectAllCheck = document.getElementById('project-select-all');
        if (selectAllCheck) selectAllCheck.checked = false;
        this.renderTableRowsOnly();
        this.updateBulkActionPanel();
      });
    }

    // 10. Back to list button inside detail panel
    const backBtn = document.getElementById('btn-back-to-list');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.closeDetailsView();
      });
    }

    // 11. Form inputs event listeners for autosave and instant validation
    const form = document.getElementById('project-details-form');
    if (form) {
      // Setup both input and change listeners
      const inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach(inp => {
        inp.addEventListener('input', () => this.triggerAutosave());
        inp.addEventListener('change', () => this.triggerAutosave());
      });
    }

    // 12. Connect Create Project button from header
    const createBtn = document.getElementById('project-create-btn');
    if (createBtn) {
      // Re-clone to avoid duplicate bindings
      const newCreateBtn = createBtn.cloneNode(true);
      createBtn.parentNode.replaceChild(newCreateBtn, createBtn);
      
      newCreateBtn.addEventListener('click', () => {
        this.openCreateProjectModal();
      });
    }

    // 13. Connect spreadsheet export button from header
    const exportBtn = document.getElementById('project-export-btn');
    if (exportBtn) {
      const newExportBtn = exportBtn.cloneNode(true);
      exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
      
      newExportBtn.addEventListener('click', () => {
        const filtered = this.getFilteredAndSortedProjects();
        const headers = ['Project Code', 'Project Name', 'Client/Customer', 'Project Manager', 'Sprint', 'Risk', 'Progress %', 'Budget ($)', 'Status'];
        const keys = ['id', 'name', 'client', 'manager', 'sprint', 'risk', 'progress', 'budget', 'status'];
        
        const ok = Excel.exportToCSV(headers, filtered, keys, 'Enterprise_Projects_Registers');
        if (ok) this.app.showToast('Spreadsheet exported successfully', 'success');
      });
    }
  },

  /**
   * Reset all filters to defaults
   */
  resetAllFilters() {
    this.filters = {
      search: '',
      customer: 'all',
      project: 'all',
      sprint: 'all',
      status: 'all',
      risk: 'all',
      developer: 'all',
      qa: 'all',
      ba: 'all',
      month: 'all',
      quarter: 'all',
      year: 'all'
    };

    // Update input UI
    const searchInp = document.getElementById('project-search-input');
    if (searchInp) searchInp.value = '';

    const ids = [
      'filter-customer', 'filter-project', 'filter-sprint', 'filter-status',
      'filter-risk', 'filter-developer', 'filter-qa', 'filter-ba',
      'filter-month', 'filter-quarter', 'filter-year'
    ];
    
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 'all';
    });

    this.currentPage = 1;
    this.render();
    this.app.showToast('All search registers reset', 'info');
  },

  /**
   * Helper to get highest sequential project code index
   */
  getMaxProjectCodeNum() {
    let max = 5;
    this.projects.forEach(p => {
      const numPart = parseInt(p.id.replace('PRJ', ''), 10);
      if (!isNaN(numPart) && numPart > max) {
        max = numPart;
      }
    });
    return max;
  },

  /**
   * Dynamic lists loading for filter options
   */
  populateFilterDropdowns() {
    const fetchUnique = (key) => {
      const vals = this.projects.map(p => p[key]).filter(v => v && String(v).trim() !== '');
      return [...new Set(vals)].sort();
    };

    const populateDropdown = (elId, values, label = 'All') => {
      const el = document.getElementById(elId);
      if (!el) return;
      
      const currentVal = el.value || 'all';
      el.innerHTML = `<option value="all">${label}</option>`;
      values.forEach(v => {
        el.innerHTML += `<option value="${v}">${v}</option>`;
      });
      el.value = currentVal;
    };

    // Populate advanced search dropdowns dynamically
    populateDropdown('filter-customer', fetchUnique('client'), 'All Customers');
    populateDropdown('filter-project', fetchUnique('id'), 'All Project IDs');
    populateDropdown('filter-sprint', fetchUnique('sprint'), 'All Sprints');
    populateDropdown('filter-developer', fetchUnique('developer'), 'All Developers');
    populateDropdown('filter-qa', fetchUnique('qa'), 'All QAs');
    populateDropdown('filter-ba', fetchUnique('ba'), 'All BAs');
  },

  /**
   * Main rendering routine
   */
  render() {
    this.renderTableRowsOnly();
    this.renderPagination();
    this.updateActiveFilterBadge();
    this.updateBulkActionPanel();
  },

  /**
   * Core filtering logic aligning with user requirements
   */
  getFilteredAndSortedProjects() {
    let items = [...this.projects];
    
    // 1. Search text query
    if (this.filters.search) {
      items = Filters.bySearch(items, this.filters.search, ['id', 'name', 'client', 'manager', 'developer', 'qa', 'ba', 'remarks']);
    }
    
    // 2. Customer
    if (this.filters.customer !== 'all') {
      items = Filters.byStatus(items, this.filters.customer, 'client');
    }
    
    // 3. Project ID
    if (this.filters.project !== 'all') {
      items = Filters.byStatus(items, this.filters.project, 'id');
    }
    
    // 4. Sprint
    if (this.filters.sprint !== 'all') {
      items = Filters.byStatus(items, this.filters.sprint, 'sprint');
    }
    
    // 5. Status
    if (this.filters.status !== 'all') {
      items = Filters.byStatus(items, this.filters.status, 'status');
    }
    
    // 6. Risk
    if (this.filters.risk !== 'all') {
      items = Filters.byStatus(items, this.filters.risk, 'risk');
    }
    
    // 7. Developer
    if (this.filters.developer !== 'all') {
      items = Filters.byStatus(items, this.filters.developer, 'developer');
    }
    
    // 8. QA
    if (this.filters.qa !== 'all') {
      items = Filters.byStatus(items, this.filters.qa, 'qa');
    }
    
    // 9. BA
    if (this.filters.ba !== 'all') {
      items = Filters.byStatus(items, this.filters.ba, 'ba');
    }
    
    // 10. Month (derived from estimatedStart)
    if (this.filters.month !== 'all') {
      items = items.filter(item => {
        if (!item.estimatedStart) return false;
        const date = new Date(item.estimatedStart);
        if (isNaN(date.getTime())) return false;
        const monthName = date.toLocaleString('default', { month: 'long' });
        return monthName.toLowerCase() === this.filters.month.toLowerCase();
      });
    }
    
    // 11. Quarter (derived from estimatedStart month)
    if (this.filters.quarter !== 'all') {
      items = items.filter(item => {
        if (!item.estimatedStart) return false;
        const date = new Date(item.estimatedStart);
        if (isNaN(date.getTime())) return false;
        const m = date.getMonth(); // 0-11
        let q = 'Q1';
        if (m >= 3 && m <= 5) q = 'Q2';
        else if (m >= 6 && m <= 8) q = 'Q3';
        else if (m >= 9 && m <= 11) q = 'Q4';
        return q === this.filters.quarter;
      });
    }
    
    // 12. Year (derived from estimatedStart)
    if (this.filters.year !== 'all') {
      items = items.filter(item => {
        if (!item.estimatedStart) return false;
        const date = new Date(item.estimatedStart);
        if (isNaN(date.getTime())) return false;
        return String(date.getFullYear()) === this.filters.year;
      });
    }
    
    // Sorter logic
    items.sort((a, b) => {
      let valA = a[this.sortKey];
      let valB = b[this.sortKey];
      
      // Budget/Progress numbers logic
      if (this.sortKey === 'budget' || this.sortKey === 'progress') {
        const numA = Number(valA) || 0;
        const numB = Number(valB) || 0;
        return this.sortAsc ? numA - numB : numB - numA;
      }
      
      // Strings comparison
      const strA = String(valA || '').toLowerCase();
      const strB = String(valB || '').toLowerCase();
      if (strA < strB) return this.sortAsc ? -1 : 1;
      if (strA > strB) return this.sortAsc ? 1 : -1;
      return 0;
    });
    
    return items;
  },

  /**
   * Only re-render the table body for rapid UI updates (checkbox selectors)
   */
  renderTableRowsOnly() {
    const listBody = document.getElementById('projects-table-body');
    if (!listBody) return;
    
    const visibleProjects = this.getFilteredAndSortedProjects();
    
    // Apply pagination slice
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageItems = visibleProjects.slice(startIndex, startIndex + this.pageSize);
    
    // Update active Sort headers icons
    const headers = ['id', 'name', 'manager', 'sprint', 'risk', 'progress', 'budget', 'status'];
    headers.forEach(h => {
      const id = `th-${h === 'id' ? 'code' : h}`;
      const headerEl = document.getElementById(id);
      if (headerEl) {
        const icon = headerEl.querySelector('i');
        if (icon) {
          if (this.sortKey === h) {
            icon.className = `fa-solid fa-sort-${this.sortAsc ? 'up' : 'down'} text-primary opacity-100`;
          } else {
            icon.className = 'fa-solid fa-sort ms-1 opacity-50 text-muted';
          }
        }
      }
    });

    if (pageItems.length === 0) {
      listBody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-5">
        <i class="fa-solid fa-circle-question text-muted mb-2 d-block" style="font-size: 2rem; opacity: 0.5;"></i>
        No matching active projects found in registers.
      </td></tr>`;
      return;
    }
    
    listBody.innerHTML = '';
    pageItems.forEach(p => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.id = `row-${p.id}`;
      
      const isSelected = this.selectedIds.has(p.id);
      
      // Progress colors
      let fillCol = 'var(--brand-primary)';
      if (p.status === 'completed') fillCol = 'var(--brand-success)';
      if (p.status === 'on-hold') fillCol = 'var(--brand-warning)';
      if (p.status === 'archived') fillCol = 'var(--text-muted)';
      
      // Risk badge mapping
      let riskClass = 'bg-success-subtle text-success';
      if (p.risk === 'Medium') riskClass = 'bg-warning-subtle text-warning';
      if (p.risk === 'High') riskClass = 'bg-danger-subtle text-danger';
      if (p.risk === 'Critical') riskClass = 'bg-danger text-white';

      tr.innerHTML = `
        <td class="row-checkbox-cell" style="padding: 14px 10px 14px 20px;">
          <input type="checkbox" class="form-check-input project-row-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''} />
        </td>
        <td class="clickable-project-cell" data-id="${p.id}"><div class="table-project-title text-primary font-bold" style="font-size: 0.85rem;">${p.id}</div></td>
        <td class="clickable-project-cell" data-id="${p.id}">
          <div class="table-project-cell">
            <span class="table-project-title font-semibold" style="font-size: 0.9rem;">${p.name}</span>
            <span class="table-project-client" style="font-size: 0.75rem;"><i class="fa-solid fa-building me-1"></i> ${p.client}</span>
          </div>
        </td>
        <td class="clickable-project-cell" data-id="${p.id}"><span class="text-secondary-custom font-semibold">${p.manager}</span></td>
        <td class="clickable-project-cell" data-id="${p.id}"><span class="badge bg-light text-dark text-uppercase border" style="font-size: 0.7rem;">${p.sprint || 'N/A'}</span></td>
        <td class="clickable-project-cell" data-id="${p.id}"><span class="badge ${riskClass}" style="font-size: 0.725rem; font-weight: 600; padding: 4px 8px;">${p.risk || 'Low'}</span></td>
        <td class="clickable-project-cell" data-id="${p.id}">
          <div class="d-flex align-items-center gap-2">
            <span class="table-progress-bar" style="width: 80px;">
              <span class="table-progress-fill" style="width: ${p.progress}%; background-color: ${fillCol}"></span>
            </span>
            <span class="font-bold text-secondary" style="font-size: 0.75rem;">${p.progress}%</span>
          </div>
        </td>
        <td class="clickable-project-cell font-semibold" data-id="${p.id}">$${Number(p.budget).toLocaleString()}</td>
        <td class="clickable-project-cell" data-id="${p.id}"><span class="status-badge ${p.status}">${p.status.replace('-', ' ')}</span></td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-sm btn-light border p-1 px-2 btn-row-edit" data-id="${p.id}" title="Edit Project Details">
            <i class="fa-solid fa-pencil text-secondary" style="font-size: 0.8rem;"></i>
          </button>
          <button class="btn btn-sm btn-light border p-1 px-2 btn-row-duplicate" data-id="${p.id}" title="Duplicate Project">
            <i class="fa-regular fa-copy text-secondary" style="font-size: 0.8rem;"></i>
          </button>
          <button class="btn btn-sm btn-light border p-1 px-2 btn-row-archive" data-id="${p.id}" title="Archive Project">
            <i class="fa-solid fa-box-archive text-secondary" style="font-size: 0.8rem;"></i>
          </button>
          <button class="btn btn-sm btn-light border p-1 px-2 btn-row-delete" data-id="${p.id}" title="Delete Project">
            <i class="fa-regular fa-trash-can text-danger" style="font-size: 0.8rem;"></i>
          </button>
        </td>
      `;
      listBody.appendChild(tr);
    });

    // Register click callbacks on new elements
    this.registerRowActionCallbacks();
  },

  /**
   * Register callbacks for table cells, checkboxes, and inline actions
   */
  registerRowActionCallbacks() {
    // 1. Checkboxes interaction
    const checkboxes = document.querySelectorAll('.project-row-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('click', (e) => e.stopPropagation()); // Avoid triggering cell detail switch
      cb.addEventListener('change', (e) => {
        const id = cb.getAttribute('data-id');
        if (cb.checked) {
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
        
        // Sync Select All checkbox state
        const selectAllCheck = document.getElementById('project-select-all');
        if (selectAllCheck) {
          const displayedCount = document.querySelectorAll('.project-row-checkbox').length;
          const checkedCount = document.querySelectorAll('.project-row-checkbox:checked').length;
          selectAllCheck.checked = (displayedCount === checkedCount && displayedCount > 0);
        }
        
        this.updateBulkActionPanel();
      });
    });

    // 2. Click cells to open Details
    const cells = document.querySelectorAll('.clickable-project-cell');
    cells.forEach(c => {
      c.addEventListener('click', () => {
        const id = c.getAttribute('data-id');
        this.openDetailsView(id);
      });
    });

    // 3. Inline action buttons
    const editBtns = document.querySelectorAll('.btn-row-edit');
    editBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDetailsView(btn.getAttribute('data-id'));
      });
    });

    const dupBtns = document.querySelectorAll('.btn-row-duplicate');
    dupBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        this.duplicateProject(id);
      });
    });

    const arcBtns = document.querySelectorAll('.btn-row-archive');
    arcBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        this.archiveProject(id);
      });
    });

    const delBtns = document.querySelectorAll('.btn-row-delete');
    delBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        this.deleteProject(id);
      });
    });
  },

  /**
   * Action methods
   */
  duplicateProject(id) {
    const orig = this.projects.find(p => p.id === id);
    if (!orig) return;
    
    const maxNum = this.getMaxProjectCodeNum() + 1;
    const newCode = `PRJ${String(maxNum).padStart(3, '0')}`;
    
    const clone = {
      ...orig,
      id: newCode,
      name: `${orig.name} (Copy)`
    };
    
    this.projects.unshift(clone);
    this.saveProjects();
    this.populateFilterDropdowns();
    this.app.showToast(`Duplicated ${id} to ${newCode} successfully`, 'success');
    this.render();
  },

  archiveProject(id) {
    const proj = this.projects.find(p => p.id === id);
    if (!proj) return;
    
    proj.status = 'archived';
    this.saveProjects();
    this.app.showToast(`Archived project ${id}`, 'success');
    this.render();
  },

  deleteProject(id) {
    const executeDelete = () => {
      this.projects = this.projects.filter(p => p.id !== id);
      this.saveProjects();
      this.selectedIds.delete(id);
      this.populateFilterDropdowns();
      this.app.showToast(`Deleted project ${id} successfully`, 'success');
      this.render();
    };

    if (this.app && typeof this.app.confirmModal === 'function') {
      this.app.confirmModal({
        title: 'Delete Project',
        bodyHtml: `<div class="p-2"><p class="mb-2 font-semibold text-danger">Are you sure you want to permanently delete project <strong>${id}</strong>?</p></div>`,
        confirmText: 'Delete Project',
        confirmClass: 'btn-enterprise-danger',
        onConfirm: executeDelete
      });
    } else {
      executeDelete();
    }
  },

  /**
   * Dynamic pagination calculations and drawing
   */
  renderPagination() {
    const infoEl = document.getElementById('pagination-info');
    const pagesEl = document.getElementById('pagination-pages');
    if (!infoEl || !pagesEl) return;
    
    const visibleProjects = this.getFilteredAndSortedProjects();
    const totalCount = visibleProjects.length;
    
    if (totalCount === 0) {
      infoEl.textContent = 'Showing 0 to 0 of 0 entries';
      pagesEl.innerHTML = '';
      return;
    }
    
    const totalPages = Math.ceil(totalCount / this.pageSize);
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages || 1;
    }
    
    const startNum = (this.currentPage - 1) * this.pageSize + 1;
    const endNum = Math.min(startNum + this.pageSize - 1, totalCount);
    
    infoEl.textContent = `Showing ${startNum} to ${endNum} of ${totalCount} entries`;
    
    pagesEl.innerHTML = '';
    
    // Previous page button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.disabled = (this.currentPage === 1);
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prevBtn.addEventListener('click', () => {
      this.currentPage--;
      this.render();
    });
    pagesEl.appendChild(prevBtn);
    
    // Sequential Page numbers
    for (let i = 1; i <= totalPages; i++) {
      if (totalPages > 6 && Math.abs(this.currentPage - i) > 1 && i !== 1 && i !== totalPages) {
        if (i === 2 || i === totalPages - 1) {
          const dots = document.createElement('span');
          dots.className = 'px-1 text-muted';
          dots.textContent = '...';
          pagesEl.appendChild(dots);
        }
        continue;
      }

      const numBtn = document.createElement('button');
      numBtn.className = `pagination-btn ${i === this.currentPage ? 'active' : ''}`;
      numBtn.textContent = i;
      numBtn.addEventListener('click', () => {
        this.currentPage = i;
        this.render();
      });
      pagesEl.appendChild(numBtn);
    }
    
    // Next page button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.disabled = (this.currentPage === totalPages);
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    nextBtn.addEventListener('click', () => {
      this.currentPage++;
      this.render();
    });
    pagesEl.appendChild(nextBtn);
  },

  /**
   * Updates count of active registers filters
   */
  updateActiveFilterBadge() {
    const badge = document.getElementById('active-filter-badge');
    const resetBtn = document.getElementById('reset-filters-btn');
    if (!badge) return;
    
    let activeCount = 0;
    Object.keys(this.filters).forEach(k => {
      if (k !== 'search' && this.filters[k] !== 'all') {
        activeCount++;
      }
    });
    
    if (activeCount > 0) {
      badge.textContent = activeCount;
      badge.style.display = 'inline-block';
      if (resetBtn) resetBtn.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
      // Only show reset if search is filled or other filters are active
      if (resetBtn) {
        resetBtn.style.display = this.filters.search ? 'inline-block' : 'none';
      }
    }
  },

  /**
   * Controls bulk update banner drawer visible state
   */
  updateBulkActionPanel() {
    const panel = document.getElementById('bulk-action-panel');
    const countLabel = document.getElementById('bulk-selected-count');
    if (!panel || !countLabel) return;
    
    if (this.selectedIds.size > 0) {
      countLabel.textContent = this.selectedIds.size;
      panel.style.display = 'flex';
    } else {
      panel.style.display = 'none';
    }
  },

  /* =========================================================================
     PROJECT DETAIL VIEW, VALIDATION ENGINE & AUTOSAVE ENGINE
     ========================================================================= */

  /**
   * Opens Detailed edit workspace for a project
   */
  openDetailsView(id) {
    const proj = this.projects.find(p => p.id === id);
    if (!proj) return;
    
    // Toggle active display states
    document.getElementById('projects-list-container').style.display = 'none';
    document.getElementById('projects-detail-container').style.display = 'block';
    
    // Setup ID / Name headers
    document.getElementById('detail-proj-id').textContent = proj.id;
    document.getElementById('detail-proj-title').textContent = proj.name;
    
    // Clear validation styling
    const form = document.getElementById('project-details-form');
    form.classList.remove('was-validated');
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    
    // Update Autosave label
    this.updateAutosaveIndicator('saved');
    
    // Fill dynamic select fields
    this.populateFormSelects(proj);
    
    // Populate form data
    document.getElementById('edit-id').value = proj.id;
    document.getElementById('edit-name').value = proj.name;
    document.getElementById('edit-client').value = proj.client;
    document.getElementById('edit-budget').value = proj.budget;
    document.getElementById('edit-remarks').value = proj.remarks || '';
    document.getElementById('edit-est-start').value = proj.estimatedStart || '';
    document.getElementById('edit-est-end').value = proj.estimatedEnd || '';
    document.getElementById('edit-act-start').value = proj.actualStart || '';
    document.getElementById('edit-act-end').value = proj.actualEnd || '';
    document.getElementById('edit-manager').value = proj.manager || '';
    document.getElementById('edit-ba').value = proj.ba || '';
    document.getElementById('edit-developer').value = proj.developer || '';
    document.getElementById('edit-qa').value = proj.qa || '';
    document.getElementById('edit-sprint').value = proj.sprint || '';
    document.getElementById('edit-risk').value = proj.risk || 'Low';
    document.getElementById('edit-status').value = proj.status || 'planning';
    
    // Progress slider
    const progressVal = proj.progress || 0;
    document.getElementById('edit-progress').value = progressVal;
    document.getElementById('edit-progress-badge').textContent = `${progressVal}%`;
    
    // Bind slider change label update
    const slider = document.getElementById('edit-progress');
    const badge = document.getElementById('edit-progress-badge');
    slider.oninput = () => {
      badge.textContent = `${slider.value}%`;
      this.triggerAutosave();
    };
  },

  /**
   * Populates form dropdown selectors with current unique entries
   */
  populateFormSelects(activeProj) {
    const clients = [...new Set(this.projects.map(p => p.client))];
    const clientSelect = document.getElementById('edit-client');
    clientSelect.innerHTML = '';
    clients.forEach(c => {
      clientSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });

    const pmSelect = document.getElementById('edit-manager');
    const baSelect = document.getElementById('edit-ba');
    const devSelect = document.getElementById('edit-developer');
    const qaSelect = document.getElementById('edit-qa');
    const sprintSelect = document.getElementById('edit-sprint');
    
    // Extract staffing resources from app list
    const resources = this.app.resourcesList || [];
    
    pmSelect.innerHTML = `<option value="">Select Manager...</option>`;
    baSelect.innerHTML = `<option value="">Select BA...</option>`;
    devSelect.innerHTML = `<option value="">Select Developer...</option>`;
    qaSelect.innerHTML = `<option value="">Select QA...</option>`;
    
    resources.forEach(r => {
      pmSelect.innerHTML += `<option value="${r.name}">${r.name} (${r.role})</option>`;
      baSelect.innerHTML += `<option value="${r.name}">${r.name} (${r.role})</option>`;
      devSelect.innerHTML += `<option value="${r.name}">${r.name} (${r.role})</option>`;
      qaSelect.innerHTML += `<option value="${r.name}">${r.name} (${r.role})</option>`;
    });

    // Make sure managers who are not in resources list are also selectable (like John Doe or Sarah Connor)
    const uniquePMs = [...new Set(this.projects.map(p => p.manager))];
    uniquePMs.forEach(pm => {
      if (pm && !resources.some(r => r.name === pm)) {
        pmSelect.innerHTML += `<option value="${pm}">${pm}</option>`;
      }
    });

    const uniqueBAs = [...new Set(this.projects.map(p => p.ba))];
    uniqueBAs.forEach(ba => {
      if (ba && !resources.some(r => r.name === ba)) {
        baSelect.innerHTML += `<option value="${ba}">${ba}</option>`;
      }
    });

    const uniqueDevs = [...new Set(this.projects.map(p => p.developer))];
    uniqueDevs.forEach(dev => {
      if (dev && !resources.some(r => r.name === dev)) {
        devSelect.innerHTML += `<option value="${dev}">${dev}</option>`;
      }
    });

    const uniqueQAs = [...new Set(this.projects.map(p => p.qa))];
    uniqueQAs.forEach(qa => {
      if (qa && !resources.some(r => r.name === qa)) {
        qaSelect.innerHTML += `<option value="${qa}">${qa}</option>`;
      }
    });

    // Sprints
    const sprints = [...new Set(this.projects.map(p => p.sprint))].filter(Boolean);
    sprintSelect.innerHTML = '<option value="">No Active Sprint</option>';
    sprints.forEach(s => {
      sprintSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
    if (activeProj.sprint && !sprints.includes(activeProj.sprint)) {
      sprintSelect.innerHTML += `<option value="${activeProj.sprint}">${activeProj.sprint}</option>`;
    }
  },

  closeDetailsView() {
    document.getElementById('projects-detail-container').style.display = 'none';
    document.getElementById('projects-list-container').style.display = 'block';
    
    // Refresh table and dropdown registers
    this.populateFilterDropdowns();
    this.render();
  },

  /**
   * Triggers debounced autosave action
   */
  triggerAutosave() {
    this.updateAutosaveIndicator('saving');
    
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
    }
    
    this.autosaveTimer = setTimeout(() => {
      this.executeAutosave();
    }, 600);
  },

  /**
   * Executes form validation & saving
   */
  executeAutosave() {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('edit-name').value;
    const client = document.getElementById('edit-client').value;
    const budget = document.getElementById('edit-budget').value;
    const remarks = document.getElementById('edit-remarks').value;
    const estStart = document.getElementById('edit-est-start').value;
    const estEnd = document.getElementById('edit-est-end').value;
    const actStart = document.getElementById('edit-act-start').value;
    const actEnd = document.getElementById('edit-act-end').value;
    const pm = document.getElementById('edit-manager').value;
    const ba = document.getElementById('edit-ba').value;
    const dev = document.getElementById('edit-developer').value;
    const qa = document.getElementById('edit-qa').value;
    const sprint = document.getElementById('edit-sprint').value;
    const risk = document.getElementById('edit-risk').value;
    const status = document.getElementById('edit-status').value;
    const progress = document.getElementById('edit-progress').value;

    // VALIDATION DECK
    let isValid = true;
    const form = document.getElementById('project-details-form');
    
    // Validate project name
    const nameInput = document.getElementById('edit-name');
    if (!name || name.trim() === '') {
      nameInput.classList.add('is-invalid');
      isValid = false;
    } else {
      nameInput.classList.remove('is-invalid');
    }

    // Validate budget positive number
    const budgetInput = document.getElementById('edit-budget');
    if (!budget || Number(budget) <= 0) {
      budgetInput.classList.add('is-invalid');
      isValid = false;
    } else {
      budgetInput.classList.remove('is-invalid');
    }

    // Validate date logical sequence
    const estStartInput = document.getElementById('edit-est-start');
    const estEndInput = document.getElementById('edit-est-end');
    if (estStart && estEnd) {
      const startD = new Date(estStart);
      const endD = new Date(estEnd);
      if (endD < startD) {
        estEndInput.classList.add('is-invalid');
        isValid = false;
      } else {
        estEndInput.classList.remove('is-invalid');
      }
    } else {
      estEndInput.classList.remove('is-invalid');
    }

    if (!isValid) {
      this.updateAutosaveIndicator('error');
      return;
    }

    // Find and update project details in-memory object
    const proj = this.projects.find(p => p.id === id);
    if (proj) {
      proj.name = name;
      document.getElementById('detail-proj-title').textContent = name;
      
      proj.client = client;
      proj.budget = Number(budget);
      proj.remarks = remarks;
      proj.estimatedStart = estStart;
      proj.estimatedEnd = estEnd;
      proj.actualStart = actStart;
      proj.actualEnd = actEnd;
      proj.manager = pm;
      proj.ba = ba;
      proj.developer = dev;
      proj.qa = qa;
      proj.sprint = sprint;
      proj.risk = risk;
      proj.status = status;
      proj.progress = Number(progress);
      
      // Calculate month, quarter, year derived from estStart for advanced filter registers
      if (estStart) {
        const dateObj = new Date(estStart);
        if (!isNaN(dateObj.getTime())) {
          proj.month = dateObj.toLocaleString('default', { month: 'long' });
          proj.year = String(dateObj.getFullYear());
          const m = dateObj.getMonth();
          let q = 'Q1';
          if (m >= 3 && m <= 5) q = 'Q2';
          else if (m >= 6 && m <= 8) q = 'Q3';
          else if (m >= 9 && m <= 11) q = 'Q4';
          proj.quarter = q;
        }
      }

      this.saveProjects();
      this.updateAutosaveIndicator('saved');
    }
  },

  /**
   * Updates visual feedback header saved text
   * @param {string} state 'saving' | 'saved' | 'error'
   */
  updateAutosaveIndicator(state) {
    const el = document.getElementById('autosave-status');
    if (!el) return;
    
    if (state === 'saving') {
      el.innerHTML = `<span class="spinner-border spinner-border-sm text-primary" role="status"></span> Saving modifications...`;
      el.className = 'text-primary d-flex align-items-center gap-1 font-semibold';
    } else if (state === 'saved') {
      el.innerHTML = `<i class="fa-solid fa-circle-check text-success" style="font-size: 1rem;"></i> All changes saved`;
      el.className = 'text-success d-flex align-items-center gap-1 font-semibold';
    } else if (state === 'error') {
      el.innerHTML = `<i class="fa-solid fa-circle-exclamation text-danger" style="font-size: 1rem;"></i> Validation error - Autosave halted`;
      el.className = 'text-danger d-flex align-items-center gap-1 font-semibold';
    }
  },

  /**
   * Initiates dialog to create a new project with rich parameters
   */
  openCreateProjectModal() {
    // Generate valid clients and staffing dropdown arrays
    const clients = [...new Set(this.projects.map(p => p.client))];
    const resources = this.app.resourcesList || [];
    
    const clientOptions = clients.map(c => `<option value="${c}">${c}</option>`).join('');
    const pmOptions = resources.map(r => `<option value="${r.name}">${r.name}</option>`).join('');
    const devOptions = resources.map(r => `<option value="${r.name}">${r.name}</option>`).join('');

    const bodyHtml = `
      <form id="modal-project-create-form" class="row g-3 needs-validation" novalidate>
        <div class="col-md-12">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">Project Name <span class="text-danger">*</span></label>
          <input type="text" class="form-control select-enterprise w-100" id="mod-name" placeholder="E.g. Apollo Client Platform" required />
          <div class="invalid-feedback">Please provide a valid project name.</div>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">Client / Customer <span class="text-danger">*</span></label>
          <select class="form-select select-enterprise w-100" id="mod-client" required>
            ${clientOptions}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">Project Manager (PM) <span class="text-danger">*</span></label>
          <select class="form-select select-enterprise w-100" id="mod-pm" required>
            ${pmOptions}
            <option value="Alex Mercer">Alex Mercer</option>
            <option value="Sarah Connor">Sarah Connor</option>
            <option value="John Doe">John Doe</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">Point of Contact (POC)</label>
          <input type="text" class="form-control select-enterprise w-100" id="mod-poc" placeholder="E.g. Client Lead / John Doe" />
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">Approved Budget ($) <span class="text-danger">*</span></label>
          <input type="number" class="form-control select-enterprise w-100" id="mod-budget" placeholder="150000" min="1" required />
          <div class="invalid-feedback">Please enter a positive budget amount.</div>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">Initial Status</label>
          <select class="form-select select-enterprise w-100" id="mod-status">
            <option value="planning">Planning</option>
            <option value="in-progress">In Progress</option>
            <option value="on-hold">On Hold</option>
          </select>
        </div>
      </form>
    `;

    this.app.openModal('Initiate New Enterprise Project', bodyHtml, (overlay) => {
      const name = overlay.querySelector('#mod-name').value;
      const client = overlay.querySelector('#mod-client').value;
      const pm = overlay.querySelector('#mod-pm').value;
      const poc = overlay.querySelector('#mod-poc').value;
      const budget = overlay.querySelector('#mod-budget').value;
      const status = overlay.querySelector('#mod-status').value;

      let isModalValid = true;
      if (!name || name.trim() === '') {
        overlay.querySelector('#mod-name').classList.add('is-invalid');
        isModalValid = false;
      } else {
        overlay.querySelector('#mod-name').classList.remove('is-invalid');
      }

      if (!budget || Number(budget) <= 0) {
        overlay.querySelector('#mod-budget').classList.add('is-invalid');
        isModalValid = false;
      } else {
        overlay.querySelector('#mod-budget').classList.remove('is-invalid');
      }

      if (!isModalValid) {
        this.app.showToast('Please fix the highlighted parameters', 'warning');
        return false; // keeps modal open
      }

      const nextNum = this.getMaxProjectCodeNum() + 1;
      const newCode = `PRJ${String(nextNum).padStart(3, '0')}`;
      
      const newProj = {
        id: newCode,
        name,
        client,
        manager: pm,
        poc: poc || '',
        progress: 0,
        budget: Number(budget),
        status,
        sprint: 'Sprint 44',
        risk: 'Low',
        developer: resources[0]?.name || 'Bob Johnson',
        qa: resources[1]?.name || 'David Miller',
        ba: 'Sarah Connor',
        estimatedStart: new Date().toISOString().split('T')[0],
        estimatedEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        actualStart: '',
        actualEnd: '',
        remarks: '',
        month: new Date().toLocaleString('default', { month: 'long' }),
        quarter: 'Q3',
        year: '2026'
      };

      this.projects.unshift(newProj);
      this.saveProjects();
      this.populateFilterDropdowns();
      this.app.showToast(`New Project ${newCode} initiated successfully`, 'success');
      this.currentPage = 1;
      this.render();
      return true; // close modal
    });
  }
};
