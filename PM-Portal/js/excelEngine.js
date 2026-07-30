/* excelEngine.js - Workspace controller for the SheetJS Excel Engine */

import { Excel } from './excel.js';
import { DashboardModule } from './dashboard.js';

export const ExcelEngineModule = {
  app: null,
  currentData: [],

  /**
   * Initializes the Excel workspace, registers events, and loads existing localStorage data
   */
  init(app) {
    this.app = app;
    this.loadFromStorage();
    this.setupListeners();
    this.renderDatabase();
  },

  /**
   * Loads imported Excel data from LocalStorage
   */
  loadFromStorage() {
    try {
      const raw = localStorage.getItem('excel_imported_data');
      if (raw) {
        this.currentData = JSON.parse(raw);
      } else {
        this.currentData = [];
      }
    } catch (e) {
      console.error("Failed to load spreadsheet registry:", e);
      this.currentData = [];
    }
  },

  /**
   * Saves active dataset to LocalStorage and triggers dashboard metrics rebuilds
   */
  saveAndRefresh() {
    try {
      localStorage.setItem('excel_imported_data', JSON.stringify(this.currentData));
      
      // Update statistics overview cards
      this.updateOverviewStats();
      
      // Force dashboard page to recalculate if instantiated
      DashboardModule.renderMetrics();
      DashboardModule.renderAllCharts();
    } catch (e) {
      console.error("Storage sync failed:", e);
    }
  },

  /**
   * Registers DOM event listeners for the Excel workspace
   */
  setupListeners() {
    // 1. Click on Dragzone triggers hidden file input
    const dropArea = document.getElementById('excel-drop-area');
    const fileInput = document.getElementById('excel-file-input');
    
    if (dropArea && fileInput) {
      dropArea.addEventListener('click', () => fileInput.click());

      // Drag and drop hover toggles
      ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropArea.classList.add('dragover');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropArea.classList.remove('dragover');
        }, false);
      });

      // Handle drop upload
      dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
          this.handleFileImport(files[0]);
        }
      });

      // Handle file click picker upload
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleFileImport(e.target.files[0]);
          e.target.value = ''; // Reset to allow same-file updates
        }
      });
    }

    // 2. Download Template
    const btnTemplate = document.getElementById('excel-btn-template');
    if (btnTemplate) {
      btnTemplate.addEventListener('click', () => {
        const ok = Excel.downloadTemplate();
        if (ok) {
          this.app.showToast('Downloaded blank project-template.xlsx', 'success');
        } else {
          this.app.showToast('Failed to download template', 'danger');
        }
      });
    }

    // 3. Download / Load Sample Data
    const btnSample = document.getElementById('excel-btn-sample');
    if (btnSample) {
      btnSample.addEventListener('click', () => {
        // Option 1: Trigger template workbook download
        Excel.downloadSampleData();
        
        // Option 2: Pre-populate registry directly in UI for instant fidelity!
        this.currentData = Excel.getSampleRows();
        this.saveAndRefresh();
        this.renderDatabase();
        this.app.showToast('Pre-loaded enterprise portfolio mockups in registry and triggered download', 'success');
      });
    }

    // 4. Export Current Registry to Excel
    const btnExport = document.getElementById('excel-btn-export');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        if (this.currentData.length === 0) {
          this.app.showToast('No records inside database to export.', 'warning');
          return;
        }
        const ok = Excel.exportToExcel(this.currentData, 'Executive_Portfolio_Report');
        if (ok) {
          this.app.showToast('Exported registry database to Excel workbook successfully', 'success');
        } else {
          this.app.showToast('Excel export failed', 'danger');
        }
      });
    }

    // 5. Create Row manually via custom modal form
    const btnCreate = document.getElementById('excel-btn-create');
    if (btnCreate) {
      btnCreate.addEventListener('click', () => this.openCreateRowModal());
    }

    // 6. Clear All Data
    const btnClear = document.getElementById('excel-btn-clear');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (this.currentData.length === 0) {
          this.app.showToast('Database is already clean.', 'info');
          return;
        }
        
        if (confirm("Are you sure you want to permanently clear all Excel spreadsheet registry rows? This action cannot be undone.")) {
          this.currentData = [];
          this.saveAndRefresh();
          this.renderDatabase();
          this.app.showToast('Spreadsheet registry database deleted successfully.', 'warning');
        }
      });
    }

    // 7. Search Filter in table
    const searchInput = document.getElementById('excel-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.renderDatabase();
      });
    }
  },

  /**
   * Reads, parses, and loads the uploaded Excel sheet using the SheetJS library
   */
  handleFileImport(file) {
    this.app.showToast(`Loading spreadsheet ${file.name}...`, 'info');
    
    Excel.parseExcelFile(file, (rows, err) => {
      if (err) {
        this.app.showToast(err, 'danger');
        return;
      }
      
      if (rows && rows.length > 0) {
        // Enjoin spreadsheet rows into current data registry
        this.currentData = [...rows, ...this.currentData];
        this.saveAndRefresh();
        this.renderDatabase();
        this.app.showToast(`Imported ${rows.length} rows successfully from Excel workbook! Dashboard updated.`, 'success');
      } else {
        this.app.showToast('Failed to parse rows from spreadsheet. Check column configurations.', 'danger');
      }
    });
  },

  /**
   * Refreshes the overview summary counters for the Excel engine page
   */
  updateOverviewStats() {
    const elRows = document.getElementById('excel-stat-rows');
    const elCustomers = document.getElementById('excel-stat-customers');
    const elLogged = document.getElementById('excel-stat-logged');
    const elRisks = document.getElementById('excel-stat-risks');

    if (!elRows) return; // not rendered yet

    elRows.textContent = this.currentData.length.toString();

    // Customers
    const custSet = new Set(this.currentData.map(r => (r['Customer'] || '').trim()).filter(Boolean));
    elCustomers.textContent = custSet.size.toString();

    // Sum Logged
    let sumLogged = 0;
    let criticalHighRisks = 0;
    this.currentData.forEach(row => {
      const baAct = parseFloat(row['BA Actual']) || 0;
      const devAct = parseFloat(row['DEV Actual']) || 0;
      const qaAct = parseFloat(row['QA Actual']) || 0;
      sumLogged += (baAct + devAct + qaAct);

      const rsk = (row['Risk'] || '').trim().toLowerCase();
      if (rsk.includes('critical') || rsk.includes('high')) {
        criticalHighRisks++;
      }
    });

    elLogged.textContent = sumLogged.toLocaleString() + 'h';
    elRisks.textContent = criticalHighRisks.toString();
  },

  /**
   * Renders the dynamic Excel sheet grid with horizontal scrolling and badged attributes
   */
  renderDatabase() {
    const tableHeaders = document.getElementById('excel-table-headers');
    const tableBody = document.getElementById('excel-table-body');
    const searchInput = document.getElementById('excel-search-input');
    
    if (!tableHeaders || !tableBody) return;

    this.updateOverviewStats();

    // 1. Draw Headers (The 40 columns + an action columns)
    tableHeaders.innerHTML = '';
    Excel.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      tableHeaders.appendChild(th);
    });
    const thAction = document.createElement('th');
    thAction.textContent = "Action";
    thAction.style.textAlign = "center";
    thAction.style.width = "80px";
    tableHeaders.appendChild(thAction);

    // 2. Filter data
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let rowsToRender = this.currentData;
    if (query) {
      rowsToRender = this.currentData.filter(row => {
        return Object.values(row).some(val => String(val).toLowerCase().includes(query));
      });
    }

    // 3. Render body
    tableBody.innerHTML = '';
    if (rowsToRender.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="41" class="text-center py-5 text-muted">
            <i class="fa-solid fa-magnifying-glass mb-2 d-block" style="font-size: 2rem; opacity: 0.3;"></i>
            No spreadsheet entries found matching your query.
          </td>
        </tr>
      `;
      return;
    }

    rowsToRender.forEach((row, rawIdx) => {
      const tr = document.createElement('tr');
      
      Excel.columns.forEach(col => {
        const td = document.createElement('td');
        const cellValue = row[col] !== undefined ? String(row[col]) : '';
        
        // Render stylized indicator badges for certain key columns
        if (col === 'Status') {
          const lower = cellValue.toLowerCase();
          let badgeClass = 'bg-secondary';
          if (lower.includes('progress') || lower === 'active') badgeClass = 'bg-primary';
          else if (lower.includes('completed') || lower === 'complete') badgeClass = 'bg-success';
          else if (lower.includes('delay') || lower === 'delayed') badgeClass = 'bg-warning text-dark';
          else if (lower.includes('critical') || lower.includes('hold')) badgeClass = 'bg-danger';
          
          td.innerHTML = `<span class="badge ${badgeClass} text-uppercase px-2" style="font-size: 0.7rem;">${cellValue || 'N/A'}</span>`;
        } 
        else if (col === 'SOW') {
          const lower = cellValue.toLowerCase();
          let badgeClass = 'border border-secondary text-secondary';
          if (lower.includes('approved') || lower === 'signed') badgeClass = 'badge bg-success-subtle text-success border border-success';
          else if (lower.includes('pending')) badgeClass = 'badge bg-warning-subtle text-warning border border-warning';
          else if (lower.includes('draft')) badgeClass = 'badge bg-info-subtle text-info border border-info';
          
          td.innerHTML = `<span class="${badgeClass} px-2" style="font-size: 0.7rem;">${cellValue || 'Draft'}</span>`;
        }
        else if (col === 'Risk') {
          const lower = cellValue.toLowerCase();
          let color = 'inherit';
          let weight = 'normal';
          if (lower.includes('critical')) { color = 'var(--brand-danger)'; weight = '700'; }
          else if (lower.includes('high')) { color = 'var(--brand-warning)'; weight = '600'; }
          else if (lower.includes('medium')) { color = 'var(--brand-info)'; }
          else if (lower.includes('low')) { color = 'var(--brand-success)'; }
          
          td.innerHTML = `<span style="color: ${color}; font-weight: ${weight};">${cellValue || 'None'}</span>`;
        }
        else if (col === 'Completion %') {
          const progressNum = parseFloat(cellValue) || 0;
          let fillCol = 'var(--brand-primary)';
          if (progressNum === 100) fillCol = 'var(--brand-success)';
          else if (progressNum < 30) fillCol = 'var(--brand-danger)';
          
          td.innerHTML = `
            <div class="d-flex align-items-center gap-2" style="min-width: 100px;">
              <span class="table-progress-bar" style="height: 6px; flex-grow: 1;">
                <span class="table-progress-fill" style="width: ${progressNum}%; background-color: ${fillCol}"></span>
              </span>
              <span class="font-semibold" style="font-size: 0.725rem;">${progressNum}%</span>
            </div>
          `;
        }
        else {
          // Standard text cell formatting
          td.textContent = cellValue;
        }

        tr.appendChild(td);
      });

      // Actions Column
      const tdAction = document.createElement('td');
      tdAction.style.textAlign = "center";
      tdAction.innerHTML = `
        <button class="btn btn-outline-danger btn-xs py-0 px-2" style="font-size: 0.75rem;" title="Delete row">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
      
      const delBtn = tdAction.querySelector('button');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteRow(rawIdx);
      });

      tr.appendChild(tdAction);
      tableBody.appendChild(tr);
    });
  },

  /**
   * Delete a row from current registry database
   */
  deleteRow(idx) {
    if (confirm("Delete this spreadsheet row from active registry database?")) {
      this.currentData.splice(idx, 1);
      this.saveAndRefresh();
      this.renderDatabase();
      this.app.showToast('Spreadsheet row deleted.', 'warning');
    }
  },

  /**
   * Opens an interactive multi-column wizard form to create custom spreadsheet records
   */
  openCreateRowModal() {
    const registeredCusts = (Storage.getCustomers() || []).map(c => c.name).filter(Boolean);
    const existingCusts = (this.currentData || []).map(r => r['Customer']).filter(Boolean);
    const allCustNames = [...new Set([...registeredCusts, ...existingCusts])].sort();
    const custOptions = allCustNames.map(c => `<option value="${c}">`).join('');

    const bodyHtml = `
      <form id="create-excel-row-form" class="row g-3" style="max-height: 480px; overflow-y: auto; padding: 4px;">
        <h6 class="text-primary font-semibold border-bottom pb-1 mb-2 col-12">Portfolio Identity & Coordinates</h6>
        <div class="col-md-6">
          <label class="form-label font-semibold">Customer / Client</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-customer" list="xr-customer-datalist" placeholder="E.g. AeroSpace Inc." required />
          <datalist id="xr-customer-datalist">
            ${custOptions}
          </datalist>
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold">Project Title</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-project" placeholder="E.g. Project Ares" required />
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold">Module Name</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-module" placeholder="E.g. Security Integration" />
        </div>
        <div class="col-md-6">
          <label class="form-label font-semibold">Feature</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-feature" placeholder="E.g. OAuth Multi-factor Auth" />
        </div>
        <div class="col-md-4">
          <label class="form-label font-semibold">HD#</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-hd" placeholder="E.g. HD-8201" />
        </div>
        <div class="col-md-4">
          <label class="form-label font-semibold">JIRA#</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-jira" placeholder="E.g. ARES-392" />
        </div>
        <div class="col-md-4">
          <label class="form-label font-semibold">Sprint / Release</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-sprint" placeholder="Sprint 42" />
        </div>

        <h6 class="text-primary font-semibold border-bottom pb-1 mb-2 mt-4 col-12">Staffing & Project Office</h6>
        <div class="col-md-3">
          <label class="form-label font-semibold">Project Manager</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-pm" placeholder="PM Name" />
        </div>
        <div class="col-md-3">
          <label class="form-label font-semibold">Business Analyst</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-ba" placeholder="BA Name" />
        </div>
        <div class="col-md-3">
          <label class="form-label font-semibold">Lead Developer</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-developer" placeholder="Dev Name" />
        </div>
        <div class="col-md-3">
          <label class="form-label font-semibold">QA Lead</label>
          <input type="text" class="form-control select-enterprise w-100" id="xr-qa" placeholder="QA Name" />
        </div>

        <h6 class="text-primary font-semibold border-bottom pb-1 mb-2 mt-4 col-12">Timeline Plan & Operational Status</h6>
        <div class="col-md-3">
          <label class="form-label font-semibold">Estimated Start</label>
          <input type="date" class="form-control select-enterprise w-100" id="xr-est-start" />
        </div>
        <div class="col-md-3">
          <label class="form-label font-semibold">Estimated End</label>
          <input type="date" class="form-control select-enterprise w-100" id="xr-est-end" />
        </div>
        <div class="col-md-3">
          <label class="form-label font-semibold">Operational Status</label>
          <select class="form-select select-enterprise w-100" id="xr-status">
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Planning">Planning</option>
            <option value="On Hold">On Hold</option>
            <option value="Delayed">Delayed</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label font-semibold">Completion %</label>
          <input type="number" class="form-control select-enterprise w-100" id="xr-completion" value="0" min="0" max="100" />
        </div>

        <h6 class="text-primary font-semibold border-bottom pb-1 mb-2 mt-4 col-12">Effort Hours Allocation Matrices</h6>
        <div class="col-md-4">
          <label class="form-label font-semibold">DEV Estimated Hrs</label>
          <input type="number" class="form-control select-enterprise w-100" id="xr-dev-est" value="80" />
        </div>
        <div class="col-md-4">
          <label class="form-label font-semibold">DEV Actual Hrs</label>
          <input type="number" class="form-control select-enterprise w-100" id="xr-dev-act" value="0" />
        </div>
        <div class="col-md-4">
          <label class="form-label font-semibold">DEV Remaining Hrs</label>
          <input type="number" class="form-control select-enterprise w-100" id="xr-dev-rem" value="80" />
        </div>

        <h6 class="text-primary font-semibold border-bottom pb-1 mb-2 mt-4 col-12">Governance, Risks & SOW parameters</h6>
        <div class="col-md-4">
          <label class="form-label font-semibold">SOW Status</label>
          <select class="form-select select-enterprise w-100" id="xr-sow">
            <option value="Approved">Approved</option>
            <option value="Pending Client Sign-off">Pending Client Sign-off</option>
            <option value="Under Draft">Under Draft</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-semibold">Risk Exposure</label>
          <select class="form-select select-enterprise w-100" id="xr-risk">
            <option value="Low">Low Exposure</option>
            <option value="Medium">Medium Exposure</option>
            <option value="High">High Exposure</option>
            <option value="Critical">Critical Exposure</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label font-semibold">Weekend Standby?</label>
          <select class="form-select select-enterprise w-100" id="xr-weekend">
            <option value="No">No Standby</option>
            <option value="Yes">Active Weekend Standby</option>
          </select>
        </div>
        <div class="col-12">
          <label class="form-label font-semibold">Project Remarks / Mitigation Plan</label>
          <textarea class="form-control select-enterprise w-100" id="xr-remarks" rows="2" placeholder="Audit remarks..."></textarea>
        </div>
      </form>
    `;

    this.app.openModal('Initiate Portfolio Spreadsheet Entry', bodyHtml, (overlay) => {
      const customer = overlay.querySelector('#xr-customer').value;
      const project = overlay.querySelector('#xr-project').value;
      
      if (!customer || !project) {
        this.app.showToast('Customer and Project titles are required!', 'warning');
        return false;
      }

      // Read values and map to the exact 40 columns
      const newRow = {};
      
      // Initialize everything to empty
      Excel.columns.forEach(col => newRow[col] = "");

      // Fill in entered values
      newRow["Customer"] = customer;
      newRow["Project"] = project;
      newRow["Module"] = overlay.querySelector('#xr-module')?.value || '';
      newRow["Feature"] = overlay.querySelector('#xr-feature')?.value || '';
      newRow["HD#"] = overlay.querySelector('#xr-hd')?.value || '';
      newRow["JIRA#"] = overlay.querySelector('#xr-jira')?.value || '';
      newRow["Sprint"] = overlay.querySelector('#xr-sprint')?.value || '';
      
      newRow["PM"] = overlay.querySelector('#xr-pm')?.value || '';
      newRow["BA"] = overlay.querySelector('#xr-ba')?.value || '';
      newRow["Developer"] = overlay.querySelector('#xr-developer')?.value || '';
      newRow["QA"] = overlay.querySelector('#xr-qa')?.value || '';
      
      newRow["Estimated Start"] = overlay.querySelector('#xr-est-start')?.value || '';
      newRow["Estimated End"] = overlay.querySelector('#xr-est-end')?.value || '';
      newRow["Status"] = overlay.querySelector('#xr-status')?.value || 'Active';
      newRow["Completion %"] = overlay.querySelector('#xr-completion')?.value || '0';
      
      // Developers hours allocation
      const devEst = parseFloat(overlay.querySelector('#xr-dev-est')?.value || '0') || 0;
      const devAct = parseFloat(overlay.querySelector('#xr-dev-act')?.value || '0') || 0;
      const devRem = parseFloat(overlay.querySelector('#xr-dev-rem')?.value || '0') || 0;
      
      newRow["DEV Estimated"] = devEst;
      newRow["DEV Actual"] = devAct;
      newRow["DEV Remaining"] = devRem;
      
      // Equal allocation representation for BA & QA
      newRow["BA Estimated"] = Math.round(devEst * 0.25);
      newRow["BA Actual"] = Math.round(devAct * 0.25);
      newRow["BA Remaining"] = Math.round(devRem * 0.25);
      
      newRow["QA Estimated"] = Math.round(devEst * 0.5);
      newRow["QA Actual"] = Math.round(devAct * 0.5);
      newRow["QA Remaining"] = Math.round(devRem * 0.5);
      
      newRow["Total Estimated"] = newRow["DEV Estimated"] + newRow["BA Estimated"] + newRow["QA Estimated"];
      newRow["Total Actual"] = newRow["DEV Actual"] + newRow["BA Actual"] + newRow["QA Actual"];
      newRow["Total Remaining"] = newRow["DEV Remaining"] + newRow["BA Remaining"] + newRow["QA Remaining"];
      
      newRow["SOW"] = overlay.querySelector('#xr-sow')?.value || '';
      newRow["Risk"] = overlay.querySelector('#xr-risk')?.value || 'Low';
      newRow["Weekend"] = overlay.querySelector('#xr-weekend')?.value || 'No';
      newRow["Remarks"] = overlay.querySelector('#xr-remarks')?.value || '';
      newRow["Milestone"] = "Initiated";

      // Insert at the top of the data list
      this.currentData.unshift(newRow);
      this.saveAndRefresh();
      this.renderDatabase();
      
      this.app.showToast(`Successfully registered "${project}" entry in Excel workspace`, 'success');
      return true; // close modal
    });
  }
};
