/* weekendPlanner.js - Modular Weekend Delivery Planner with automatic update simulations and live recommendations */

import { Storage } from './storage.js';
import { Calculations } from './calculations.js';
import { Filters } from './filters.js';
import { Excel } from './excel.js';

export const WeekendPlannerModule = {
  app: null,
  weekendLogs: [],
  resources: [],
  projects: [],
  searchQuery: '',

  /**
   * Initialize Weekend Delivery Planner Module
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;

    // Load data from Storage & Context
    this.loadData();

    // Register UI listeners
    this.setupEventListeners();

    // Populate dropdown selection lists
    this.populateDropdowns();

    // Set default weekend date in form to upcoming Saturday (2026-08-01)
    const dateInput = document.getElementById('m-weekend-date');
    if (dateInput) {
      dateInput.value = '2026-08-01';
    }

    // Run initial calculations & renders
    this.recalculateAndRender();
    this.triggerLiveImpactAnalysis();
  },

  /**
   * Load weekend planner logs and collections from storage or defaults
   */
  loadData() {
    // 1. Weekend Logs
    let storedLogs = Storage.get('weekend_logs');
    if (!storedLogs || !Array.isArray(storedLogs) || storedLogs.length === 0) {
      storedLogs = [
        {
          id: 'WK001',
          date: '2026-08-01',
          employee: 'Bob Johnson',
          project: 'PRJ001',
          hours: 8,
          task: 'Hotfix for core database replication sync and buffer optimization',
          status: 'Approved'
        },
        {
          id: 'WK002',
          date: '2026-08-02',
          employee: 'Alice Smith',
          project: 'PRJ002',
          hours: 6,
          task: 'Firewall penetration micro-audit and secure endpoints vulnerability sweep',
          status: 'Approved'
        },
        {
          id: 'WK003',
          date: '2026-08-08',
          employee: 'David Miller',
          project: 'PRJ001',
          hours: 8,
          task: 'Jest regression test suite preparation and Jenkins deployment verification',
          status: 'Pending Review'
        },
        {
          id: 'WK004',
          date: '2026-08-09',
          employee: 'Elena Rostova',
          project: 'PRJ004',
          hours: 4,
          task: 'Chronos real-time scheduler backlog pruning and SLA tracking verification',
          status: 'Approved'
        }
      ];
      Storage.set('weekend_logs', storedLogs);
    }
    this.weekendLogs = storedLogs;

    // Sync with central app
    this.app.weekendLogsList = this.weekendLogs;

    // 2. Resources List
    let storedResources = Storage.get('resources');
    this.resources = storedResources || this.app.resourcesList || [];

    // 3. Projects List
    let storedProjects = Storage.get('projects');
    this.projects = storedProjects || this.app.projectsList || [];
  },

  /**
   * Save weekend logs to local storage
   */
  saveLogs() {
    Storage.set('weekend_logs', this.weekendLogs);
    this.app.weekendLogsList = this.weekendLogs;
    
    // Also trigger update on active dashboard so KPI values refresh
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pm_portal_weekend_support', this.weekendLogs.filter(l => l.status === 'Approved').length.toString());
      }
    } catch (e) {
      console.warn("Could not save to pm_portal_weekend_support variable", e);
    }
  },

  /**
   * Populate resource and project dropdown options
   */
  populateDropdowns() {
    const empSelect = document.getElementById('m-weekend-employee');
    const projSelect = document.getElementById('m-weekend-project');

    if (empSelect) {
      empSelect.innerHTML = '<option value="">Select Employee...</option>';
      this.resources.forEach(r => {
        const option = document.createElement('option');
        option.value = r.name;
        option.textContent = `${r.name} (${r.role} - ${r.dept})`;
        empSelect.appendChild(option);
      });
    }

    if (projSelect) {
      projSelect.innerHTML = '<option value="">Select Project...</option>';
      this.projects.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.id} - ${p.name}`;
        projSelect.appendChild(option);
      });
    }
  },

  /**
   * Set up UI event listeners
   */
  setupEventListeners() {
    // Form submission
    const form = document.getElementById('schedule-weekend-form');
    if (form) {
      // Remove any duplicate listeners
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);

      newForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleFormSubmit();
      });
    }

    // Input changes trigger live impact simulator
    const dateInp = document.getElementById('m-weekend-date');
    const empSelect = document.getElementById('m-weekend-employee');
    const projSelect = document.getElementById('m-weekend-project');
    const hoursInp = document.getElementById('m-weekend-hours');
    const statusSelect = document.getElementById('m-weekend-approval');

    if (dateInp) dateInp.addEventListener('change', () => this.triggerLiveImpactAnalysis());
    if (empSelect) empSelect.addEventListener('change', () => this.triggerLiveImpactAnalysis());
    if (projSelect) projSelect.addEventListener('change', () => this.triggerLiveImpactAnalysis());
    if (hoursInp) hoursInp.addEventListener('input', () => this.triggerLiveImpactAnalysis());
    if (statusSelect) statusSelect.addEventListener('change', () => this.triggerLiveImpactAnalysis());

    // Search bar filter
    const searchInp = document.getElementById('weekend-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderLedgerTable();
      });
    }

    // Loader and Reset buttons
    const loadBtn = document.getElementById('weekend-btn-load-sample');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => this.loadSampleData());
    }

    const resetBtn = document.getElementById('weekend-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all scheduled weekend support logs?')) {
          this.resetData();
        }
      });
    }

    // Excel Template, Import & Export event handlers
    const templateBtn = document.getElementById('weekend-btn-template');
    if (templateBtn) {
      templateBtn.addEventListener('click', () => this.downloadTemplate());
    }

    const exportBtn = document.getElementById('weekend-btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportToExcel());
    }

    const importBtn = document.getElementById('weekend-btn-import');
    const fileInput = document.getElementById('weekend-file-input');
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
   * Download Excel template for Weekend Delivery Planner
   */
  downloadTemplate() {
    const headers = ['Weekend Date', 'Employee Name', 'Project ID', 'Task Description', 'Planned Hours', 'Approval Status'];
    const sampleRow = ['2026-08-01', 'Bob Johnson', 'PRJ001', 'Hotfix for core database replication sync and buffer optimization', 8, 'Approved'];
    Excel.downloadCustomTemplate(headers, sampleRow, 'Weekend_Planner_Template', 'weekend_planner_template');
    this.app.showToast('Downloaded Weekend Planner Excel Template', 'info');
  },

  /**
   * Export weekend support records to Excel
   */
  exportToExcel() {
    if (!this.weekendLogs || this.weekendLogs.length === 0) {
      this.app.showToast('No weekend support entries to export', 'warning');
      return;
    }

    const headers = ['Entry ID', 'Weekend Date', 'Employee Name', 'Project ID', 'Task Description', 'Planned Hours', 'Approval Status'];
    const keys = ['id', 'date', 'employee', 'project', 'task', 'hours', 'status'];

    const success = Excel.exportCustomToExcel(headers, this.weekendLogs, keys, 'Weekend_Roster', 'weekend_planner_export');
    if (success) {
      this.app.showToast(`Exported ${this.weekendLogs.length} weekend plan entries to Excel`, 'success');
    } else {
      this.app.showToast('Failed to export weekend plans', 'danger');
    }
  },

  /**
   * Import weekend support plans from Excel
   */
  importFromExcel(file) {
    Excel.parseCustomExcelFile(file, (rows, err) => {
      if (err || !rows) {
        this.app.showToast(`Import Error: ${err || 'Invalid file format'}`, 'danger');
        return;
      }

      let importedCount = 0;
      rows.forEach(r => {
        const getVal = (possibleKeys) => {
          for (let k of possibleKeys) {
            const found = Object.keys(r).find(key => key.trim().toLowerCase() === k.trim().toLowerCase());
            if (found && r[found] !== undefined) return r[found];
          }
          return '';
        };

        const wkDate = getVal(['Weekend Date', 'date', 'Date']) || '2026-08-01';
        const empName = getVal(['Employee Name', 'employee', 'Employee', 'Name']);
        const projId = getVal(['Project ID', 'project', 'Project', 'projectId']);
        const taskDesc = getVal(['Task Description', 'task', 'Task', 'Description']) || 'Imported Weekend Support';
        const hrsVal = parseInt(getVal(['Planned Hours', 'hours', 'Hours']), 10) || 8;
        const appStatus = getVal(['Approval Status', 'status', 'Status']) || 'Approved';

        if (empName && projId && hrsVal > 0) {
          const proj = this.projects.find(p => p.id === projId || p.name === projId);
          const actualProjId = proj ? proj.id : projId;

          const newEntry = {
            id: `WK-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
            date: wkDate,
            employee: empName,
            project: actualProjId,
            hours: hrsVal,
            task: taskDesc,
            status: appStatus
          };

          this.weekendLogs.unshift(newEntry);
          importedCount++;
        }
      });

      if (importedCount > 0) {
        Storage.set('weekend_logs', this.weekendLogs);
        this.app.weekendLogsList = this.weekendLogs;
        this.recalculateAndRender();
        this.triggerLiveImpactAnalysis();
        this.app.showToast(`Successfully imported ${importedCount} weekend plan records!`, 'success');
      } else {
        this.app.showToast('No valid weekend plan entries found in Excel file. Check column headers.', 'warning');
      }
    });
  },

  /**
   * Automatic Real-Time Update Impact Simulator
   */
  triggerLiveImpactAnalysis() {
    const dateVal = document.getElementById('m-weekend-date')?.value || '';
    const empVal = document.getElementById('m-weekend-employee')?.value || '';
    const projVal = document.getElementById('m-weekend-project')?.value || '';
    const hoursVal = parseInt(document.getElementById('m-weekend-hours')?.value) || 0;
    const approvalVal = document.getElementById('m-weekend-approval')?.value || 'Approved';

    const fcSpan = document.getElementById('weekend-impact-forecast');
    const rhSpan = document.getElementById('weekend-impact-remaining');
    const ruSpan = document.getElementById('weekend-impact-utilization');
    const phDiv = document.getElementById('weekend-impact-health');
    const logDiv = document.getElementById('weekend-impact-explanation');

    if (!empVal || !projVal || hoursVal <= 0) {
      if (fcSpan) fcSpan.innerHTML = '<span class="text-muted text-xs">Awaiting selection...</span>';
      if (rhSpan) rhSpan.innerHTML = '<span class="text-muted text-xs">Awaiting selection...</span>';
      if (ruSpan) ruSpan.innerHTML = '<span class="text-muted text-xs">Awaiting selection...</span>';
      if (phDiv) {
        phDiv.innerHTML = 'No Project Selected';
        phDiv.style.color = 'var(--text-secondary)';
      }
      if (logDiv) logDiv.textContent = 'Select an employee, project, and hours to compute real-time delivery acceleration impacts.';
      return;
    }

    const employee = this.resources.find(r => r.name === empVal);
    const project = this.projects.find(p => p.id === projVal);

    if (!employee || !project) return;

    // Standard capacities/workloads
    const baseWeeklyCapacity = employee.baseWeeklyCapacity || 40;
    const isApproved = approvalVal === 'Approved';

    // 1. Forecast Completion Impact simulation
    // Rule: Each 4 hours of Approved weekend work saves ~1 business day of standard project timeline
    let acceleratedDays = 0;
    if (isApproved) {
      acceleratedDays = Math.max(1, Math.round(hoursVal / 4));
    }
    const currentEnd = project.estimatedEnd || '2026-08-15';
    let newEndStr = currentEnd;
    try {
      const d = new Date(currentEnd);
      if (!isNaN(d.getTime())) {
        // Simple day shift (backwards)
        d.setDate(d.getDate() - acceleratedDays);
        newEndStr = d.toISOString().split('T')[0];
      }
    } catch(err) {
      console.warn("End date format error", err);
    }

    if (fcSpan) {
      if (acceleratedDays > 0) {
        fcSpan.innerHTML = `<span class="text-success font-bold"><i class="fa-solid fa-circle-arrow-down"></i> Accelerated by ${acceleratedDays} Day(s)</span> <span class="text-secondary small">(${currentEnd} &rarr; ${newEndStr})</span>`;
      } else {
        fcSpan.innerHTML = `<span class="text-secondary">-0 Days Accelerated <span class="small">(Pending/Rejected reviews don't affect timeline)</span></span>`;
      }
    }

    // 2. Remaining Hours Impact simulation
    // Simulated project remaining hours decreases directly by the support hours
    const currentRemainingHrs = project.remainingHours || (project.status === 'in-progress' ? 120 : project.status === 'planning' ? 310 : 40);
    const newRemainingHrs = Math.max(0, currentRemainingHrs - (isApproved ? hoursVal : 0));
    if (rhSpan) {
      if (isApproved) {
        rhSpan.innerHTML = `<span class="text-success font-bold"><i class="fa-solid fa-arrow-down-long"></i> Saves ${hoursVal} Hrs</span> <span class="text-secondary small">(${currentRemainingHrs} &rarr; ${newRemainingHrs} Hrs Left)</span>`;
      } else {
        rhSpan.innerHTML = `<span class="text-secondary">${currentRemainingHrs} Hrs <span class="small">(No change until approved)</span></span>`;
      }
    }

    // 3. Resource Utilization Impact simulation
    // Adds support hours to employee utilization
    // utilization = (allocation + (hoursVal / 40 * 100))
    const baseAllocation = employee.allocation || 100;
    const simulatedUtilization = baseAllocation + (isApproved ? Math.round((hoursVal / baseWeeklyCapacity) * 100) : 0);
    if (ruSpan) {
      if (isApproved && hoursVal > 0) {
        const hazardClass = simulatedUtilization > 120 ? 'text-danger font-bold' : 'text-primary font-bold';
        const warningTxt = simulatedUtilization > 120 ? ' <span class="text-danger font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Over-capacity Alert</span>' : '';
        ruSpan.innerHTML = `<span class="${hazardClass}">${baseAllocation}% &rarr; ${simulatedUtilization}% Utilization</span>${warningTxt}`;
      } else {
        ruSpan.innerHTML = `<span class="text-secondary">${baseAllocation}% <span class="small">(No weekend burden)</span></span>`;
      }
    }

    // 4. Project Health Impact simulation
    // If a project is high risk or slow, weekend effort can boost progress/health
    let healthBefore = 'Stable';
    if (project.risk === 'Critical' || project.risk === 'High') {
      healthBefore = 'Critical Blockers';
    } else if (project.status === 'on-hold' || project.status === 'planning') {
      healthBefore = 'Dormant/Planning';
    }

    let healthAfter = healthBefore;
    if (isApproved && hoursVal >= 8) {
      if (healthBefore === 'Critical Blockers') {
        healthAfter = 'Recovering (Medium Risk)';
      } else if (healthBefore === 'Dormant/Planning') {
        healthAfter = 'Accelerating (Active)';
      } else {
        healthAfter = 'Highly Resilient (Optimized)';
      }
    }

    if (phDiv) {
      if (healthBefore === healthAfter) {
        phDiv.textContent = `Status: ${healthBefore} (Unchanged)`;
        phDiv.style.color = 'var(--text-secondary)';
      } else {
        phDiv.innerHTML = `<span class="text-danger-custom text-decoration-line-through me-1" style="color: var(--brand-danger);">${healthBefore}</span> &rarr; <span class="text-success font-bold" style="color: var(--brand-success);">${healthAfter}</span>`;
      }
    }

    // 5. Build dynamic Simulator Log explanation text
    if (logDiv) {
      let explanation = `Allocating ${empVal} to ${project.name} for ${hoursVal} hours on ${dateVal || 'selected weekend'}. `;
      if (isApproved) {
        explanation += `Since compliance is Approved, remaining hours drop by ${hoursVal} hours, accelerating the schedule by ${acceleratedDays} day(s). `;
        if (simulatedUtilization > 120) {
          explanation += `CAUTION: This pushes ${empVal}'s utilization to ${simulatedUtilization}%, triggering warning flags. Ensure standby compensation is applied.`;
        } else {
          explanation += `Resource load remains balanced.`;
        }
      } else {
        explanation += `Note: This request is set to '${approvalVal}'. Delivery and capacity metrics will not recalculate automatically until approved.`;
      }
      logDiv.textContent = explanation;
    }
  },

  /**
   * Handle scheduling form submission
   */
  handleFormSubmit() {
    const dateVal = document.getElementById('m-weekend-date').value;
    const empVal = document.getElementById('m-weekend-employee').value;
    const projVal = document.getElementById('m-weekend-project').value;
    const hoursVal = parseInt(document.getElementById('m-weekend-hours').value) || 8;
    const taskVal = document.getElementById('m-weekend-task').value;
    const approvalVal = document.getElementById('m-weekend-approval').value;

    if (!dateVal || !empVal || !projVal || !taskVal) {
      this.app.showToast('Please complete all form inputs before submitting', 'warning');
      return;
    }

    // Verify it is actually a weekend (Saturday or Sunday)
    const d = new Date(dateVal);
    const day = d.getDay(); // 0 is Sunday, 6 is Saturday
    if (day !== 0 && day !== 6) {
      if (!confirm('The date selected does not fall on a Saturday or Sunday. Do you want to log this weekend delivery support on a weekday instead?')) {
        return;
      }
    }

    const newId = `WK00${this.weekendLogs.length + 1}`;
    const newLog = {
      id: newId,
      date: dateVal,
      employee: empVal,
      project: projVal,
      hours: hoursVal,
      task: taskVal,
      status: approvalVal
    };

    this.weekendLogs.unshift(newLog);
    this.saveLogs();
    
    this.app.showToast(`Weekend support ${newId} logged successfully!`, 'success');
    
    // Reset form task input
    const taskInput = document.getElementById('m-weekend-task');
    if (taskInput) taskInput.value = '';

    // Recalculate & update UI
    this.recalculateAndRender();
    this.triggerLiveImpactAnalysis();

    // Propagate changes to the central Dashboard
    if (this.app.currentPage === 'dashboard') {
      this.app.initLeavesPage(); // quick refresh trigger
    }
  },

  /**
   * Recalculate KPI cards, timeline, recommendations and history table
   */
  recalculateAndRender() {
    // 1. Compute KPIs
    const approvedLogs = this.weekendLogs.filter(l => l.status === 'Approved');
    const totalHours = approvedLogs.reduce((sum, l) => sum + l.hours, 0);
    
    const uniqueEmployees = new Set(approvedLogs.map(l => l.employee));
    const activeStandbyCount = uniqueEmployees.size;

    const uniqueProjects = new Set(approvedLogs.map(l => l.project));
    const acceleratedProjectsCount = uniqueProjects.size;

    const pendingQueueCount = this.weekendLogs.filter(l => l.status === 'Pending Review').length;

    // Render KPIs to DOM
    const kpiHours = document.getElementById('weekend-kpi-hours');
    const kpiWorkforce = document.getElementById('weekend-kpi-workforce');
    const kpiAccelerated = document.getElementById('weekend-kpi-accelerated');
    const kpiPending = document.getElementById('weekend-kpi-pending');

    if (kpiHours) kpiHours.textContent = `${totalHours} Hours`;
    if (kpiWorkforce) kpiWorkforce.textContent = `${activeStandbyCount} Standby`;
    if (kpiAccelerated) kpiAccelerated.textContent = `${acceleratedProjectsCount} Project(s)`;
    if (kpiPending) kpiPending.textContent = `${pendingQueueCount} Pending`;

    // 2. Render Widgets
    this.renderTimeline();
    this.renderRecommendations();
    this.renderLedgerTable();
  },

  /**
   * Render Weekend Standby Timeline Calendar
   */
  renderTimeline() {
    const container = document.getElementById('weekend-timeline-grid');
    if (!container) return;

    container.innerHTML = '';

    // Define standard weekends for August 2026
    const weekends = [
      { date: '2026-08-01', label: 'Saturday, Aug 01' },
      { date: '2026-08-02', label: 'Sunday, Aug 02' },
      { date: '2026-08-08', label: 'Saturday, Aug 08' },
      { date: '2026-08-09', label: 'Sunday, Aug 09' },
      { date: '2026-08-15', label: 'Saturday, Aug 15' },
      { date: '2026-08-16', label: 'Sunday, Aug 16' }
    ];

    weekends.forEach(wk => {
      // Find logs matching this date
      const matches = this.weekendLogs.filter(l => l.date === wk.date);

      const timelineRow = document.createElement('div');
      timelineRow.className = 'p-3 rounded border d-flex flex-wrap justify-content-between align-items-center gap-2';
      timelineRow.style.backgroundColor = 'var(--bg-main)';
      timelineRow.style.borderColor = 'var(--border-color)';

      let standbyHTML = '';
      if (matches.length === 0) {
        standbyHTML = `<span class="text-xs text-muted font-semibold"><i class="fa-solid fa-circle-minus text-muted me-1"></i> No standby scheduled</span>`;
      } else {
        matches.forEach(m => {
          let badgeClass = 'bg-success-subtle text-success';
          if (m.status === 'Pending Review') badgeClass = 'bg-warning-subtle text-warning border border-warning-subtle';
          if (m.status === 'Rejected') badgeClass = 'bg-danger-subtle text-danger';

          standbyHTML += `
            <div class="d-inline-flex align-items-center gap-1.5 px-2.5 py-1 rounded border" style="background-color: var(--bg-card); border-color: var(--border-color); font-size: 0.8rem;">
              <span class="font-bold text-primary">${m.employee}</span>
              <span class="text-secondary">(${m.project} - ${m.hours} Hrs)</span>
              <span class="badge ${badgeClass}" style="font-size: 0.65rem;">${m.status}</span>
            </div>
          `;
        });
      }

      timelineRow.innerHTML = `
        <div style="min-width: 160px;">
          <span class="font-bold text-xs uppercase tracking-wider text-secondary d-block">Weekend Date</span>
          <span class="font-semibold text-primary" style="font-size: 0.85rem;"><i class="fa-regular fa-calendar-check me-1 text-primary"></i> ${wk.label}</span>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center flex-grow-1 justify-content-start px-2">
          ${standbyHTML}
        </div>
      `;

      container.appendChild(timelineRow);
    });
  },

  /**
   * Render recommendations for delayed/understaffed projects
   */
  renderRecommendations() {
    const container = document.getElementById('weekend-recommendations-list');
    if (!container) return;

    container.innerHTML = '';

    // Find delayed or critical projects
    const delayedProjects = this.projects.filter(p => p.status === 'in-progress' || p.risk === 'High' || p.risk === 'Critical');

    if (delayedProjects.length === 0) {
      container.innerHTML = `
        <div class="p-4 text-center text-muted text-xs">
          <i class="fa-solid fa-circle-check text-success d-block mb-1" style="font-size: 1.5rem;"></i>
          All projects are operating on schedule. No acceleration pushes required.
        </div>
      `;
      return;
    }

    delayedProjects.forEach(proj => {
      const recRow = document.createElement('div');
      recRow.className = 'p-3 rounded border mb-2 d-flex flex-wrap justify-content-between align-items-center gap-3';
      recRow.style.backgroundColor = 'var(--bg-main)';
      recRow.style.borderColor = 'var(--border-color)';

      // Recommend specific PM/Lead Architect
      const leadResource = this.resources.find(r => r.dept === 'Engineering') || { name: 'Alice Smith' };

      recRow.innerHTML = `
        <div>
          <div class="font-bold text-primary" style="font-size: 0.85rem;">
            ${proj.id} - ${proj.name}
          </div>
          <div class="text-xs text-secondary mt-1">
            <span class="badge bg-danger-subtle text-danger px-1.5 py-0.5" style="font-size: 0.65rem;">${proj.risk} Risk</span>
            <span class="ms-2">Progress: <strong>${proj.progress}%</strong></span>
            <span class="ms-2">Manager: <strong>${proj.manager}</strong></span>
          </div>
        </div>
        <button class="btn-enterprise btn-enterprise-primary btn-sm px-3 py-1.5 font-bold" style="font-size: 0.75rem;" onclick="window.prefillWeekendForm('${proj.id}', '${leadResource.name}')">
          <i class="fa-solid fa-bolt me-1"></i> Pre-fill Push Schedule
        </button>
      `;

      container.appendChild(recRow);
    });

    // Attach global pre-fill handler
    window.prefillWeekendForm = (projId, empName) => {
      const projSelect = document.getElementById('m-weekend-project');
      const empSelect = document.getElementById('m-weekend-employee');
      const taskText = document.getElementById('m-weekend-task');
      const hoursInp = document.getElementById('m-weekend-hours');

      if (projSelect) projSelect.value = projId;
      if (empSelect) empSelect.value = empName;
      if (hoursInp) hoursInp.value = '8';
      if (taskText) {
        taskText.value = `Critical weekend sprint push to resolve pending blockers for project ${projId}`;
      }

      this.app.showToast(`Pre-filled support form for project ${projId}`, 'info');
      this.triggerLiveImpactAnalysis();
      
      // Scroll to form nicely
      document.getElementById('schedule-weekend-form')?.scrollIntoView({ behavior: 'smooth' });
    };
  },

  /**
   * Render complete logs ledger history table
   */
  renderLedgerTable() {
    const tbody = document.getElementById('weekend-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Filter logs based on search bar query
    let filtered = this.weekendLogs;
    if (this.searchQuery) {
      filtered = Filters.bySearch(this.weekendLogs, this.searchQuery, ['employee', 'project', 'task', 'status']);
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted py-4">
            No weekend standby logs found matching search criteria.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(log => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';

      let badgeClass = 'Approved';
      if (log.status === 'Pending Review') badgeClass = 'pending';
      if (log.status === 'Rejected') badgeClass = 'rejected';

      tr.innerHTML = `
        <td style="padding: 12px 16px;"><span class="font-semibold text-primary">${log.date}</span></td>
        <td><span class="font-bold text-primary">${log.employee}</span></td>
        <td><span class="text-secondary font-semibold">${log.project}</span></td>
        <td><span class="font-bold text-center d-block" style="width: 50px;">${log.hours} Hrs</span></td>
        <td style="max-width: 320px;"><span class="text-xs text-secondary d-block" style="word-break: break-word;">${log.task}</span></td>
        <td style="text-align: right; padding-right: 20px;">
          <select class="form-select select-enterprise d-inline-block w-auto" style="font-size: 0.75rem; padding-top: 2px; padding-bottom: 2px;" onchange="window.updateWeekendApproval('${log.id}', this.value)">
            <option value="Approved" ${log.status === 'Approved' ? 'selected' : ''}>Approved</option>
            <option value="Pending Review" ${log.status === 'Pending Review' ? 'selected' : ''}>Pending Review</option>
            <option value="Rejected" ${log.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </td>
        <td style="text-align: center;">
          <button class="btn-enterprise btn-enterprise-danger btn-xs" style="padding: 4px 8px; font-size: 0.75rem;" onclick="window.deleteWeekendLog('${log.id}')" aria-label="Delete schedule">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Attach global status updater & delete handlers
    window.updateWeekendApproval = (id, newStatus) => {
      const index = this.weekendLogs.findIndex(l => l.id === id);
      if (index !== -1) {
        this.weekendLogs[index].status = newStatus;
        this.saveLogs();
        this.app.showToast(`Updated status of ${id} to ${newStatus}`, 'success');
        this.recalculateAndRender();
        this.triggerLiveImpactAnalysis();
      }
    };

    window.deleteWeekendLog = (id) => {
      if (confirm(`Are you sure you want to delete weekend support schedule ${id}?`)) {
        this.weekendLogs = this.weekendLogs.filter(l => l.id !== id);
        this.saveLogs();
        this.app.showToast(`Deleted weekend schedule ${id}`, 'success');
        this.recalculateAndRender();
        this.triggerLiveImpactAnalysis();
      }
    };
  },

  /**
   * Load sample demo standby logs
   */
  loadSampleData() {
    this.weekendLogs = [
      {
        id: 'WK001',
        date: '2026-08-01',
        employee: 'Bob Johnson',
        project: 'PRJ001',
        hours: 8,
        task: 'Hotfix for core database replication sync and buffer optimization',
        status: 'Approved'
      },
      {
        id: 'WK002',
        date: '2026-08-02',
        employee: 'Alice Smith',
        project: 'PRJ002',
        hours: 6,
        task: 'Firewall penetration micro-audit and secure endpoints vulnerability sweep',
        status: 'Approved'
      },
      {
        id: 'WK003',
        date: '2026-08-08',
        employee: 'David Miller',
        project: 'PRJ001',
        hours: 8,
        task: 'Jest regression test suite preparation and Jenkins deployment verification',
        status: 'Pending Review'
      },
      {
        id: 'WK004',
        date: '2026-08-09',
        employee: 'Elena Rostova',
        project: 'PRJ004',
        hours: 4,
        task: 'Chronos real-time scheduler backlog pruning and SLA tracking verification',
        status: 'Approved'
      },
      {
        id: 'WK005',
        date: '2026-08-15',
        employee: 'Clara Oswald',
        project: 'PRJ005',
        hours: 8,
        task: 'Sensors Cloud UX scaffolding review and figma alignment validation',
        status: 'Approved'
      },
      {
        id: 'WK006',
        date: '2026-08-16',
        employee: 'Bob Johnson',
        project: 'PRJ001',
        hours: 6,
        task: 'Core routing queue hot standby configuration support',
        status: 'Approved'
      }
    ];

    this.saveLogs();
    this.app.showToast('Demo weekend roster loaded successfully!', 'success');
    this.recalculateAndRender();
    this.triggerLiveImpactAnalysis();
  },

  /**
   * Reset data to completely empty state
   */
  resetData() {
    this.weekendLogs = [];
    this.saveLogs();
    this.app.showToast('All scheduled weekend standby logs cleared', 'info');
    this.recalculateAndRender();
    this.triggerLiveImpactAnalysis();
  }
};
