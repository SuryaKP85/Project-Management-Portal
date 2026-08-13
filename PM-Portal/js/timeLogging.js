/* timeLogging.js - Modular Daily Time Logging with capacities, overruns, and dashboard sync */

import { Storage } from './storage.js';
import { Calculations } from './calculations.js';
import { Excel } from './excel.js';

export const TimeLoggingModule = {
  app: null,
  logs: [],
  estimates: {},
  searchQuery: '',

  // Standard departments list
  departments: ['Dev', 'QA', 'BA', 'Product Manager'],

  /**
   * Initialize Daily Time Logging Page Module
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;

    // Load data from Storage
    this.loadEstimates();
    this.loadLogs();

    // Register UI listeners
    this.setupEventListeners();

    // Populate drop-downs
    this.populateDropdowns();

    // Set default date in the form to current metadata date (2026-07-28)
    const dateInput = document.getElementById('tl-date');
    if (dateInput) {
      dateInput.value = '2026-07-28';
    }

    // Initial calculations & renders
    this.recalculateAndRender();
    this.updateEmployeeCapacity();
  },

  /**
   * Load project department estimates
   */
  loadEstimates() {
    let stored = Storage.get('project_dept_estimates');
    if (!stored || typeof stored !== 'object') {
      stored = {};
      Storage.set('project_dept_estimates', stored);
    }
    this.estimates = stored;
  },

  /**
   * Load time log list
   */
  loadLogs() {
    let stored = Storage.get('time_logs');
    if (!stored || !Array.isArray(stored)) {
      stored = [];
      Storage.set('time_logs', stored);
    }
    this.logs = stored;
  },

  /**
   * Populate dropdown options from dynamic active lists
   */
  populateDropdowns() {
    const empSelect = document.getElementById('tl-employee');
    const projSelect = document.getElementById('tl-project');

    if (empSelect) {
      empSelect.innerHTML = '<option value="">Select Employee...</option>';
      const resources = this.app.resourcesList || [];
      resources.forEach(r => {
        const option = document.createElement('option');
        option.value = r.name;
        option.textContent = `${r.name} (${r.role} - ${r.dept})`;
        empSelect.appendChild(option);
      });
    }

    if (projSelect) {
      projSelect.innerHTML = '<option value="">Select Project...</option>';
      const projects = this.app.projectsList || [];
      projects.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.id} - ${p.name}`;
        projSelect.appendChild(option);
      });
    }
  },

  /**
   * Setup UI events, input handlers and form submissions
   */
  setupEventListeners() {
    // Form submission
    const form = document.getElementById('time-log-form');
    if (form) {
      // Remove any existing clone listeners
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);
      
      newForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleFormSubmit();
      });
    }

    // Employee or Date change -> Updates standard capacity metric
    const empSelect = document.getElementById('tl-employee');
    const dateInput = document.getElementById('tl-date');
    const deptSelect = document.getElementById('tl-dept');

    if (empSelect) {
      empSelect.addEventListener('change', () => {
        this.updateEmployeeCapacity();

        // Auto-set department based on employee's department
        const empName = empSelect.value;
        const resList = Storage.get('resources') || this.app.resourcesList || [];
        const userList = Storage.get('portal_users') || [];
        const target = resList.find(r => r.name === empName) || userList.find(u => u.name === empName);
        if (target && target.dept && deptSelect) {
          deptSelect.value = target.dept;
        }
      });
    }
    if (dateInput) dateInput.addEventListener('change', () => this.updateEmployeeCapacity());

    // Listen for inline estimates change or inline member time logging
    const matrixBody = document.getElementById('tl-matrix-table-body');
    if (matrixBody) {
      matrixBody.addEventListener('change', (e) => {
        if (e.target && e.target.classList.contains('tl-est-input')) {
          const pId = e.target.getAttribute('data-project');
          const dept = e.target.getAttribute('data-dept');
          const value = parseFloat(e.target.value);

          if (pId && dept && !isNaN(value) && value >= 0) {
            if (!this.estimates[pId]) {
              this.estimates[pId] = {};
            }
            this.estimates[pId][dept] = value;
            Storage.set('project_dept_estimates', this.estimates);
            this.app.showToast(`Estimate updated inline for ${pId} (${dept})`, 'info');
            this.recalculateAndRender();
          } else {
            e.target.value = this.estimates[pId]?.[dept] || 0;
            this.app.showToast('Please enter a valid estimate hours value (>= 0)', 'warning');
          }
        }
      });

      matrixBody.addEventListener('click', (e) => {
        const memberLogBtn = e.target.closest('.tl-member-log-btn');
        if (memberLogBtn) {
          const pId = memberLogBtn.getAttribute('data-project');
          const dept = memberLogBtn.getAttribute('data-dept');
          const emp = memberLogBtn.getAttribute('data-employee');
          const inputEl = document.querySelector(`.tl-member-log-input[data-project="${pId}"][data-dept="${dept}"][data-employee="${emp}"]`);
          
          if (inputEl) {
            const hrs = parseFloat(inputEl.value);
            if (!isNaN(hrs) && hrs > 0) {
              const pObj = (this.app.projectsList || []).find(p => p.id === pId);
              const pName = pObj ? pObj.name : pId;
              const today = new Date().toISOString().split('T')[0];

              const newLog = {
                id: `TL-${Date.now().toString().slice(-6)}`,
                date: today,
                employee: emp,
                projectId: pId,
                projectName: pName,
                department: dept,
                task: `Daily effort logged directly under ${dept} department`,
                hours: hrs,
                remarks: 'Logged via team member matrix entry'
              };

              this.logs.unshift(newLog);
              Storage.set('time_logs', this.logs);
              this.app.showToast(`Logged ${hrs}h for ${emp} under ${pId} (${dept})`, 'success');
              inputEl.value = '';
              this.recalculateAndRender();
              this.updateEmployeeCapacity();
              this.syncWithDashboard();
            } else {
              this.app.showToast('Please enter valid hours (> 0)', 'warning');
            }
          }
        }
      });
    }

    // Registry table actions (e.g. Delete)
    const logsBody = document.getElementById('tl-logs-table-body');
    if (logsBody) {
      logsBody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.tl-delete-btn');
        if (deleteBtn) {
          const logId = deleteBtn.getAttribute('data-id');
          if (logId) {
            this.deleteLogEntry(logId);
          }
        }
      });
    }

    // Excel Template, Import & Export event handlers
    const templateBtn = document.getElementById('tl-btn-template');
    if (templateBtn) {
      templateBtn.addEventListener('click', () => this.downloadTemplate());
    }

    const exportBtn = document.getElementById('tl-btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportToExcel());
    }

    const importBtn = document.getElementById('tl-btn-import');
    const fileInput = document.getElementById('tl-file-input');
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.importFromExcel(e.target.files[0]);
          fileInput.value = '';
        }
      });
    }
  },

  /**
   * Download blank/sample Excel template for Daily Time Logging
   */
  downloadTemplate() {
    const headers = ['Work Date', 'Employee Name', 'Project ID', 'HD#', 'JIRA#', 'Department', 'Task Description', 'Hours Worked', 'Remarks'];
    const sampleRow = ['2026-07-28', 'Alice Smith', 'PRJ001', 'HD-1024', 'ARES-101', 'Dev', 'Backend schema optimization and index updates', 8, 'Completed on schedule'];
    Excel.downloadCustomTemplate(headers, sampleRow, 'Daily_Time_Log_Template', 'daily_time_logging_template');
    this.app.showToast('Downloaded Daily Time Logging Excel Template', 'info');
  },

  /**
   * Export all logged time entries to Excel workbook
   */
  exportToExcel() {
    if (!this.logs || this.logs.length === 0) {
      this.app.showToast('No time log entries to export', 'warning');
      return;
    }

    const headers = ['Work Date', 'Employee Name', 'Project ID', 'HD#', 'JIRA#', 'Department', 'Task Description', 'Hours Worked', 'Remarks'];
    const keys = ['date', 'employee', 'projectId', 'hdNumber', 'jiraNumber', 'department', 'task', 'hours', 'remarks'];

    const success = Excel.exportCustomToExcel(headers, this.logs, keys, 'Daily_Time_Logs', 'daily_time_logs_export');
    if (success) {
      this.app.showToast(`Exported ${this.logs.length} time log records to Excel`, 'success');
    } else {
      this.app.showToast('Failed to export time logs', 'danger');
    }
  },

  /**
   * Import time logs from Excel file
   */
  importFromExcel(file) {
    Excel.parseCustomExcelFile(file, (rows, err) => {
      if (err || !rows) {
        this.app.showToast(`Import Error: ${err || 'Invalid file format'}`, 'danger');
        return;
      }

      let importedCount = 0;
      rows.forEach(r => {
        // Find property values flexibly
        const getVal = (possibleKeys) => {
          for (let k of possibleKeys) {
            const found = Object.keys(r).find(key => key.trim().toLowerCase() === k.trim().toLowerCase());
            if (found && r[found] !== undefined) return r[found];
          }
          return '';
        };

        const workDate = getVal(['Work Date', 'date', 'Date']) || new Date().toISOString().split('T')[0];
        const empName = getVal(['Employee Name', 'employee', 'Employee', 'Name']);
        const projId = getVal(['Project ID', 'Project', 'projectId', 'Project Code']);
        const hdNum = getVal(['HD#', 'hdNumber', 'HD Number', 'Helpdesk']);
        const jiraNum = getVal(['JIRA#', 'jiraNumber', 'JIRA', 'Jira']);
        const dept = getVal(['Department', 'department', 'Dept']) || 'Dev';
        const taskDesc = getVal(['Task Description', 'task', 'Task', 'Description']) || 'Imported Task';
        const hoursWorked = parseFloat(getVal(['Hours Worked', 'hours', 'Hours'])) || 0;
        const remarksStr = getVal(['Remarks', 'remarks', 'Comments']);

        if (empName && projId && hoursWorked > 0) {
          const proj = (this.app.projectsList || []).find(p => p.id === projId || p.name === projId);
          const actualProjId = proj ? proj.id : projId;
          const actualProjName = proj ? proj.name : projId;

          const newLog = {
            id: `TL-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
            date: workDate,
            employee: empName,
            projectId: actualProjId,
            projectName: actualProjName,
            hdNumber: hdNum,
            jiraNumber: jiraNum,
            department: dept,
            task: taskDesc,
            hours: hoursWorked,
            remarks: remarksStr
          };

          this.logs.unshift(newLog);
          importedCount++;
        }
      });

      if (importedCount > 0) {
        Storage.set('time_logs', this.logs);
        this.recalculateAndRender();
        this.updateEmployeeCapacity();
        this.syncWithDashboard();
        this.app.showToast(`Successfully imported ${importedCount} time log records!`, 'success');
      } else {
        this.app.showToast('No valid time log rows found in Excel file. Check column headers.', 'warning');
      }
    });
  },

  /**
   * Standard Employee Capacity calculator
   * Deducts hours logged on selected date from 8h standard
   */
  updateEmployeeCapacity() {
    const empSelect = document.getElementById('tl-employee');
    const dateInput = document.getElementById('tl-date');
    const capacityText = document.getElementById('tl-emp-capacity');

    if (!empSelect || !dateInput || !capacityText) return;

    const employee = empSelect.value;
    const date = dateInput.value;

    if (!employee || !date) {
      capacityText.textContent = 'Remaining Capacity: 8h';
      capacityText.className = 'text-xs text-primary font-semibold';
      return;
    }

    // Filter logs for this employee on this date
    const loggedToday = this.logs
      .filter(l => l.employee === employee && l.date === date)
      .reduce((sum, l) => sum + l.hours, 0);

    const remaining = Math.max(0, 8 - loggedToday);
    capacityText.textContent = `Remaining Capacity: ${remaining}h`;

    if (remaining === 0) {
      capacityText.className = 'text-xs text-danger-custom font-semibold';
      capacityText.style.color = 'var(--brand-danger)';
    } else if (remaining < 3) {
      capacityText.className = 'text-xs text-warning-custom font-semibold';
      capacityText.style.color = 'var(--brand-warning)';
    } else {
      capacityText.className = 'text-xs text-success-custom font-semibold';
      capacityText.style.color = 'var(--brand-success)';
    }
  },

  /**
   * Handle log submission form
   */
  handleFormSubmit() {
    const date = document.getElementById('tl-date')?.value || '';
    const employee = document.getElementById('tl-employee')?.value || '';
    const projectId = document.getElementById('tl-project')?.value || '';
    const department = document.getElementById('tl-dept')?.value || '';
    const task = document.getElementById('tl-task')?.value || '';
    const hours = parseFloat(document.getElementById('tl-hours')?.value || '0');
    const remarks = document.getElementById('tl-remarks')?.value || '';

    if (!date || !employee || !projectId || !department || !task || isNaN(hours) || hours <= 0) {
      this.app.showToast('Please fill out all required logging parameters', 'warning');
      return;
    }

    // Verify if adding this doesn't exceed standard daily capacity of 24 hrs
    const totalLoggedOnDate = this.logs
      .filter(l => l.employee === employee && l.date === date)
      .reduce((sum, l) => sum + l.hours, 0);

    if (totalLoggedOnDate + hours > 24) {
      this.app.showToast(`Cannot log ${hours}h. Total logged on ${date} would exceed 24 hours (Current: ${totalLoggedOnDate}h).`, 'danger');
      return;
    }

    // Check project capacity overrun warning
    const project = this.app.projectsList.find(p => p.id === projectId);
    const projectName = project ? project.name : 'Unknown Project';

    const logId = `TL-${Date.now()}`;
    const newEntry = {
      id: logId,
      date,
      employee,
      projectId,
      projectName,
      department,
      task,
      hours,
      remarks: remarks || '-'
    };

    this.logs.unshift(newEntry);
    Storage.set('time_logs', this.logs);

    // Dynamic warning alert toast if logs exceed estimate for that project department
    const currentEst = this.estimates[projectId]?.[department] || 0;
    const loggedBefore = this.logs
      .filter(l => l.projectId === projectId && l.department === department && l.id !== logId)
      .reduce((sum, l) => sum + l.hours, 0);

    if (loggedBefore + hours > currentEst && currentEst > 0) {
      this.app.showToast(`Allocation overrun! Logs for ${projectId} (${department}) exceed estimate of ${currentEst}h.`, 'warning');
    } else {
      this.app.showToast('Daily time log entry saved successfully', 'success');
    }

    // Clear inputs except Date and Employee (for rapid consecutive logs!)
    const taskEl = document.getElementById('tl-task');
    if (taskEl) taskEl.value = '';
    const hoursEl = document.getElementById('tl-hours');
    if (hoursEl) hoursEl.value = '';
    const remarksEl = document.getElementById('tl-remarks');
    if (remarksEl) remarksEl.value = '';

    // Recalculate and update the screen
    this.recalculateAndRender();
    this.updateEmployeeCapacity();

    // Trigger dashboard update
    this.syncWithDashboard();
  },

  /**
   * Delete an existing log entry
   */
  deleteLogEntry(logId) {
    const canDelete = !this.app.currentUser || this.app.currentUser.role === 'admin';
    if (!canDelete) {
      this.app.showToast('Delete permission restricted: Standard team members have entry-only access. Contact an Administrator to delete records.', 'danger');
      return;
    }

    this.logs = this.logs.filter(l => l.id !== logId);
    Storage.set('time_logs', this.logs);
    this.app.showToast('Time log entry deleted', 'info');

    this.recalculateAndRender();
    this.updateEmployeeCapacity();
    this.syncWithDashboard();
  },

  /**
   * Recalculates metrics and renders tables + KPI cards
   */
  recalculateAndRender() {
    this.renderKPICards();
    this.renderMatrixTable();
    this.renderLogsTable();
  },

  /**
   * Updates KPI Overview metric blocks
   */
  renderKPICards() {
    // Total Estimated sum
    let totalEst = 0;
    Object.values(this.estimates).forEach(projDepts => {
      Object.values(projDepts).forEach(val => {
        totalEst += val;
      });
    });

    // Total Logged sum
    const totalLogged = this.logs.reduce((sum, l) => sum + l.hours, 0);

    // Overrun sum per project-dept
    let totalOverrun = 0;
    const projects = this.app.projectsList || [];
    
    projects.forEach(p => {
      this.departments.forEach(dept => {
        const est = this.estimates[p.id]?.[dept] || 0;
        const logged = this.logs
          .filter(l => l.projectId === p.id && l.department === dept)
          .reduce((sum, l) => sum + l.hours, 0);

        if (logged > est && est > 0) {
          totalOverrun += (logged - est);
        }
      });
    });

    // Total Remaining: Capacity left in estimates (exclude overrun departments since they have 0 remaining capacity)
    let totalRemaining = 0;
    projects.forEach(p => {
      this.departments.forEach(dept => {
        const est = this.estimates[p.id]?.[dept] || 0;
        const logged = this.logs
          .filter(l => l.projectId === p.id && l.department === dept)
          .reduce((sum, l) => sum + l.hours, 0);

        if (est > logged) {
          totalRemaining += (est - logged);
        }
      });
    });

    // Set text on KPI values
    const estEl = document.getElementById('tl-kpi-estimated');
    const loggedEl = document.getElementById('tl-kpi-logged');
    const remEl = document.getElementById('tl-kpi-remaining');
    const overEl = document.getElementById('tl-kpi-overrun');

    if (estEl) estEl.textContent = `${totalEst.toLocaleString()}h`;
    if (loggedEl) loggedEl.textContent = `${totalLogged.toLocaleString()}h`;
    if (remEl) remEl.textContent = `${totalRemaining.toLocaleString()}h`;
    if (overEl) {
      overEl.textContent = `${totalOverrun.toLocaleString()}h`;
      
      const overCard = overEl.closest('.kpi-card');
      const overWrap = document.getElementById('tl-kpi-overrun-icon-wrap');
      const overSub = document.getElementById('tl-kpi-overrun-subtext');

      if (totalOverrun > 0) {
        overEl.style.color = 'var(--brand-danger)';
        if (overCard) overCard.style.borderColor = 'var(--brand-danger)';
        if (overWrap) {
          overWrap.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
          overWrap.style.color = 'var(--brand-danger)';
        }
        if (overSub) {
          overSub.textContent = 'CRITICAL LIMITS EXCEEDED!';
          overSub.style.color = 'var(--brand-danger)';
          overSub.style.fontWeight = '700';
        }
      } else {
        overEl.style.color = 'var(--text-primary)';
        if (overCard) overCard.style.borderColor = 'var(--border-color)';
        if (overWrap) {
          overWrap.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
          overWrap.style.color = 'var(--brand-warning)';
        }
        if (overSub) {
          overSub.textContent = 'Exceeded estimate limits';
          overSub.style.color = 'var(--text-muted)';
          overSub.style.fontWeight = 'normal';
        }
      }
    }
  },

  /**
   * Renders the project capacity matrix with collapse structure and inline inputs
   */
  renderMatrixTable() {
    const tableBody = document.getElementById('tl-matrix-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    const projects = this.app.projectsList || [];

    if (projects.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No enterprise projects defined.</td></tr>`;
      return;
    }

    projects.forEach(p => {
      // Calculate overall Project level sums
      let pEst = 0;
      let pLogged = 0;
      let pOverrun = 0;
      let pRemaining = 0;

      this.departments.forEach(dept => {
        const est = this.estimates[p.id]?.[dept] || 0;
        const logged = this.logs
          .filter(l => l.projectId === p.id && l.department === dept)
          .reduce((sum, l) => sum + l.hours, 0);

        pEst += est;
        pLogged += logged;

        if (logged > est) {
          pOverrun += (logged - est);
        } else {
          pRemaining += (est - logged);
        }
      });

      // Overall Project Completion % and Health
      const pCompletion = Calculations.percentage(pLogged, pEst);
      
      let pHealthClass = 'bg-success';
      let pHealthLabel = 'On Track';
      if (pOverrun > 0) {
        pHealthClass = 'bg-danger';
        pHealthLabel = 'Overrun';
      } else if (pCompletion >= 90) {
        pHealthClass = 'bg-warning';
        pHealthLabel = 'At Risk';
      }

      // 1. Render PROJECT level parent row
      const pRow = document.createElement('tr');
      pRow.className = 'font-semibold border-top-2';
      pRow.style.backgroundColor = 'var(--bg-main)';
      pRow.style.borderBottom = '1px solid var(--border-color)';
      
      // Determine if project has overruns -> Highlight cell red
      const pLoggedStyle = pOverrun > 0 ? 'color: var(--brand-danger); font-weight: 700;' : '';
      const pOverrunStyle = pOverrun > 0 ? 'color: var(--brand-danger); font-weight: 700;' : '';

      pRow.innerHTML = `
        <td style="padding: 12px 16px;">
          <span style="color: var(--brand-primary); font-weight: 700;">${p.id}</span> - ${p.name}
        </td>
        <td class="text-center">${pEst}h</td>
        <td class="text-center" style="${pLoggedStyle}">${pLogged}h</td>
        <td class="text-center text-secondary">${pRemaining}h</td>
        <td class="text-center" style="${pOverrunStyle}">${pOverrun > 0 ? `+${pOverrun}h` : '-'}</td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <span class="table-progress-bar" style="width: 70px; height: 8px;">
              <span class="table-progress-fill" style="width: ${pCompletion}%; background-color: ${pOverrun > 0 ? 'var(--brand-danger)' : 'var(--brand-primary)'}"></span>
            </span>
            <span class="table-progress-text" style="font-size: 0.75rem; font-weight: 700; ${pOverrun > 0 ? 'color: var(--brand-danger);' : ''}">${pCompletion}%</span>
          </div>
        </td>
        <td class="text-center">
          <span class="badge ${pHealthClass} rounded-pill px-2 py-1">${pHealthLabel}</span>
        </td>
      `;
      tableBody.appendChild(pRow);

      // 2. Render DEPARTMENT sub-rows
      this.departments.forEach(dept => {
        const est = this.estimates[p.id]?.[dept] || 0;
        const logged = this.logs
          .filter(l => l.projectId === p.id && l.department === dept)
          .reduce((sum, l) => sum + l.hours, 0);

        const dOverrun = logged > est ? (logged - est) : 0;
        const dRemaining = logged < est ? (est - logged) : 0;
        const dCompletion = Calculations.percentage(logged, est);

        let dHealthClass = 'badge bg-success-subtle text-success';
        let dHealthLabel = 'On Track';
        if (dOverrun > 0) {
          dHealthClass = 'badge bg-danger-subtle text-danger';
          dHealthLabel = 'Overrun';
        } else if (dCompletion >= 90) {
          dHealthClass = 'badge bg-warning-subtle text-warning';
          dHealthLabel = 'At Risk';
        }

        const dRow = document.createElement('tr');
        dRow.style.fontSize = '0.85rem';
        dRow.style.borderBottom = '1px solid var(--border-color)';
        
        // Highlight row background if overrun occurs
        const dRowBg = dOverrun > 0 ? 'background-color: rgba(239, 68, 68, 0.04);' : '';
        const dLoggedStyle = dOverrun > 0 ? 'color: var(--brand-danger); font-weight: 700;' : '';
        const dOverrunStyle = dOverrun > 0 ? 'color: var(--brand-danger); font-weight: 700;' : '';

        dRow.innerHTML = `
          <td style="padding: 8px 16px 8px 36px; color: var(--text-primary); font-weight: 700; ${dRowBg}">
            <i class="fa-solid fa-layer-group text-primary me-1.5" style="font-size: 0.8rem;"></i> ${dept} Department
          </td>
          <td class="text-center p-1" style="${dRowBg}">
            <input type="number" class="form-control form-control-sm border rounded text-center font-semibold tl-est-input" 
              style="width: 80px; margin: 0 auto; padding: 2px 4px; font-size: 0.8rem; background-color: var(--bg-card); color: var(--text-primary); border-color: var(--border-color);" 
              value="${est}" data-project="${p.id}" data-dept="${dept}" min="0" step="5" />
          </td>
          <td class="text-center font-bold" style="${dLoggedStyle} ${dRowBg}">${logged}h</td>
          <td class="text-center text-muted" style="${dRowBg}">${dRemaining}h</td>
          <td class="text-center" style="${dOverrunStyle} ${dRowBg}">${dOverrun > 0 ? `+${dOverrun}h` : '-'}</td>
          <td style="${dRowBg}">
            <div class="d-flex align-items-center gap-2">
              <span class="table-progress-bar" style="width: 70px; height: 6px;">
                <span class="table-progress-fill" style="width: ${dCompletion}%; background-color: ${dOverrun > 0 ? 'var(--brand-danger)' : 'var(--brand-info)'}"></span>
              </span>
              <span class="table-progress-text" style="font-size: 0.7rem; ${dOverrun > 0 ? 'color: var(--brand-danger); font-weight: 700;' : ''}">${dCompletion}%</span>
            </div>
          </td>
          <td class="text-center" style="${dRowBg}">
            <span class="${dHealthClass} rounded px-1.5 py-0.5" style="font-size: 0.75rem;">${dHealthLabel}</span>
          </td>
        `;
        tableBody.appendChild(dRow);

        // 3. Render TEAM MEMBERS under this Department
        const allResources = Storage.get('resources') || this.app.resourcesList || [];
        const allUsers = Storage.get('portal_users') || [];

        // Combine resources and users for complete member list
        const memberMap = new Map();
        allResources.forEach(r => {
          if (r.dept === dept || r.department === dept) {
            memberMap.set(r.name, { name: r.name, role: r.role || 'Team Specialist', dept });
          }
        });
        allUsers.forEach(u => {
          if (u.dept === dept) {
            if (!memberMap.has(u.name)) {
              memberMap.set(u.name, { name: u.name, role: u.role === 'admin' ? 'Lead' : 'Member', dept });
            }
          }
        });

        const members = Array.from(memberMap.values());

        if (members.length > 0) {
          members.forEach(m => {
            const mLogged = this.logs
              .filter(l => l.projectId === p.id && l.department === dept && l.employee === m.name)
              .reduce((sum, l) => sum + l.hours, 0);

            const mRow = document.createElement('tr');
            mRow.style.fontSize = '0.8rem';
            mRow.style.borderBottom = '1px dashed var(--border-color)';
            mRow.style.backgroundColor = 'var(--bg-card)';

            mRow.innerHTML = `
              <td style="padding: 6px 16px 6px 60px;">
                <div class="d-flex align-items-center gap-1.5">
                  <i class="fa-solid fa-user text-secondary" style="font-size: 0.7rem;"></i>
                  <span class="font-semibold" style="color: var(--text-primary);">${m.name}</span>
                  <span class="text-muted text-xs">(${m.role})</span>
                </div>
              </td>
              <td class="text-center">
                <span class="text-muted text-xs">Member Entry</span>
              </td>
              <td class="text-center font-bold text-primary">${mLogged}h</td>
              <td class="text-center text-muted" colspan="2">
                <div class="d-flex justify-content-center align-items-center gap-1">
                  <input type="number" class="form-control form-control-sm text-center tl-member-log-input" 
                    placeholder="Hrs" style="width: 65px; height: 26px; font-size: 0.75rem;" 
                    min="0.5" max="12" step="0.5" data-project="${p.id}" data-dept="${dept}" data-employee="${m.name}" />
                  <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 tl-member-log-btn" 
                    style="height: 26px; font-size: 0.725rem;" data-project="${p.id}" data-dept="${dept}" data-employee="${m.name}">
                    + Log
                  </button>
                </div>
              </td>
              <td colspan="2" class="text-center">
                <span class="text-xs text-secondary">${mLogged > 0 ? `${mLogged}h logged on ${p.id}` : 'No effort logged yet'}</span>
              </td>
            `;
            tableBody.appendChild(mRow);
          });
        }
      });
    });
  },

  /**
   * Renders the recent logs registry list with filters and action buttons
   */
  renderLogsTable() {
    const tableBody = document.getElementById('tl-logs-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    // Apply search query filtering
    let filtered = this.logs;
    if (this.searchQuery) {
      filtered = this.logs.filter(l => 
        l.employee.toLowerCase().includes(this.searchQuery) ||
        l.task.toLowerCase().includes(this.searchQuery) ||
        l.projectId.toLowerCase().includes(this.searchQuery) ||
        l.remarks.toLowerCase().includes(this.searchQuery) ||
        l.department.toLowerCase().includes(this.searchQuery)
      );
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5 text-muted">
            <i class="fa-solid fa-folder-open mb-2 d-block" style="font-size: 2rem; opacity: 0.4;"></i>
            ${this.searchQuery ? 'No log entries match your search query.' : 'No logs recorded yet. Use the left form to add your first daily entry.'}
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(l => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';

      // Calculate overrun highlights
      const estLimit = this.estimates[l.projectId]?.[l.department] || 0;
      const totalLoggedForDept = this.logs
        .filter(entry => entry.projectId === l.projectId && entry.department === l.department)
        .reduce((sum, entry) => sum + entry.hours, 0);

      const isOverrun = totalLoggedForDept > estLimit && estLimit > 0;
      const hoursCellClass = isOverrun ? 'text-danger fw-bold' : '';

      tr.innerHTML = `
        <td style="padding: 10px 16px; font-size: 0.85rem; font-weight: 600;">${l.date}</td>
        <td style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${l.employee}</td>
        <td style="font-size: 0.85rem;"><span class="text-primary font-semibold">${l.projectId}</span> <span class="text-secondary-custom text-xs">(${l.projectName})</span></td>
        <td style="font-size: 0.85rem;"><span class="badge bg-light text-dark border px-2 py-0.5">${l.department}</span></td>
        <td style="font-size: 0.85rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${l.task}">${l.task}</td>
        <td class="text-center font-semibold ${hoursCellClass}" style="font-size: 0.85rem;">${l.hours}h</td>
        <td style="font-size: 0.85rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" class="text-muted" title="${l.remarks}">${l.remarks}</td>
        <td class="text-center">
          <button class="btn btn-sm text-danger p-0 tl-delete-btn" data-id="${l.id}" title="Delete Entry" style="background: none; border: none; cursor: pointer;">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  },

  /**
   * Seed dynamic sample dataset including an overrun case for demonstration
   */
  loadSampleData() {
    const sampleLogs = [
      { id: 'TL-S1', date: '2026-07-27', employee: 'Alice Smith', projectId: 'PRJ001', projectName: 'Project Ares Core Upgrade', department: 'Engineering', task: 'Designed logical replication & upgraded database clusters', hours: 8, remarks: 'Completed' },
      { id: 'TL-S2', date: '2026-07-27', employee: 'Bob Johnson', projectId: 'PRJ001', projectName: 'Project Ares Core Upgrade', department: 'Engineering', task: 'Created microservice routing rules and CORS interceptors', hours: 8, remarks: 'Finished routing' },
      { id: 'TL-S3', date: '2026-07-27', employee: 'Clara Oswald', projectId: 'PRJ001', projectName: 'Project Ares Core Upgrade', department: 'Design', task: 'High fidelity UI prototyping and wireframes', hours: 6, remarks: 'Client review pending' },
      { id: 'TL-S4', date: '2026-07-27', employee: 'David Miller', projectId: 'PRJ001', projectName: 'Project Ares Core Upgrade', department: 'QA / Test', task: 'Prepared Jest test harness suites', hours: 8, remarks: '12 test cases added' },
      
      // Let's create an overrun in PRJ003 Engineering (Estimate = 80h, let's log 90h total)
      { id: 'TL-S5', date: '2026-07-26', employee: 'Bob Johnson', projectId: 'PRJ003', projectName: 'Hermes Logistic Router API', department: 'Engineering', task: 'Migrated Router maps parsing scripts', hours: 45, remarks: 'Legacy code refactoring' },
      { id: 'TL-S6', date: '2026-07-27', employee: 'Alice Smith', projectId: 'PRJ003', projectName: 'Hermes Logistic Router API', department: 'Engineering', task: 'Optimized delivery clustering route paths', hours: 45, remarks: 'EXCEEDED ESTIMATE DUE TO RE-WORK' },
      
      // Other standard logs
      { id: 'TL-S7', date: '2026-07-28', employee: 'Elena Rostova', projectId: 'PRJ002', projectName: 'Zeus Security Shield Framework', department: 'Product', task: 'Facilitated sprint retrospective planning', hours: 6, remarks: 'On track' },
      { id: 'TL-S8', date: '2026-07-28', employee: 'Clara Oswald', projectId: 'PRJ002', projectName: 'Zeus Security Shield Framework', department: 'Design', task: 'Interactive client onboarding flow design', hours: 4, remarks: 'Iterating on feedback' }
    ];

    this.logs = sampleLogs;
    Storage.set('time_logs', this.logs);
    
    // Seed default estimates if reset
    this.loadEstimates();

    this.app.showToast('Rich sample logging database loaded. Overruns highlighted in Red!', 'success');
    this.recalculateAndRender();
    this.updateEmployeeCapacity();
    this.syncWithDashboard();
  },

  /**
   * Reset all elements to zero
   */
  resetData() {
    this.logs = [];
    Storage.set('time_logs', []);
    
    // Reload original default estimates
    Storage.remove('project_dept_estimates');
    this.loadEstimates();

    this.app.showToast('Time logging ledger database wiped successfully.', 'info');
    this.recalculateAndRender();
    this.updateEmployeeCapacity();
    this.syncWithDashboard();
  },

  /**
   * Push time tracking sums back to Executive Dashboard and update KPIs dynamically!
   */
  syncWithDashboard() {
    // Save to a special key that dashboard can read
    const totalLogged = this.logs.reduce((sum, l) => sum + l.hours, 0);
    Storage.set('time_logs_total_logged', totalLogged);

    // If dashboard is currently initialized, trigger its metric re-evaluation!
    try {
      const activeProjects = Storage.get('projects') || this.app.projectsList;
      
      // Update each project's progress or actual budget based on our daily logs
      const updatedProjects = activeProjects.map(p => {
        const pLogs = this.logs.filter(l => l.projectId === p.id);
        const pLoggedSum = pLogs.reduce((sum, l) => sum + l.hours, 0);
        
        // Sum estimates
        let pEst = 0;
        this.departments.forEach(dept => {
          pEst += (this.estimates[p.id]?.[dept] || 0);
        });

        if (pEst > 0) {
          const completion = Calculations.percentage(pLoggedSum, pEst);
          return {
            ...p,
            progress: completion // overwrite project completion % dynamically!
          };
        }
        return p;
      });

      // Save updated projects so they match!
      Storage.set('projects', updatedProjects);
      this.app.projectsList = updatedProjects;

      // Update executive dashboard metrics & charts in-memory if loaded
      const app = window.portalAppInstance || this.app;
      const dashboard = app.currentPageModule || (window.DashboardModule || null);
      
      // Let's force update the dashboard widgets
      const rawLoggedEl = document.getElementById('metric-logged-hours');
      if (rawLoggedEl) {
        rawLoggedEl.textContent = totalLogged.toLocaleString();
      }

      // Also let's update remaining hours KPI
      let totalRemaining = 0;
      const projects = this.app.projectsList || [];
      projects.forEach(p => {
        this.departments.forEach(dept => {
          const est = this.estimates[p.id]?.[dept] || 0;
          const logged = this.logs
            .filter(l => l.projectId === p.id && l.department === dept)
            .reduce((sum, l) => sum + l.hours, 0);

          if (est > logged) {
            totalRemaining += (est - logged);
          }
        });
      });

      const rawRemEl = document.getElementById('metric-remaining-hours');
      if (rawRemEl) {
        rawRemEl.textContent = totalRemaining.toLocaleString();
      }

      // Update avg project health on dashboard
      let totalCompletionSum = 0;
      projects.forEach(p => {
        let pEst = 0;
        let pLogged = 0;
        this.departments.forEach(dept => {
          pEst += (this.estimates[p.id]?.[dept] || 0);
          pLogged += this.logs.filter(l => l.projectId === p.id && l.department === dept).reduce((sum, l) => sum + l.hours, 0);
        });
        totalCompletionSum += (pEst > 0 ? Calculations.percentage(pLogged, pEst) : p.progress);
      });

      const avgHealth = projects.length > 0 ? Math.round(totalCompletionSum / projects.length) : 0;
      const rawHealthEl = document.getElementById('metric-avg-project-health');
      if (rawHealthEl) {
        rawHealthEl.textContent = `${avgHealth}%`;
      }

    } catch (e) {
      console.warn('Dashboard sync details skipped:', e);
    }
  }
};
