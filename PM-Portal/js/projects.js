/* projects.js - Interactive Projects Module for Enterprise registers, filtering, bulk actions, and autosaving details */

import { Storage } from './storage.js';
import { Authentication } from './authentication.js';
import { Filters } from './filters.js';
import { Excel } from './excel.js';
import { dataService } from './services/dataAdapter.js';
import { ProductService } from './services/productService.js';
import { ProjectService } from './services/projectService.js';
import { EpicService } from './services/epicService.js';
import { FeatureService } from './services/featureService.js';
import { StoryService } from './services/storyService.js';
import { TaskService } from './services/taskService.js';
import { DeliveryService } from './services/deliveryService.js';
import { RiskService } from './services/riskService.js';
import { IssueService } from './services/issueService.js';
import { DependencyService } from './services/dependencyService.js';

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

    // V2 Background Sync and Migration
    this.syncV2Projects();
  },

  /**
   * Background sync with V2 PostgreSQL backend and automatic migration
   */
  async syncV2Projects(isManual = false) {
    try {
      if (isManual && this.app) {
        this.app.showToast('Initiating V2 PostgreSQL synchronization & migration...', 'info');
      }

      await dataService.autoMigrateLocalProjects();
      const v2Projects = await dataService.getProjects();
      if (v2Projects && Array.isArray(v2Projects) && v2Projects.length > 0) {
        this.projects = v2Projects;
        this.app.projectsList = this.projects;
        Storage.set('projects', this.projects);
        this.populateFilterDropdowns();
        this.render();
        if (isManual && this.app) {
          this.app.showToast('Synchronized successfully with PostgreSQL V2 backend!', 'success');
        }
      }
    } catch (err) {
      console.warn('[ProjectsModule] V2 sync note:', err);
      if (isManual && this.app) {
        this.app.showToast('V2 sync completed with cached records', 'info');
      }
    }
  },

  /**
   * Loads projects from LocalStorage or falls back to app's default register list
   */
  loadProjects() {
    let stored = Storage.get('projects');
    if (!stored || !Array.isArray(stored)) {
      this.projects = [];
      Storage.set('projects', []);
    } else {
      this.projects = stored;
    }
    
    // Sync back to app instance for other pages' compatibility
    this.app.projectsList = this.projects;
  },

  /**
   * Save changes to LocalStorage and sync with central state & V2 backend
   */
  saveProjects() {
    Storage.set('projects', this.projects);
    this.app.projectsList = this.projects;
    dataService.saveProjects(this.projects).catch((err) => {
      console.warn('[ProjectsModule] Background V2 saveProjects error:', err);
    });
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

    // 12b. Connect V2 Sync Button
    const syncBtn = document.getElementById('project-sync-v2-btn');
    if (syncBtn) {
      const newSyncBtn = syncBtn.cloneNode(true);
      syncBtn.parentNode.replaceChild(newSyncBtn, syncBtn);
      newSyncBtn.addEventListener('click', () => {
        this.syncV2Projects(true);
      });
    }

    // 13. Connect spreadsheet export button from header
    const exportBtn = document.getElementById('project-export-btn');
    if (exportBtn) {
      const newExportBtn = exportBtn.cloneNode(true);
      exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
      
      newExportBtn.addEventListener('click', () => {
        this.exportToExcel();
      });
    }

    // 14. Connect spreadsheet import button from header
    const importBtn = document.getElementById('project-import-btn');
    const fileInput = document.getElementById('project-file-input');
    if (importBtn && fileInput) {
      const newImportBtn = importBtn.cloneNode(true);
      importBtn.parentNode.replaceChild(newImportBtn, importBtn);

      const newFileInput = fileInput.cloneNode(true);
      fileInput.parentNode.replaceChild(newFileInput, fileInput);

      newImportBtn.addEventListener('click', () => {
        newFileInput.value = '';
        newFileInput.click();
      });

      newFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.importFromExcel(e.target.files[0]);
          newFileInput.value = '';
        }
      });
    }
  },

  /**
   * Export enterprise project registers to Excel with Status Legend sheet
   */
  exportToExcel() {
    const filtered = this.getFilteredAndSortedProjects();
    const dataToExport = (filtered && filtered.length > 0) ? filtered : this.projects;

    const headers = [
      'Project / SOW #',
      'Project Name',
      'Client/Customer',
      'HD #',
      'JIRA Links',
      'Confluence Link',
      'Project Manager',
      'Product Manager',
      'Developer',
      'QA',
      'BA',
      'Sprint',
      'Risk',
      'Progress %',
      'Budget ($)',
      'Status',
      'Remarks'
    ];

    const keys = [
      'id',
      'name',
      'client',
      'hd',
      'jiraLinks',
      'confluenceLink',
      'manager',
      'productManager',
      'developer',
      'qa',
      'ba',
      'sprint',
      'risk',
      'progress',
      'budget',
      'status',
      'remarks'
    ];

    const ok = Excel.exportProjectsWithLegend(headers, dataToExport, keys, 'Project_Registers', 'enterprise_projects_registers');
    if (ok) {
      this.app.showToast(`Exported ${dataToExport.length} projects to Excel with Status Legend`, 'success');
    } else {
      this.app.showToast('Failed to export projects spreadsheet', 'danger');
    }
  },

  /**
   * Import projects from Excel / CSV file and update existing or create new
   */
  importFromExcel(file) {
    Excel.parseCustomExcelFile(file, (rows, err) => {
      if (err || !rows || !Array.isArray(rows) || rows.length === 0) {
        this.app.showToast(`Import Error: ${err || 'No valid rows found in file'}`, 'danger');
        return;
      }

      let updatedCount = 0;
      let createdCount = 0;
      let skippedCount = 0;

      rows.forEach(r => {
        if (!r || typeof r !== 'object') return;

        // Flexible column lookup
        const getVal = (possibleKeys) => {
          for (let k of possibleKeys) {
            const found = Object.keys(r).find(key => key && key.trim().toLowerCase() === k.trim().toLowerCase());
            if (found && r[found] !== undefined && r[found] !== null && String(r[found]).trim() !== '') {
              return String(r[found]).trim();
            }
          }
          return '';
        };

        const sowNum = getVal(['SOW#', 'SOW', 'sow', 'SOW Number', 'Project / SOW #']);
        const projCode = sowNum || getVal(['Project Code', 'Project ID', 'id', 'code', 'PRJ#', 'Project Code/ID', 'Code']);
        const projName = getVal(['Project Name', 'name', 'Project', 'Title', 'Project/Client Name', 'Name', 'ProjectTitle']);
        const clientName = getVal(['Client/Customer', 'Client', 'Customer', 'client', 'customer', 'Customer Name', 'Client Name']);

        // Mandatory check: Part from Project Name / Client Name, other fields are optional.
        if (!projName && !clientName) {
          skippedCount++;
          return;
        }

        const effectiveName = projName || clientName;
        const effectiveClient = clientName || projName || 'Internal Client';

        // Optional fields
        const hdNum = getVal(['HD#', 'HD #', 'HD', 'hd', 'Helpdesk']);
        const jiraRaw = getVal(['JIRA Links', 'JIRA Link', 'JIRA#', 'JIRA', 'jira', 'jiraLinks']);
        const confluenceRaw = getVal(['Confluence Link', 'Confluence', 'confluence', 'confluenceLink']);
        const pmName = getVal(['Project Manager', 'Manager', 'manager', 'PM', 'ProjectManager']);
        const prodName = getVal(['Product Manager', 'ProductManager', 'Product Lead', 'productManager']);
        const devName = getVal(['Developer', 'developer', 'Dev', 'Lead Developer']);
        const qaName = getVal(['QA', 'qa', 'Tester', 'QA Lead']);
        const baName = getVal(['BA', 'ba', 'Business Analyst']);
        const sprintName = getVal(['Sprint', 'sprint']);
        const riskRaw = getVal(['Risk', 'risk', 'Risk Level']);
        const progressRaw = getVal(['Progress %', 'Progress', 'progress', 'Completion %', 'Progress%']);
        const budgetRaw = getVal(['Budget ($)', 'Budget', 'budget', 'Approved Budget', 'Cost', 'Project Budget']);
        const statusRaw = getVal(['Status', 'status', 'Project Status']);
        const remarksRaw = getVal(['Remarks', 'remarks', 'Notes', 'Description']);

        const jiraLinksArr = jiraRaw ? jiraRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];

        // Normalize status
        let parsedStatus = '';
        if (statusRaw) {
          const s = statusRaw.toLowerCase();
          if (s.includes('awaiting') || s.includes('sign off') || s.includes('sign-off') || (s.includes('sow') && !s.includes('approved'))) parsedStatus = 'awaiting-sow-sign-off';
          else if (s.includes('progress') || s.includes('active') || s.includes('ongoing')) parsedStatus = 'in-progress';
          else if (s.includes('complet') || s.includes('done') || s.includes('finish') || s.includes('closed')) parsedStatus = 'completed';
          else if (s.includes('plan') || s.includes('pipeline') || s.includes('scop') || s.includes('initiat')) parsedStatus = 'planning';
          else if (s.includes('hold') || s.includes('pause') || s.includes('suspend')) parsedStatus = 'on-hold';
          else if (s.includes('archiv')) parsedStatus = 'archived';
          else parsedStatus = 'in-progress';
        }

        // Normalize risk
        let parsedRisk = '';
        if (riskRaw) {
          const rLow = riskRaw.toLowerCase();
          if (rLow.includes('crit')) parsedRisk = 'Critical';
          else if (rLow.includes('high')) parsedRisk = 'High';
          else if (rLow.includes('med')) parsedRisk = 'Medium';
          else if (rLow.includes('low')) parsedRisk = 'Low';
          else parsedRisk = 'Low';
        }

        // Parse progress
        let parsedProgress = null;
        if (progressRaw !== '') {
          const cleanP = progressRaw.replace(/[^0-9.]/g, '');
          if (cleanP !== '') {
            let pNum = parseFloat(cleanP);
            if (pNum > 0 && pNum <= 1 && progressRaw.indexOf('%') === -1) pNum = Math.round(pNum * 100);
            parsedProgress = Math.min(100, Math.max(0, pNum));
          }
        }

        // Parse budget (Accepts 0 as valid!)
        let parsedBudget = null;
        if (budgetRaw !== '') {
          const cleanB = budgetRaw.replace(/[^0-9.]/g, '');
          if (cleanB !== '') {
            parsedBudget = parseFloat(cleanB);
          }
        }

        // Try to match existing project by Code or Name or SOW#
        let existingProj = null;
        if (projCode) {
          existingProj = this.projects.find(p => (p.id && p.id.toLowerCase() === projCode.toLowerCase()) || (p.sow && p.sow.toLowerCase() === projCode.toLowerCase()));
        }
        if (!existingProj && effectiveName) {
          existingProj = this.projects.find(p => p.name && p.name.toLowerCase().trim() === effectiveName.toLowerCase().trim());
        }

        if (existingProj) {
          // UPDATE existing record - override non-empty imported fields
          if (sowNum) {
            existingProj.sow = sowNum;
            existingProj.id = sowNum; // Project # = SOW#
          }
          if (hdNum) existingProj.hd = hdNum;
          if (jiraLinksArr.length > 0) existingProj.jiraLinks = jiraLinksArr;
          if (confluenceRaw) existingProj.confluenceLink = confluenceRaw;
          if (projName) existingProj.name = projName;
          if (clientName) existingProj.client = clientName;
          if (pmName) existingProj.manager = pmName;
          if (prodName) existingProj.productManager = prodName;
          if (devName) existingProj.developer = devName;
          if (qaName) existingProj.qa = qaName;
          if (baName) existingProj.ba = baName;
          if (sprintName) existingProj.sprint = sprintName;
          if (parsedRisk) existingProj.risk = parsedRisk;
          if (parsedProgress !== null) existingProj.progress = parsedProgress;
          if (parsedBudget !== null) existingProj.budget = parsedBudget;
          if (parsedStatus) existingProj.status = parsedStatus;
          if (remarksRaw) existingProj.remarks = remarksRaw;

          updatedCount++;
        } else {
          // CREATE new record
          const maxNum = this.getMaxProjectCodeNum() + 1;
          const autoCode = `PRJ${String(maxNum).padStart(3, '0')}`;
          const newCode = sowNum || projCode || autoCode;

          const newProj = {
            id: newCode,
            sow: sowNum || newCode,
            hd: hdNum || '',
            jiraLinks: jiraLinksArr,
            confluenceLink: confluenceRaw || '',
            name: effectiveName,
            client: effectiveClient,
            manager: pmName || 'Surya Prashanth',
            productManager: prodName || '',
            developer: devName || 'Bob Johnson',
            qa: qaName || 'David Miller',
            ba: baName || 'Sarah Connor',
            sprint: sprintName || 'Sprint 14',
            risk: parsedRisk || 'Low',
            progress: parsedProgress !== null ? parsedProgress : 0,
            budget: parsedBudget !== null ? parsedBudget : 0,
            status: parsedStatus || 'in-progress',
            remarks: remarksRaw || 'Imported from Excel',
            poc: '',
            estimatedStart: new Date().toISOString().split('T')[0],
            estimatedEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            actualStart: '',
            actualEnd: '',
            month: new Date().toLocaleString('default', { month: 'long' }),
            quarter: 'Q3',
            year: '2026'
          };

          this.projects.unshift(newProj);
          createdCount++;
        }
      });

      if (updatedCount > 0 || createdCount > 0) {
        this.saveProjects();
        this.populateFilterDropdowns();
        this.render();

        let msg = '';
        if (updatedCount > 0 && createdCount > 0) {
          msg = `Updated ${updatedCount} existing project(s) & created ${createdCount} new project(s)!`;
        } else if (updatedCount > 0) {
          msg = `Successfully updated ${updatedCount} existing project(s)!`;
        } else {
          msg = `Successfully created ${createdCount} new project(s)!`;
        }
        this.app.showToast(msg, 'success');
      } else {
        this.app.showToast('No valid project rows found in file. Ensure Project Name or Client Name is present.', 'warning');
      }
    });
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
    let registeredCusts = Storage.getCustomers();
    if (!registeredCusts || registeredCusts.length === 0) {
      registeredCusts = this.app?.customersList || [];
    }
    const customerNamesFromList = registeredCusts.map(c => c.name).filter(Boolean);
    const allCustomers = [...new Set([...customerNamesFromList, ...fetchUnique('client')])].sort();

    populateDropdown('filter-customer', allCustomers, 'All Customers');
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

      // Build HD / Links
      let linksHtml = '';
      if (p.hd) {
        linksHtml += `<div style="font-size: 0.75rem;"><span class="badge bg-light text-dark border font-mono me-1"><i class="fa-solid fa-headset text-primary me-1"></i>${p.hd}</span></div>`;
      }
      const jiraArr = Array.isArray(p.jiraLinks) ? p.jiraLinks : (p.jiraLinks ? [p.jiraLinks] : []);
      if (jiraArr.length > 0) {
        linksHtml += `<div class="d-flex flex-wrap gap-1 mt-1">`;
        jiraArr.forEach((link, idx) => {
          if (link) {
            linksHtml += `<a href="${link}" target="_blank" class="badge bg-primary-subtle text-primary text-decoration-none" style="font-size: 0.7rem;" title="${link}"><i class="fa-brands fa-jira me-1"></i>JIRA ${jiraArr.length > 1 ? '#' + (idx + 1) : ''}</a>`;
          }
        });
        linksHtml += `</div>`;
      }
      if (p.confluenceLink) {
        linksHtml += `<div class="mt-1"><a href="${p.confluenceLink}" target="_blank" class="badge bg-info-subtle text-info-emphasis text-decoration-none" style="font-size: 0.7rem;" title="${p.confluenceLink}"><i class="fa-brands fa-confluence me-1"></i>Confluence</a></div>`;
      }
      if (!linksHtml) linksHtml = '<span class="text-muted" style="font-size: 0.75rem;">-</span>';

      tr.innerHTML = `
        <td class="row-checkbox-cell" style="padding: 14px 10px 14px 20px;">
          <input type="checkbox" class="form-check-input project-row-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''} />
        </td>
        <td class="clickable-project-cell" data-id="${p.id}"><div class="table-project-title text-primary font-bold" style="font-size: 0.85rem;">${p.sow || p.id}</div></td>
        <td class="clickable-project-cell" data-id="${p.id}">
          <div class="table-project-cell">
            <span class="table-project-title font-semibold" style="font-size: 0.9rem;">${p.name}</span>
            <div class="d-flex align-items-center gap-1 flex-wrap">
              <span class="table-project-client" style="font-size: 0.75rem;"><i class="fa-solid fa-building me-1"></i> ${p.client}</span>
              ${p.productName || p.productId ? `<span class="badge bg-light text-primary border" style="font-size: 0.68rem;"><i class="fa-solid fa-cube me-1"></i>${p.productName || p.productId}</span>` : ''}
            </div>
          </div>
        </td>
        <td class="clickable-project-cell" data-id="${p.id}"><span class="text-secondary-custom font-semibold">${p.manager || 'Surya Prashanth'}</span></td>
        <td class="clickable-project-cell" data-id="${p.id}"><span class="text-secondary-custom font-semibold">${p.productManager || '-'}</span></td>
        <td class="clickable-project-cell" data-id="${p.id}">${linksHtml}</td>
        <td class="clickable-project-cell" data-id="${p.id}"><span class="badge ${riskClass}" style="font-size: 0.725rem; font-weight: 600; padding: 4px 8px;">${p.risk || 'Low'}</span></td>
        <td class="clickable-project-cell" data-id="${p.id}">
          <div class="d-flex align-items-center gap-2">
            <span class="table-progress-bar" style="width: 80px;">
              <span class="table-progress-fill" style="width: ${p.progress}%; background-color: ${fillCol}"></span>
            </span>
            <span class="font-bold text-secondary" style="font-size: 0.75rem;">${p.progress}%</span>
          </div>
        </td>
        <td class="clickable-project-cell font-semibold" data-id="${p.id}">$${Number(p.budget || 0).toLocaleString()}</td>
        <td class="clickable-project-cell" data-id="${p.id}"><span class="status-badge ${p.status}">${p.status === 'awaiting-sow-sign-off' ? 'Awaiting SOW sign off' : (p.status || '').replace(/-/g, ' ')}</span></td>
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
      dataService.deleteProject(id);
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
    const sowInp = document.getElementById('edit-sow');
    if (sowInp) {
      sowInp.value = proj.sow || proj.id || '';
      sowInp.oninput = () => {
        const val = sowInp.value.trim();
        if (val) {
          document.getElementById('detail-proj-id').textContent = val;
          document.getElementById('edit-id').value = val;
        }
        this.triggerAutosave();
      };
    }
    const hdInp = document.getElementById('edit-hd');
    if (hdInp) hdInp.value = proj.hd || '';
    
    const prodMSelect = document.getElementById('edit-product-manager');
    if (prodMSelect) prodMSelect.value = proj.productManager || '';

    const conflInp = document.getElementById('edit-confluence');
    if (conflInp) conflInp.value = proj.confluenceLink || '';

    // Render JIRA links builder
    this.renderJiraLinksContainer(proj.jiraLinks || []);

    document.getElementById('edit-id').value = proj.id;
    document.getElementById('edit-name').value = proj.name;
    document.getElementById('edit-client').value = proj.client;
    document.getElementById('edit-budget').value = proj.budget !== undefined && proj.budget !== null ? proj.budget : 0;
    document.getElementById('edit-remarks').value = proj.remarks || '';
    document.getElementById('edit-est-start').value = proj.estimatedStart || '';
    document.getElementById('edit-est-end').value = proj.estimatedEnd || '';
    document.getElementById('edit-act-start').value = proj.actualStart || '';
    document.getElementById('edit-act-end').value = proj.actualEnd || '';
    document.getElementById('edit-manager').value = proj.manager || '';
    document.getElementById('edit-ba').value = proj.ba || '';
    document.getElementById('edit-developer').value = proj.developer || '';
    document.getElementById('edit-qa').value = proj.qa || '';
    const sprintEl = document.getElementById('edit-sprint');
    if (sprintEl) sprintEl.value = proj.sprint || '';
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

    // Render linked delivery work breakdown (Epics, Features, Stories, Tasks)
    this.renderProjectDeliveryItems(proj.id);

    // Render linked project risks (Sprint 5A)
    this.renderProjectRisks(proj.id);

    // Render linked project issues (Sprint 5B)
    this.renderProjectIssues(proj.id);

    // Render linked project dependencies (Sprint 5C)
    this.renderProjectDependencies(proj.id);
  },

  /**
   * Renders Delivery Work Breakdown (Epics -> Features -> Stories -> Tasks) inside project detail
   */
  async renderProjectDeliveryItems(projectId) {
    const container = document.getElementById('project-delivery-items-container');
    const btnAddEpic = document.getElementById('btn-project-add-epic');
    const btnTrace = document.getElementById('btn-project-trace-lineage');

    if (btnAddEpic) {
      btnAddEpic.onclick = () => {
        if (window.portalDeliveryModule) {
          window.portalDeliveryModule.openEpicModal(null, projectId);
        }
      };
    }

    if (btnTrace) {
      btnTrace.onclick = () => {
        if (this.app) {
          this.app.navigateToPage('delivery');
          setTimeout(() => {
            if (window.portalDeliveryModule) {
              window.portalDeliveryModule.inspectTrace('project', projectId);
            }
          }, 150);
        }
      };
    }

    if (!container) return;
    container.innerHTML = `
      <div class="text-center py-4 text-muted">
        <i class="fa-solid fa-spinner fa-spin me-2"></i> Loading delivery work breakdown...
      </div>
    `;

    try {
      const [epics, features, stories, tasks] = await Promise.all([
        EpicService.getEpics(projectId).catch(() => []),
        FeatureService.getFeatures(projectId).catch(() => []),
        StoryService.getStories(projectId).catch(() => []),
        TaskService.getTasks(projectId).catch(() => []),
      ]);

      if (!epics || epics.length === 0) {
        container.innerHTML = `
          <div class="p-4 text-center text-muted bg-light rounded">
            <div class="mb-2"><i class="fa-solid fa-crown fa-2x text-secondary" style="opacity: 0.4;"></i></div>
            <h6 class="fw-bold">No Epics Created for This Project Yet</h6>
            <p class="small text-muted mb-3">Epics group large feature capabilities and establish the delivery management hierarchy.</p>
            <button type="button" class="btn btn-primary btn-sm" onclick="window.portalDeliveryModule && window.portalDeliveryModule.openEpicModal(null, '${projectId}')">
              <i class="fa-solid fa-plus me-1"></i> Add First Epic
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="delivery-project-hierarchy">
          ${epics.map(epic => {
            const epicFeatures = features.filter(f => f.epicId === epic.id);
            return `
              <div class="border rounded p-3 mb-3 bg-white shadow-2xs">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-purple-subtle text-purple fw-bold font-monospace" style="background-color: rgba(139, 92, 246, 0.15); color: #7c3aed;">
                      <i class="fa-solid fa-crown me-1"></i>${epic.code || 'EPIC'}
                    </span>
                    <strong class="text-dark">${epic.name}</strong>
                    <span class="badge bg-light text-secondary border small text-capitalize">${epic.status}</span>
                    <span class="badge bg-light text-secondary border small text-capitalize">${epic.priority}</span>
                  </div>
                  <div class="d-flex align-items-center gap-3">
                    <div class="d-flex align-items-center gap-2" style="width: 140px;">
                      <div class="progress flex-grow-1" style="height: 6px;">
                        <div class="progress-bar bg-success" style="width: ${epic.progress || 0}%"></div>
                      </div>
                      <span class="small fw-bold text-muted">${epic.progress || 0}%</span>
                    </div>
                    <div class="btn-group btn-group-sm">
                      <button type="button" class="btn btn-outline-primary btn-sm py-0 px-2" title="Add Feature" onclick="window.portalDeliveryModule && window.portalDeliveryModule.openFeatureModal(null, '${epic.id}', '${projectId}')">
                        <i class="fa-solid fa-plus"></i> Feature
                      </button>
                      <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2" title="Trace Lineage" onclick="window.portalDeliveryModule && window.portalDeliveryModule.inspectTrace('epic', '${epic.id}')">
                        <i class="fa-solid fa-route"></i>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Features list under this epic -->
                ${epicFeatures.length > 0 ? `
                  <div class="mt-2.5 pt-2 border-top ms-3">
                    ${epicFeatures.map(feature => {
                      const featStories = stories.filter(s => s.featureId === feature.id);
                      return `
                        <div class="border-start border-3 border-info ps-2.5 mb-2 py-1 bg-light rounded">
                          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div class="d-flex align-items-center gap-2">
                              <span class="badge bg-info-subtle text-info fw-bold font-monospace"><i class="fa-solid fa-puzzle-piece me-1"></i>${feature.code || 'FEAT'}</span>
                              <span class="fw-semibold small">${feature.name}</span>
                              <span class="badge bg-white text-secondary border small text-capitalize">${feature.status}</span>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                              <span class="small text-muted">${feature.progress || 0}%</span>
                              <button type="button" class="btn btn-outline-primary btn-xs py-0 px-1.5 text-xs" onclick="window.portalDeliveryModule && window.portalDeliveryModule.openStoryModal(null, '${feature.id}', '${projectId}')">
                                <i class="fa-solid fa-plus"></i> Story
                              </button>
                              <button type="button" class="btn btn-outline-secondary btn-xs py-0 px-1.5 text-xs" onclick="window.portalDeliveryModule && window.portalDeliveryModule.inspectTrace('feature', '${feature.id}')">
                                <i class="fa-solid fa-route"></i>
                              </button>
                            </div>
                          </div>

                          <!-- Stories under feature -->
                          ${featStories.length > 0 ? `
                            <div class="mt-1 ms-3 pt-1 border-top">
                              ${featStories.map(story => {
                                const storyTasks = tasks.filter(t => t.storyId === story.id);
                                return `
                                  <div class="d-flex justify-content-between align-items-center py-1 border-bottom border-light">
                                    <div class="d-flex align-items-center gap-2">
                                      <span class="badge bg-warning-subtle text-warning font-monospace small">${story.code || 'STR'}</span>
                                      <span class="small fw-semibold text-dark">${story.title}</span>
                                      ${story.storyPoints ? `<span class="badge bg-white text-secondary border small">${story.storyPoints} pts</span>` : ''}
                                    </div>
                                    <div class="d-flex align-items-center gap-2">
                                      <span class="small text-muted">${storyTasks.length} tasks</span>
                                      <button type="button" class="btn btn-outline-primary btn-xs py-0 px-1 text-xs" onclick="window.portalDeliveryModule && window.portalDeliveryModule.openTaskModal(null, '${story.id}', '${projectId}')">
                                        <i class="fa-solid fa-plus"></i> Task
                                      </button>
                                      <button type="button" class="btn btn-outline-secondary btn-xs py-0 px-1 text-xs" onclick="window.portalDeliveryModule && window.portalDeliveryModule.inspectTrace('story', '${story.id}')">
                                        <i class="fa-solid fa-route"></i>
                                      </button>
                                    </div>
                                  </div>
                                `;
                              }).join('')}
                            </div>
                          ` : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      console.error('Failed loading delivery items in project detail:', err);
      container.innerHTML = `<div class="text-danger small p-2">Failed to load project delivery breakdown.</div>`;
    }
  },

  /**
   * Renders Linked Project Risks (Sprint 5A) inside project detail
   */
  async renderProjectRisks(projectId) {
    const container = document.getElementById('project-risks-container');
    const badgeCount = document.getElementById('project-risks-count-badge');
    const btnAdd = document.getElementById('btn-project-add-risk');

    if (btnAdd) {
      btnAdd.onclick = () => {
        if (window.portalRiskModule) {
          window.portalRiskModule.openCreateModal(projectId);
        } else {
          this.app?.navigateToPage('risks');
        }
      };
    }

    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-3 text-muted">
        <i class="fa-solid fa-spinner fa-spin me-2"></i> Loading project risks...
      </div>
    `;

    try {
      const risks = await RiskService.getRisks({ projectId });
      if (badgeCount) badgeCount.textContent = risks.length;

      if (!risks || risks.length === 0) {
        container.innerHTML = `
          <div class="p-4 text-center text-muted bg-light rounded" style="border: 1px dashed var(--border-color);">
            <div class="mb-2"><i class="fa-solid fa-shield-halved fa-2x text-secondary" style="opacity: 0.4;"></i></div>
            <div class="fw-semibold">No Risks Logged for this Project</div>
            <div class="text-xs text-secondary mt-1">Capture technical, schedule, or operational risks early to protect delivery.</div>
          </div>
        `;
        return;
      }

      const severityStyles = {
        Critical: { bg: 'rgba(239, 68, 68, 0.15)', text: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' },
        High: { bg: 'rgba(249, 115, 22, 0.15)', text: '#ea580c', border: 'rgba(249, 115, 22, 0.3)' },
        Medium: { bg: 'rgba(245, 158, 11, 0.15)', text: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
        Low: { bg: 'rgba(16, 185, 129, 0.15)', text: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
      };

      container.innerHTML = `
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
            <thead style="background-color: var(--bg-light);">
              <tr>
                <th style="width: 100px;">Code</th>
                <th>Title</th>
                <th style="width: 120px;">Category</th>
                <th style="width: 80px; text-align: center;">P × I</th>
                <th style="width: 120px; text-align: center;">Score</th>
                <th style="width: 110px; text-align: center;">Status</th>
                <th style="width: 110px;">Target Date</th>
                <th style="width: 90px; text-align: center;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${risks.map(r => {
                const sev = severityStyles[r.severity] || severityStyles.Low;
                return `
                  <tr>
                    <td><span class="badge bg-secondary-subtle text-secondary font-monospace">${r.code || 'RSK-?'}</span></td>
                    <td>
                      <div class="fw-bold">${r.title}</div>
                      ${r.mitigationPlan ? `<div class="text-xs text-secondary text-truncate" style="max-width: 300px;">Plan: ${r.mitigationPlan}</div>` : ''}
                    </td>
                    <td><span class="badge bg-light text-dark border">${r.category}</span></td>
                    <td style="text-align: center;"><span class="fw-semibold">${r.probability} × ${r.impact}</span></td>
                    <td style="text-align: center;">
                      <span class="badge" style="background-color: ${sev.bg}; color: ${sev.text}; border: 1px solid ${sev.border};">
                        ${r.riskScore} — ${r.severity}
                      </span>
                    </td>
                    <td style="text-align: center;"><span class="badge bg-secondary">${r.status}</span></td>
                    <td><span class="text-xs text-secondary">${r.targetResolutionDate ? r.targetResolutionDate.split('T')[0] : '—'}</span></td>
                    <td style="text-align: center;">
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary btn-proj-view-risk" data-id="${r.id}" title="View Risk">
                          <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-proj-edit-risk" data-id="${r.id}" title="Edit Risk">
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      container.querySelectorAll('.btn-proj-view-risk').forEach(btn => {
        btn.onclick = () => {
          if (window.portalRiskModule) {
            window.portalRiskModule.openViewModal(btn.dataset.id);
          }
        };
      });

      container.querySelectorAll('.btn-proj-edit-risk').forEach(btn => {
        btn.onclick = () => {
          if (window.portalRiskModule) {
            window.portalRiskModule.openEditModal(btn.dataset.id);
          }
        };
      });
    } catch (err) {
      container.innerHTML = `
        <div class="p-3 text-danger text-center">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> Error loading project risks: ${err.message}
        </div>
      `;
    }
  },

  /**
   * Renders Linked Project Issues (Sprint 5B) inside project detail
   */
  async renderProjectIssues(projectId) {
    const container = document.getElementById('project-issues-container');
    const badgeCount = document.getElementById('project-issues-count-badge');
    const btnAdd = document.getElementById('btn-project-add-issue');

    if (btnAdd) {
      btnAdd.onclick = () => {
        if (window.GovernanceModule) {
          window.GovernanceModule.openIssueModal();
          setTimeout(() => {
            const projSelect = document.getElementById('m-issue-project');
            if (projSelect) projSelect.value = projectId;
          }, 50);
        } else {
          this.app?.navigateToPage('issues');
        }
      };
    }

    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-3 text-muted">
        <i class="fa-solid fa-spinner fa-spin me-2"></i> Loading project issues...
      </div>
    `;

    try {
      const issues = await IssueService.getIssues({ projectId });
      if (badgeCount) badgeCount.textContent = issues.length;

      if (!issues || issues.length === 0) {
        container.innerHTML = `
          <div class="p-4 text-center text-muted bg-light rounded" style="border: 1px dashed var(--border-color);">
            <div class="mb-2"><i class="fa-solid fa-circle-check fa-2x text-success" style="opacity: 0.4;"></i></div>
            <div class="fw-semibold">No Active Issues Logged for this Project</div>
            <div class="text-xs text-secondary mt-1">All delivery streams clear of reported defects or technical blockers.</div>
          </div>
        `;
        return;
      }

      const severityBadges = {
        Critical: 'bg-danger text-white',
        High: 'bg-warning text-dark font-bold',
        Medium: 'bg-warning-subtle text-dark',
        Low: 'bg-secondary-subtle text-secondary'
      };

      const statusBadges = {
        Resolved: 'bg-success text-white',
        Closed: 'bg-secondary text-white',
        Blocked: 'bg-danger text-white',
        'In Progress': 'bg-primary text-white',
        Investigating: 'bg-info text-dark',
        Rejected: 'bg-dark text-white',
        Open: 'bg-light text-dark border'
      };

      container.innerHTML = `
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
            <thead style="background-color: var(--bg-light);">
              <tr>
                <th style="width: 100px;">Code</th>
                <th>Title</th>
                <th style="width: 100px; text-align: center;">Severity</th>
                <th style="width: 90px; text-align: center;">Priority</th>
                <th style="width: 110px; text-align: center;">Status</th>
                <th style="width: 130px;">Root Cause</th>
                <th style="width: 110px;">Target Date</th>
                <th style="width: 90px; text-align: center;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${issues.map(i => {
                const sevClass = severityBadges[i.severity] || 'bg-secondary';
                const statClass = statusBadges[i.status] || 'bg-secondary';
                const rootDisplay = i.rootCauseCategory || i.rootCause || '—';
                const targetDate = i.targetResolutionDate ? i.targetResolutionDate.split('T')[0] : (i.dueDate ? i.dueDate.split('T')[0] : '—');
                return `
                  <tr>
                    <td><span class="badge bg-secondary-subtle text-secondary font-monospace">${i.code || 'ISS-?'}</span></td>
                    <td>
                      <div class="fw-bold text-primary" style="cursor: pointer;" onclick="window.GovernanceModule && window.GovernanceModule.openIssueDetails('${i.id}')">${i.title}</div>
                      ${i.description ? `<div class="text-xs text-secondary text-truncate" style="max-width: 280px;">${i.description}</div>` : ''}
                    </td>
                    <td style="text-align: center;"><span class="badge ${sevClass}">${i.severity}</span></td>
                    <td style="text-align: center;"><span class="text-xs font-semibold">${i.priority}</span></td>
                    <td style="text-align: center;"><span class="badge ${statClass}">${i.status}</span></td>
                    <td><span class="badge bg-info-subtle text-info text-truncate" style="max-width: 120px;">${rootDisplay}</span></td>
                    <td><span class="text-xs text-secondary">${targetDate}</span></td>
                    <td style="text-align: center;">
                      <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary btn-proj-view-issue" data-id="${i.id}" title="View Details">
                          <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-proj-edit-issue" data-id="${i.id}" title="Edit Issue">
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      container.querySelectorAll('.btn-proj-view-issue').forEach(btn => {
        btn.onclick = () => {
          if (window.GovernanceModule) {
            window.GovernanceModule.openIssueDetails(btn.dataset.id);
          }
        };
      });

      container.querySelectorAll('.btn-proj-edit-issue').forEach(btn => {
        btn.onclick = () => {
          if (window.GovernanceModule) {
            window.GovernanceModule.openIssueModal(btn.dataset.id);
          }
        };
      });
    } catch (err) {
      container.innerHTML = `
        <div class="p-3 text-danger text-center">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> Error loading project issues: ${err.message}
        </div>
      `;
    }
  },

  /**
   * Renders Linked Project Dependencies (Sprint 5C) inside project detail
   */
  async renderProjectDependencies(projectId) {
    const container = document.getElementById('project-dependencies-container');
    const badgeCount = document.getElementById('project-deps-count-badge');
    const btnAdd = document.getElementById('btn-project-add-dependency');

    if (btnAdd) {
      btnAdd.onclick = () => {
        if (window.GovernanceModule) {
          window.GovernanceModule.openDependencyModal(null, {
            sourceEntityId: projectId,
            sourceEntityType: 'project',
            projectId: projectId,
          });
        } else {
          this.app?.navigateToPage('governance');
        }
      };
    }

    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-3 text-muted">
        <i class="fa-solid fa-spinner fa-spin me-2"></i> Loading project dependencies...
      </div>
    `;

    try {
      const deps = await DependencyService.getDependencies({ projectId });
      if (badgeCount) badgeCount.textContent = deps.length;

      if (!deps || deps.length === 0) {
        container.innerHTML = `
          <div class="p-4 text-center text-muted bg-light rounded" style="border: 1px dashed var(--border-color);">
            <div class="mb-2"><i class="fa-solid fa-diagram-project fa-2x text-primary" style="opacity: 0.4;"></i></div>
            <div class="fw-semibold">No Dependencies Recorded for this Project</div>
            <div class="text-xs text-secondary mt-1">Cross-initiative execution linkages, blockers, and prerequisites will appear here.</div>
          </div>
        `;
        return;
      }

      // Partition into Inbound (blocking this project) and Outbound (this project blocks)
      const inbound = deps.filter(d => d.targetEntityId === projectId || d.dependencyType === 'Depends On' || d.dependencyType === 'Blocked By');
      const outbound = deps.filter(d => !inbound.includes(d));

      const criticalityBadges = {
        Critical: 'bg-danger text-white',
        High: 'bg-warning text-dark fw-bold',
        Medium: 'bg-primary-subtle text-primary',
        Low: 'bg-secondary-subtle text-secondary',
      };

      const statusBadges = {
        Open: 'bg-light text-dark border',
        'In Progress': 'bg-primary text-white',
        'At Risk': 'bg-warning text-dark fw-bold',
        Blocked: 'bg-danger text-white',
        Resolved: 'bg-success text-white',
        Closed: 'bg-secondary text-white',
        Cancelled: 'bg-dark text-white',
      };

      const renderTable = (items, emptyMessage) => {
        if (!items || items.length === 0) {
          return `<div class="p-3 text-muted text-center small">${emptyMessage}</div>`;
        }
        return `
          <div class="table-responsive mb-3">
            <table class="table table-hover align-middle mb-0" style="font-size: 0.85rem;">
              <thead style="background-color: var(--bg-light);">
                <tr>
                  <th style="width: 90px;">Code</th>
                  <th>Relationship</th>
                  <th style="width: 110px; text-align: center;">Type</th>
                  <th style="width: 100px; text-align: center;">Criticality</th>
                  <th style="width: 110px; text-align: center;">Status</th>
                  <th style="width: 100px;">Target Date</th>
                  <th style="width: 90px; text-align: center;">Critical Path</th>
                  <th style="width: 90px; text-align: center;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(d => {
                  const critBadge = criticalityBadges[d.criticality] || 'bg-secondary text-white';
                  const statBadge = statusBadges[d.status] || 'bg-light text-dark';
                  const isCritPath = d.isCritical || d.isCriticalPath;
                  return `
                    <tr>
                      <td class="fw-bold text-primary">${d.code || d.id}</td>
                      <td>
                        <div class="fw-semibold">${d.sourceEntityName}</div>
                        <div class="small text-muted"><i class="fa-solid fa-arrow-right text-secondary me-1"></i>${d.targetEntityName}</div>
                      </td>
                      <td class="text-center"><span class="badge bg-secondary-subtle text-dark border">${d.dependencyType}</span></td>
                      <td class="text-center"><span class="badge ${critBadge}">${d.criticality || 'Medium'}</span></td>
                      <td class="text-center"><span class="badge ${statBadge}">${d.status}</span></td>
                      <td>${d.targetDate || d.dueDate || '—'}</td>
                      <td class="text-center">
                        ${isCritPath ? '<span class="badge bg-danger-subtle text-danger"><i class="fa-solid fa-bolt me-1"></i>Yes</span>' : '<span class="text-muted small">No</span>'}
                      </td>
                      <td class="text-center">
                        <div class="btn-group btn-group-sm">
                          <button class="btn btn-outline-secondary btn-proj-view-dep" data-id="${d.id}" title="View Details">
                            <i class="fa-solid fa-eye"></i>
                          </button>
                          <button class="btn btn-outline-primary btn-proj-edit-dep" data-id="${d.id}" title="Edit Dependency">
                            <i class="fa-solid fa-pen"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      };

      container.innerHTML = `
        <div class="nav nav-tabs nav-tabs-sm mb-3" role="tablist">
          <button class="nav-link active fw-semibold" id="proj-deps-all-tab" data-bs-toggle="tab" data-bs-target="#proj-deps-all" type="button" role="tab">
            All (${deps.length})
          </button>
          <button class="nav-link fw-semibold" id="proj-deps-inbound-tab" data-bs-toggle="tab" data-bs-target="#proj-deps-inbound" type="button" role="tab">
            Inbound / Prerequisites (${inbound.length})
          </button>
          <button class="nav-link fw-semibold" id="proj-deps-outbound-tab" data-bs-toggle="tab" data-bs-target="#proj-deps-outbound" type="button" role="tab">
            Outbound / Blocked Items (${outbound.length})
          </button>
        </div>
        <div class="tab-content">
          <div class="tab-pane fade show active" id="proj-deps-all" role="tabpanel">
            ${renderTable(deps, 'No dependencies')}
          </div>
          <div class="tab-pane fade" id="proj-deps-inbound" role="tabpanel">
            ${renderTable(inbound, 'No inbound dependencies')}
          </div>
          <div class="tab-pane fade" id="proj-deps-outbound" role="tabpanel">
            ${renderTable(outbound, 'No outbound dependencies')}
          </div>
        </div>
      `;

      container.querySelectorAll('.btn-proj-view-dep').forEach(btn => {
        btn.onclick = () => {
          if (window.GovernanceModule) {
            window.GovernanceModule.openDependencyDetails(btn.dataset.id);
          }
        };
      });

      container.querySelectorAll('.btn-proj-edit-dep').forEach(btn => {
        btn.onclick = () => {
          if (window.GovernanceModule) {
            window.GovernanceModule.openDependencyModal(btn.dataset.id);
          }
        };
      });
    } catch (err) {
      container.innerHTML = `
        <div class="p-3 text-danger text-center">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> Error loading project dependencies: ${err.message}
        </div>
      `;
    }
  },

  /**
   * Renders dynamic JIRA links builder inputs in project details form
   */
  renderJiraLinksContainer(jiraLinksArray) {
    const container = document.getElementById('edit-jira-links-container');
    if (!container) return;

    let links = Array.isArray(jiraLinksArray) && jiraLinksArray.length > 0 
      ? jiraLinksArray 
      : (typeof jiraLinksArray === 'string' && jiraLinksArray ? [jiraLinksArray] : ['']);

    if (links.length === 0) links = [''];

    container.innerHTML = '';
    links.forEach((link) => {
      const row = document.createElement('div');
      row.className = 'd-flex align-items-center gap-2 jira-link-row';
      row.innerHTML = `
        <div class="input-group">
          <span class="input-group-text bg-light"><i class="fa-brands fa-jira text-primary"></i></span>
          <input type="url" class="form-control select-enterprise jira-link-input" placeholder="https://jira.company.com/browse/PROJ-101" value="${link}" />
        </div>
        <button type="button" class="btn btn-outline-danger btn-sm btn-remove-jira-link" title="Remove Link">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;
      container.appendChild(row);

      const inp = row.querySelector('.jira-link-input');
      inp.addEventListener('input', () => this.triggerAutosave());
      inp.addEventListener('change', () => this.triggerAutosave());

      const removeBtn = row.querySelector('.btn-remove-jira-link');
      removeBtn.addEventListener('click', () => {
        row.remove();
        if (container.querySelectorAll('.jira-link-row').length === 0) {
          this.renderJiraLinksContainer(['']);
        }
        this.triggerAutosave();
      });
    });

    const addBtn = document.getElementById('btn-add-jira-link');
    if (addBtn) {
      addBtn.onclick = () => {
        const row = document.createElement('div');
        row.className = 'd-flex align-items-center gap-2 jira-link-row';
        row.innerHTML = `
          <div class="input-group">
            <span class="input-group-text bg-light"><i class="fa-brands fa-jira text-primary"></i></span>
            <input type="url" class="form-control select-enterprise jira-link-input" placeholder="https://jira.company.com/browse/PROJ-101" value="" />
          </div>
          <button type="button" class="btn btn-outline-danger btn-sm btn-remove-jira-link" title="Remove Link">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        `;
        container.appendChild(row);

        const inp = row.querySelector('.jira-link-input');
        inp.addEventListener('input', () => this.triggerAutosave());
        inp.addEventListener('change', () => this.triggerAutosave());

        const removeBtn = row.querySelector('.btn-remove-jira-link');
        removeBtn.addEventListener('click', () => {
          row.remove();
          if (container.querySelectorAll('.jira-link-row').length === 0) {
            this.renderJiraLinksContainer(['']);
          }
          this.triggerAutosave();
        });

        inp.focus();
      };
    }
  },

  /**
   * Retrieves all registered team members across User Management (Authentication) and Resource Planner
   */
  getTeamMembersList() {
    const map = new Map();

    // 1. System Users registered in User Management (Settings)
    const settingsUsers = Storage.get('portal_users') || [];
    settingsUsers.forEach(u => {
      const fullName = (u.name || '').trim();
      if (fullName) {
        map.set(fullName, {
          name: fullName,
          role: u.role || 'Team Member',
          dept: u.dept || u.department || 'Dev'
        });
      }
    });

    // 2. Fallback to Authentication users
    const users = Authentication.getUsers() || this.app?.usersList || [];
    users.forEach(u => {
      const fullName = (u.name || `${u.firstName || ''} ${u.lastName || ''}`).trim();
      if (fullName && !map.has(fullName)) {
        map.set(fullName, {
          name: fullName,
          role: u.role || 'Team Member',
          dept: u.department || 'Dev'
        });
      }
    });

    // 3. Staffing Resources from Storage or app.resourcesList
    let resources = Storage.getResources();
    if (!resources || resources.length === 0) {
      resources = this.app?.resourcesList || [];
    }
    resources.forEach(r => {
      if (r.name && !map.has(r.name)) {
        map.set(r.name, {
          name: r.name,
          role: r.role || 'Resource',
          dept: r.dept || 'Dev'
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Filter members by their exact assigned role/department in settings
   */
  getTeamMembersByRole(targetRole) {
    const allMembers = this.getTeamMembersList();
    if (!targetRole) return allMembers;
    const norm = targetRole.toLowerCase().trim();

    return allMembers.filter(m => {
      const dept = (m.dept || '').toLowerCase().trim();
      const role = (m.role || '').toLowerCase().trim();

      if (norm === 'project manager' || norm === 'pm') {
        return dept === 'project manager' || dept === 'pm' || role === 'project manager' || role === 'admin';
      }
      if (norm === 'product manager' || norm === 'product') {
        return dept === 'product manager' || dept === 'product' || role === 'product manager';
      }
      if (norm === 'dev' || norm === 'developer') {
        return dept === 'dev' || dept === 'engineering' || role === 'developer' || role === 'dev' || role === 'member';
      }
      if (norm === 'qa') {
        return dept === 'qa' || dept === 'qa / test' || role === 'qa' || role === 'tester';
      }
      if (norm === 'ba' || norm === 'business analyst') {
        return dept === 'ba' || dept === 'design' || role === 'ba' || role === 'business analyst';
      }
      return dept.includes(norm) || role.includes(norm);
    });
  },

  /**
   * Populates form dropdown selectors with role-filtered entries
   */
  populateFormSelects(activeProj) {
    let registeredCusts = Storage.getCustomers();
    if (!registeredCusts || registeredCusts.length === 0) {
      registeredCusts = this.app?.customersList || [];
    }
    const customerNamesFromList = registeredCusts.map(c => c.name).filter(Boolean);
    const customerNamesFromProjects = (this.projects || []).map(p => p.client).filter(Boolean);
    const clients = [...new Set([...customerNamesFromList, ...customerNamesFromProjects])].sort();

    const clientSelect = document.getElementById('edit-client');
    if (clientSelect) {
      clientSelect.innerHTML = '';
      clients.forEach(c => {
        clientSelect.innerHTML += `<option value="${c}">${c}</option>`;
      });
      if (activeProj && activeProj.client) {
        clientSelect.value = activeProj.client;
      }
    }

    const pmSelect = document.getElementById('edit-manager');
    const prodMSelect = document.getElementById('edit-product-manager');
    const baSelect = document.getElementById('edit-ba');
    const devSelect = document.getElementById('edit-developer');
    const qaSelect = document.getElementById('edit-qa');
    
    // Extract role-filtered staffing resources
    const pmMembers = this.getTeamMembersByRole('Project Manager');
    const prodMembers = this.getTeamMembersByRole('Product Manager');
    const devMembers = this.getTeamMembersByRole('Dev');
    const baMembers = this.getTeamMembersByRole('BA');
    const qaMembers = this.getTeamMembersByRole('QA');
    const allMembers = this.getTeamMembersList();
    
    if (pmSelect) {
      pmSelect.innerHTML = `<option value="">Select Project Manager...</option>`;
      pmMembers.forEach(m => {
        pmSelect.innerHTML += `<option value="${m.name}">${m.name} (${m.role})</option>`;
      });
      if (activeProj?.manager && !pmMembers.some(m => m.name === activeProj.manager)) {
        pmSelect.innerHTML += `<option value="${activeProj.manager}">${activeProj.manager}</option>`;
      }
      if (activeProj?.manager) pmSelect.value = activeProj.manager;
    }

    if (prodMSelect) {
      prodMSelect.innerHTML = `<option value="">Select Product Manager...</option>`;
      prodMembers.forEach(m => {
        prodMSelect.innerHTML += `<option value="${m.name}">${m.name} (${m.role})</option>`;
      });
      if (activeProj?.productManager && !prodMembers.some(m => m.name === activeProj.productManager)) {
        prodMSelect.innerHTML += `<option value="${activeProj.productManager}">${activeProj.productManager}</option>`;
      }
      if (activeProj?.productManager) prodMSelect.value = activeProj.productManager;
    }

    if (baSelect) {
      baSelect.innerHTML = `<option value="">Select BA...</option>`;
      baMembers.forEach(m => {
        baSelect.innerHTML += `<option value="${m.name}">${m.name} (${m.role})</option>`;
      });
      if (activeProj?.ba && !baMembers.some(m => m.name === activeProj.ba)) {
        baSelect.innerHTML += `<option value="${activeProj.ba}">${activeProj.ba}</option>`;
      }
      if (activeProj?.ba) baSelect.value = activeProj.ba;
    }

    if (devSelect) {
      devSelect.innerHTML = `<option value="">Select Developer...</option>`;
      devMembers.forEach(m => {
        devSelect.innerHTML += `<option value="${m.name}">${m.name} (${m.role})</option>`;
      });
      if (activeProj?.developer && !devMembers.some(m => m.name === activeProj.developer)) {
        devSelect.innerHTML += `<option value="${activeProj.developer}">${activeProj.developer}</option>`;
      }
      if (activeProj?.developer) devSelect.value = activeProj.developer;
    }

    if (qaSelect) {
      qaSelect.innerHTML = `<option value="">Select QA...</option>`;
      qaMembers.forEach(m => {
        qaSelect.innerHTML += `<option value="${m.name}">${m.name} (${m.role})</option>`;
      });
      if (activeProj?.qa && !qaMembers.some(m => m.name === activeProj.qa)) {
        qaSelect.innerHTML += `<option value="${activeProj.qa}">${activeProj.qa}</option>`;
      }
      if (activeProj?.qa) qaSelect.value = activeProj.qa;
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
    const id = document.getElementById('edit-id')?.value || '';
    const sow = document.getElementById('edit-sow')?.value || '';
    const hd = document.getElementById('edit-hd')?.value || '';
    const name = document.getElementById('edit-name')?.value || '';
    const client = document.getElementById('edit-client')?.value || '';
    const budget = document.getElementById('edit-budget')?.value || '0';
    const remarks = document.getElementById('edit-remarks')?.value || '';
    const estStart = document.getElementById('edit-est-start')?.value || '';
    const estEnd = document.getElementById('edit-est-end')?.value || '';
    const actStart = document.getElementById('edit-act-start')?.value || '';
    const actEnd = document.getElementById('edit-act-end')?.value || '';
    const pm = document.getElementById('edit-manager')?.value || '';
    const productManager = document.getElementById('edit-product-manager')?.value || '';
    const ba = document.getElementById('edit-ba')?.value || '';
    const dev = document.getElementById('edit-developer')?.value || '';
    const qa = document.getElementById('edit-qa')?.value || '';
    const confluenceLink = document.getElementById('edit-confluence')?.value || '';
    const sprintEl = document.getElementById('edit-sprint');
    const sprint = sprintEl ? sprintEl.value : '';
    const risk = document.getElementById('edit-risk')?.value || 'Low';
    const status = document.getElementById('edit-status')?.value || 'planning';
    const progress = document.getElementById('edit-progress')?.value || '0';

    const jiraInputs = document.querySelectorAll('#edit-jira-links-container .jira-link-input');
    const jiraLinks = Array.from(jiraInputs).map(inp => inp.value.trim()).filter(Boolean);

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

    // Validate budget non-negative
    const budgetInput = document.getElementById('edit-budget');
    if (budget === '' || isNaN(Number(budget)) || Number(budget) < 0) {
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
      
      if (sow) {
        proj.sow = sow;
        proj.id = sow; // Ensure Project # is updated to SOW#
        document.getElementById('detail-proj-id').textContent = sow;
      }
      proj.hd = hd;
      proj.productManager = productManager;
      proj.confluenceLink = confluenceLink;
      proj.jiraLinks = jiraLinks;
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
    let registeredCusts = Storage.getCustomers();
    if (!registeredCusts || registeredCusts.length === 0) {
      registeredCusts = this.app?.customersList || [];
    }
    const customerNamesFromList = registeredCusts.map(c => c.name).filter(Boolean);
    const customerNamesFromProjects = (this.projects || []).map(p => p.client).filter(Boolean);
    const clients = [...new Set([...customerNamesFromList, ...customerNamesFromProjects])].sort();

    const allMembers = this.getTeamMembersList();
    
    const clientOptions = clients.length > 0 
      ? clients.map(c => `<option value="${c}">${c}</option>`).join('')
      : `<option value="Enterprise Corp.">Enterprise Corp.</option>`;
    const pmOptions = allMembers.map(m => `<option value="${m.name}">${m.name} (${m.role})</option>`).join('');
    const devOptions = allMembers.map(m => `<option value="${m.name}">${m.name} (${m.role})</option>`).join('');
    const baOptions = allMembers.map(m => `<option value="${m.name}">${m.name} (${m.role})</option>`).join('');
    const qaOptions = allMembers.map(m => `<option value="${m.name}">${m.name} (${m.role})</option>`).join('');

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
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">Lead Developer</label>
          <select class="form-select select-enterprise w-100" id="mod-dev">
            <option value="">Select Developer...</option>
            ${devOptions}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">Business Analyst (BA)</label>
          <select class="form-select select-enterprise w-100" id="mod-ba">
            <option value="">Select BA...</option>
            ${baOptions}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">QA Analyst</label>
          <select class="form-select select-enterprise w-100" id="mod-qa">
            <option value="">Select QA...</option>
            ${qaOptions}
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
            <option value="awaiting-sow-sign-off">Awaiting SOW sign off</option>
            <option value="on-hold">On Hold</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold" style="font-size: 0.85rem;">Associated Product (V2 Optional)</label>
          <select class="form-select select-enterprise w-100" id="mod-product">
            <option value="">No Product (Standalone)</option>
          </select>
        </div>
      </form>
    `;

    this.app.openModal('Initiate New Enterprise Project', bodyHtml, (overlay) => {
      const name = overlay.querySelector('#mod-name')?.value || '';
      const client = overlay.querySelector('#mod-client')?.value || '';
      const pm = overlay.querySelector('#mod-pm')?.value || '';
      const dev = overlay.querySelector('#mod-dev')?.value || '';
      const ba = overlay.querySelector('#mod-ba')?.value || '';
      const qa = overlay.querySelector('#mod-qa')?.value || '';
      const poc = overlay.querySelector('#mod-poc')?.value || '';
      const budget = overlay.querySelector('#mod-budget')?.value || '0';
      const status = overlay.querySelector('#mod-status')?.value || 'planning';
      const prodEl = overlay.querySelector('#mod-product');
      const prodId = prodEl?.value || '';
      const prodName = prodEl?.selectedOptions?.[0]?.getAttribute('data-name') || '';

      let isModalValid = true;
      const nameEl = overlay.querySelector('#mod-name');
      if (!name || name.trim() === '') {
        if (nameEl) nameEl.classList.add('is-invalid');
        isModalValid = false;
      } else {
        if (nameEl) nameEl.classList.remove('is-invalid');
      }

      const budgetEl = overlay.querySelector('#mod-budget');
      if (!budget || Number(budget) <= 0) {
        if (budgetEl) budgetEl.classList.add('is-invalid');
        isModalValid = false;
      } else {
        if (budgetEl) budgetEl.classList.remove('is-invalid');
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
        risk: 'Low',
        developer: dev || 'Bob Johnson',
        qa: qa || 'David Miller',
        ba: ba || 'Sarah Connor',
        estimatedStart: new Date().toISOString().split('T')[0],
        estimatedEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        actualStart: '',
        actualEnd: '',
        remarks: '',
        month: new Date().toLocaleString('default', { month: 'long' }),
        quarter: 'Q3',
        year: '2026',
        productId: prodId || undefined,
        productName: prodName || undefined,
      };

      this.projects.unshift(newProj);
      this.saveProjects();
      dataService.saveSingleProject(newProj);
      this.populateFilterDropdowns();
      this.app.showToast(`New Project ${newCode} initiated successfully`, 'success');
      this.currentPage = 1;
      this.render();
      return true; // close modal
    });

    // Dynamically load products into dropdown
    ProductService.getProducts().then(prods => {
      const prodSelect = document.getElementById('mod-product');
      if (prodSelect && Array.isArray(prods) && prods.length > 0) {
        prodSelect.innerHTML = '<option value="">No Product (Standalone)</option>' +
          prods.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name} (${p.code})</option>`).join('');
      }
    }).catch(() => {});
  }
};
