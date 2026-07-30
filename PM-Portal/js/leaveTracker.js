/* leaveTracker.js - Modular Leave Tracker with Conflict Detection, Impact Assessment, and Visual Calendar */

import { Storage } from './storage.js';
import { Calculations } from './calculations.js';
import { Filters } from './filters.js';
import { Excel } from './excel.js';

export const LeaveTrackerModule = {
  app: null,
  leaves: [],
  resources: [],
  allocations: [],
  projects: [],
  selectedMonth: '2026-07', // YYYY-MM
  searchQuery: '',

  // Standard departments list
  departments: ['Engineering', 'Design', 'QA / Test', 'Product'],

  /**
   * Initialize Leave Tracker Module
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;

    // Load data
    this.loadData();

    // Register UI listeners
    this.setupEventListeners();

    // Populate dropdown lists
    this.populateDropdowns();

    // Pre-fill default dates for July 2026
    const startInput = document.getElementById('m-leave-start');
    const endInput = document.getElementById('m-leave-end');
    if (startInput) startInput.value = '2026-07-28';
    if (endInput) endInput.value = '2026-07-30';

    // Trigger initial calculations & renders
    this.recalculateAndRender();
    this.triggerLiveImpactAnalysis();
  },

  /**
   * Load leaves and merge with local storage
   */
  loadData() {
    // 1. Leaves List
    let storedLeaves = Storage.get('leaves');
    if (!storedLeaves || !Array.isArray(storedLeaves) || storedLeaves.length === 0) {
      storedLeaves = [
        { 
          id: 'LV001', 
          name: 'Alice Smith', 
          type: 'Annual Leave', 
          start: '2026-08-10', 
          end: '2026-08-15', 
          days: 5, 
          reason: 'Annual family summer vacation', 
          status: 'Approved',
          projectsAffected: ['PRJ001', 'PRJ002'],
          jirasAffected: ['ARES-310', 'ZEUS-405'],
          milestonesAffected: ['Database Cluster Upgrade Milestone', 'Security Gateway Audit'],
          resourceShortage: 'Engineering department at 50% capacity',
          riskIncrease: 'Medium'
        },
        { 
          id: 'LV002', 
          name: 'David Miller', 
          type: 'Sick Leave', 
          start: '2026-07-28', 
          end: '2026-07-30', 
          days: 3, 
          reason: 'Wisdom teeth surgery recovery', 
          status: 'Pending Review',
          projectsAffected: ['PRJ001'],
          jirasAffected: ['ARES-212'],
          milestonesAffected: ['Jest test suites preparation'],
          resourceShortage: 'QA / Test department at 0% capacity (CRITICAL)',
          riskIncrease: 'High'
        },
        { 
          id: 'LV003', 
          name: 'Elena Rostova', 
          type: 'Personal Day', 
          start: '2026-08-01', 
          end: '2026-08-01', 
          days: 1, 
          reason: 'Personal administrative errands', 
          status: 'Approved',
          projectsAffected: ['PRJ001'],
          jirasAffected: ['ARES-104'],
          milestonesAffected: ['Sprint 42 Retrospective'],
          resourceShortage: 'Product department at 50% capacity',
          riskIncrease: 'Low'
        }
      ];
      Storage.set('leaves', storedLeaves);
    }
    this.leaves = storedLeaves;
    this.app.leavesList = this.leaves;

    // 2. Resources List
    let storedResources = Storage.get('resources');
    this.resources = storedResources || this.app.resourcesList || [];

    // 3. Allocations
    let storedAllocations = Storage.get('resource_allocations');
    this.allocations = storedAllocations || [];

    // 4. Projects List
    let storedProjects = Storage.get('projects');
    this.projects = storedProjects || this.app.projectsList || [];
  },

  /**
   * Save leaves list to storage and update app instance
   */
  saveLeaves() {
    Storage.set('leaves', this.leaves);
    this.app.leavesList = this.leaves;
  },

  /**
   * Populate resource list in the form
   */
  populateDropdowns() {
    const empSelect = document.getElementById('m-leave-name');
    if (empSelect) {
      empSelect.innerHTML = '<option value="">Select Employee...</option>';
      this.resources.forEach(r => {
        const option = document.createElement('option');
        option.value = r.name;
        option.textContent = `${r.name} (${r.role} - ${r.dept})`;
        empSelect.appendChild(option);
      });
    }

    // Populate calendar month select if exists
    const monthSelect = document.getElementById('leave-month-select');
    if (monthSelect) {
      monthSelect.value = this.selectedMonth;
    }
  },

  /**
   * Event Listeners setup
   */
  setupEventListeners() {
    // 1. Submit Form handler
    const form = document.getElementById('apply-leave-form');
    if (form) {
      // Clean clone pattern to avoid duplicate listeners
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);

      newForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleFormSubmit();
      });
    }

    // 2. Real-time changes triggers live impact analyzer
    const empSelect = document.getElementById('m-leave-name');
    const startInput = document.getElementById('m-leave-start');
    const endInput = document.getElementById('m-leave-end');
    const typeSelect = document.getElementById('m-leave-type');

    if (empSelect) empSelect.addEventListener('change', () => this.triggerLiveImpactAnalysis());
    if (startInput) startInput.addEventListener('change', () => this.triggerLiveImpactAnalysis());
    if (endInput) endInput.addEventListener('change', () => this.triggerLiveImpactAnalysis());
    if (typeSelect) typeSelect.addEventListener('change', () => this.triggerLiveImpactAnalysis());

    // 3. Search query input in registry
    const searchInp = document.getElementById('leave-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderLeavesTable();
      });
    }

    // 4. Leave Calendar Month Filter
    const monthSelect = document.getElementById('leave-month-select');
    if (monthSelect) {
      monthSelect.addEventListener('change', (e) => {
        this.selectedMonth = e.target.value;
        this.renderCalendar();
      });
    }

    // 5. Actions on the main registry table (Approve, Reject, Delete)
    const tableBody = document.getElementById('leaves-table-body');
    if (tableBody) {
      tableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.leave-action-btn');
        if (btn) {
          const action = btn.getAttribute('data-action');
          const leaveId = btn.getAttribute('data-id');
          if (action && leaveId) {
            this.handleTableAction(action, leaveId);
          }
        }
      });
    }

    // 6. Bulk Sample Data Trigger
    const sampleBtn = document.getElementById('leave-btn-load-sample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => {
        this.loadSampleData();
      });
    }

    // 7. Reset Data Trigger
    const resetBtn = document.getElementById('leave-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all leaves data to defaults?')) {
          this.resetData();
        }
      });
    }

    // 8. Excel Template, Import & Export event handlers
    const templateBtn = document.getElementById('leave-btn-template');
    if (templateBtn) {
      templateBtn.addEventListener('click', () => this.downloadTemplate());
    }

    const exportBtn = document.getElementById('leave-btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportToExcel());
    }

    const importBtn = document.getElementById('leave-btn-import');
    const fileInput = document.getElementById('leave-file-input');
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
   * Download Excel template for Leave Tracker
   */
  downloadTemplate() {
    const headers = ['Employee Name', 'Leave Category', 'Start Date', 'End Date', 'Total Days', 'Reason'];
    const sampleRow = ['Alice Smith', 'Annual Leave', '2026-08-10', '2026-08-15', 5, 'Annual family summer vacation'];
    Excel.downloadCustomTemplate(headers, sampleRow, 'Leave_Tracker_Template', 'leave_tracker_template');
    this.app.showToast('Downloaded Leave Tracker Excel Template', 'info');
  },

  /**
   * Export leaves to Excel workbook
   */
  exportToExcel() {
    if (!this.leaves || this.leaves.length === 0) {
      this.app.showToast('No leave records to export', 'warning');
      return;
    }

    const headers = ['Leave ID', 'Employee Name', 'Leave Category', 'Start Date', 'End Date', 'Total Days', 'Reason', 'Approval Status'];
    const keys = ['id', 'name', 'type', 'start', 'end', 'days', 'reason', 'status'];

    const success = Excel.exportCustomToExcel(headers, this.leaves, keys, 'Leave_Records', 'leave_tracker_export');
    if (success) {
      this.app.showToast(`Exported ${this.leaves.length} leave records to Excel`, 'success');
    } else {
      this.app.showToast('Failed to export leave records', 'danger');
    }
  },

  /**
   * Import leave records from Excel file
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

        const empName = getVal(['Employee Name', 'employee', 'Employee', 'Name']);
        const category = getVal(['Leave Category', 'type', 'Type', 'Category']) || 'Annual Leave';
        const startDate = getVal(['Start Date', 'start', 'Start']) || new Date().toISOString().split('T')[0];
        const endDate = getVal(['End Date', 'end', 'End']) || startDate;
        let daysVal = parseInt(getVal(['Total Days', 'days', 'Days']), 10);
        const reasonStr = getVal(['Reason', 'reason', 'Comments', 'Remarks']) || 'Imported leave request';

        if (!daysVal || isNaN(daysVal)) {
          const s = new Date(startDate);
          const e = new Date(endDate);
          daysVal = Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1);
        }

        if (empName && startDate && endDate) {
          const impact = this.analyzeLeaveImpact(empName, startDate, endDate, category);

          const newLeave = {
            id: `LV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
            name: empName,
            type: category,
            start: startDate,
            end: endDate,
            days: daysVal,
            reason: reasonStr,
            status: 'Approved',
            projectsAffected: impact.projectsAffected,
            jirasAffected: impact.jirasAffected,
            milestonesAffected: impact.milestonesAffected,
            resourceShortage: impact.resourceShortage,
            riskIncrease: impact.riskIncrease
          };

          this.leaves.unshift(newLeave);
          importedCount++;
        }
      });

      if (importedCount > 0) {
        this.saveLeaves();
        this.recalculateAndRender();
        this.app.showToast(`Successfully imported ${importedCount} leave records!`, 'success');
      } else {
        this.app.showToast('No valid leave records found in Excel file. Check column headers.', 'warning');
      }
    });
  },

  /**
   * Evaluates the full impact of a hypothetical leave request in real-time
   * Returns: { projectsAffected, jirasAffected, milestonesAffected, resourceShortage, riskIncrease, status }
   */
  analyzeLeaveImpact(employeeName, startStr, endStr, type) {
    if (!employeeName || !startStr || !endStr) {
      return {
        projectsAffected: [],
        jirasAffected: [],
        milestonesAffected: [],
        resourceShortage: 'No employee or date selected',
        riskIncrease: 'Low',
        status: 'Approved'
      };
    }

    const start = new Date(startStr);
    const end = new Date(endStr);
    const duration = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

    // 1. Projects Affected
    // Match employee allocations from `resource_allocations`
    const employee = this.resources.find(r => r.name === employeeName);
    const empId = employee ? employee.id : '';
    const dept = employee ? employee.dept : '';
    
    let pAffected = [];
    if (empId) {
      pAffected = this.allocations
        .filter(alc => alc.resourceId === empId)
        .map(alc => alc.projectId);
    }

    // Fallback: Check if they are listed as developer or PM in projects list
    if (pAffected.length === 0 && employeeName) {
      this.projects.forEach(p => {
        if (p.developer === employeeName || p.manager === employeeName || p.qa === employeeName || p.ba === employeeName) {
          pAffected.push(p.id);
        }
      });
    }

    // Deduplicate
    pAffected = [...new Set(pAffected)];
    if (pAffected.length === 0) {
      // Default fallback if no project matches
      pAffected = ['PRJ001'];
    }

    // 2. Jiras Affected
    // Map project keys to rich Jira tasks based on employee role/work
    const jiraMap = {
      'PRJ001': ['ARES-310 (Replication DB Setup)', 'ARES-212 (CORS Routing Filters)'],
      'PRJ002': ['ZEUS-405 (Microservice Endpoint Firewall)', 'ZEUS-215 (TLS Layer Audit)'],
      'PRJ003': ['HRM-112 (Router Maps Optimizations)', 'HRM-201 (Dynamic API clustering)'],
      'PRJ004': ['CHR-301 (Chronos Queue Multi-threader)', 'CHR-114 (Scheduling core validation)'],
      'PRJ005': ['DMT-202 (Sensor calibration protocols)', 'DMT-105 (Cloud payload buffering)']
    };

    let jAffected = [];
    pAffected.forEach(pId => {
      const jiras = jiraMap[pId] || [`${pId.replace('PRJ', 'TSK')}-101 (Pipeline activity)`];
      jAffected.push(...jiras);
    });

    // 3. Milestones Affected
    // Look up project names and active schedules that intersect with the leave date
    let mAffected = [];
    pAffected.forEach(pId => {
      const proj = this.projects.find(p => p.id === pId);
      if (proj) {
        // Overlap check
        const pStart = new Date(proj.estimatedStart || '2026-07-01');
        const pEnd = new Date(proj.estimatedEnd || '2026-08-31');
        
        // If leave overlaps with project duration, project milestone is affected!
        if (start <= pEnd && end >= pStart) {
          mAffected.push(`${proj.name} - Mid-phase Milestones`);
        }
      }
    });

    if (mAffected.length === 0) {
      mAffected = ['General Sprint Timelines'];
    }

    // 4. Resource Shortage (Evaluating same-dept overlaps)
    const sameDeptMembers = this.resources.filter(r => r.dept === dept);
    const totalDeptCount = sameDeptMembers.length || 1;

    // Check how many people in this department are on approved/pending leave during the overlapping dates!
    let overlapCount = 0;
    const overlappingNames = [];

    this.leaves.forEach(l => {
      if (l.status !== 'Rejected' && l.name !== employeeName) {
        const lRes = this.resources.find(r => r.name === l.name);
        if (lRes && lRes.dept === dept) {
          const lStart = new Date(l.start);
          const lEnd = new Date(l.end);
          if (start <= lEnd && end >= lStart) {
            overlapCount++;
            overlappingNames.push(l.name);
          }
        }
      }
    });

    const activeWorkingCount = Math.max(0, totalDeptCount - 1 - overlapCount);
    const deptCapacityPercent = Math.round((activeWorkingCount / totalDeptCount) * 100);

    let shortageText = `${dept} department capacity remains at ${deptCapacityPercent}%`;
    if (overlapCount > 0) {
      shortageText += ` (Overlaps with: ${overlappingNames.join(', ')})`;
    }

    // 5. Risk Increase
    let risk = 'Low';
    let riskReasons = [];

    if (duration > 5) {
      risk = 'Medium';
      riskReasons.push('Leave duration is longer than 5 business days');
    }

    if (deptCapacityPercent < 50) {
      risk = 'High';
      riskReasons.push(`Critical department capacity reduction in ${dept} (${deptCapacityPercent}%)`);
    }

    if (deptCapacityPercent < 25) {
      risk = 'Critical';
      riskReasons.push(`Severe department under-staffing in ${dept}`);
    }

    if (employee && (employee.role.toLowerCase().includes('lead') || employee.role.toLowerCase().includes('manager')) && duration >= 3) {
      if (risk === 'Low') risk = 'Medium';
      else if (risk === 'Medium') risk = 'High';
      riskReasons.push(`Key supervisory role (${employee.role}) absent for ${duration} days`);
    }

    // 6. Approval decision rule
    // Auto-approve if duration <= 2 days and capacity >= 70% and risk is Low/Medium
    // Sick leaves are auto-approved for safety, but with warning if critical
    let statusDecision = 'Approved';
    if (type === 'Sick Leave') {
      statusDecision = 'Approved';
    } else if (risk === 'Critical' || risk === 'High') {
      statusDecision = 'Pending Review';
    } else if (duration > 3) {
      statusDecision = 'Pending Review';
    }

    return {
      projectsAffected: pAffected,
      jirasAffected: jAffected,
      milestonesAffected: mAffected,
      resourceShortage: shortageText,
      riskIncrease: risk,
      riskReasons,
      status: statusDecision
    };
  },

  /**
   * Run real-time impact assessment during input changes and show on the page
   */
  triggerLiveImpactAnalysis() {
    const empSelect = document.getElementById('m-leave-name');
    const startInput = document.getElementById('m-leave-start');
    const endInput = document.getElementById('m-leave-end');
    const typeSelect = document.getElementById('m-leave-type');

    // UI elements to update
    const uiPrjList = document.getElementById('impact-projects-list');
    const uiJiraList = document.getElementById('impact-jiras-list');
    const uiMilestoneList = document.getElementById('impact-milestones-list');
    const uiShortage = document.getElementById('impact-shortage-metric');
    const uiRisk = document.getElementById('impact-risk-badge');
    const uiStatus = document.getElementById('impact-approval-status');
    const uiExplanation = document.getElementById('impact-explanation');

    if (!empSelect || !startInput || !endInput) return;

    const emp = empSelect.value;
    const start = startInput.value;
    const end = endInput.value;
    const type = typeSelect ? typeSelect.value : 'Annual Leave';

    if (!emp || !start || !end) {
      if (uiExplanation) uiExplanation.textContent = 'Select an employee, start/end dates to run impact simulation.';
      return;
    }

    const impact = this.analyzeLeaveImpact(emp, start, end, type);

    // Update Projects list
    if (uiPrjList) {
      uiPrjList.innerHTML = impact.projectsAffected
        .map(p => `<span class="badge bg-light text-dark border px-2 py-1" style="font-size: 0.75rem;">${p}</span>`)
        .join(' ');
    }

    // Update Jiras list
    if (uiJiraList) {
      uiJiraList.innerHTML = impact.jirasAffected
        .map(j => `<div style="font-size: 0.8rem; margin-bottom: 2px;"><i class="fa-solid fa-square-check text-info me-1"></i> ${j}</div>`)
        .join('');
    }

    // Update Milestones list
    if (uiMilestoneList) {
      uiMilestoneList.innerHTML = impact.milestonesAffected
        .map(m => `<div style="font-size: 0.8rem; margin-bottom: 2px;"><i class="fa-solid fa-flag text-warning me-1"></i> ${m}</div>`)
        .join('');
    }

    // Update Capacity shortage text
    if (uiShortage) {
      uiShortage.textContent = impact.resourceShortage;
    }

    // Update Risk Badge
    if (uiRisk) {
      uiRisk.textContent = impact.riskIncrease;
      uiRisk.className = 'badge px-2 py-1';
      if (impact.riskIncrease === 'Low') {
        uiRisk.classList.add('bg-success-subtle', 'text-success');
      } else if (impact.riskIncrease === 'Medium') {
        uiRisk.classList.add('bg-warning-subtle', 'text-warning');
      } else {
        uiRisk.classList.add('bg-danger-subtle', 'text-danger');
      }
    }

    // Update status
    if (uiStatus) {
      uiStatus.textContent = impact.status;
      uiStatus.className = 'badge px-2 py-1';
      if (impact.status === 'Approved') {
        uiStatus.classList.add('bg-success');
      } else {
        uiStatus.classList.add('bg-warning');
      }
    }

    // Update Explanation text
    if (uiExplanation) {
      if (impact.riskReasons && impact.riskReasons.length > 0) {
        uiExplanation.innerHTML = impact.riskReasons.map(r => `• ${r}`).join('<br>');
      } else {
        uiExplanation.textContent = 'Safe coverage! No structural team overlaps or scheduling blocks detected.';
      }
    }
  },

  /**
   * Handle form submission to insert a leave request
   */
  handleFormSubmit() {
    const employee = document.getElementById('m-leave-name')?.value || '';
    const type = document.getElementById('m-leave-type')?.value || 'Annual Leave';
    const start = document.getElementById('m-leave-start')?.value || '';
    const end = document.getElementById('m-leave-end')?.value || '';
    const reason = document.getElementById('m-leave-reason')?.value || '';

    if (!employee || !start || !end || !reason) {
      this.app.showToast('Please fill out all leave request fields', 'warning');
      return;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (endDate < startDate) {
      this.app.showToast('End Date cannot precede the Start Date', 'danger');
      return;
    }

    // Business Days duration calculation
    let count = 0;
    let curDate = new Date(startDate);
    while (curDate <= endDate) {
      const dayOfWeek = curDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // skip Sat & Sun
        count++;
      }
      curDate.setDate(curDate.getDate() + 1);
    }
    const days = count > 0 ? count : 1;

    // Run dynamic evaluation rules
    const impact = this.analyzeLeaveImpact(employee, start, end, type);

    const leaveId = `LV00${this.leaves.length + 1}`;
    const newLeave = {
      id: leaveId,
      name: employee,
      type,
      start,
      end,
      days,
      reason,
      status: impact.status,
      projectsAffected: impact.projectsAffected,
      jirasAffected: impact.jirasAffected,
      milestonesAffected: impact.milestonesAffected,
      resourceShortage: impact.resourceShortage,
      riskIncrease: impact.riskIncrease
    };

    this.leaves.unshift(newLeave);
    this.saveLeaves();

    this.app.showToast(`Time off log ${leaveId} created (${impact.status})`, 'success');

    // Clear inputs
    const reasonEl = document.getElementById('m-leave-reason');
    if (reasonEl) reasonEl.value = '';

    // Refresh everything
    this.recalculateAndRender();
    this.triggerLiveImpactAnalysis();
  },

  /**
   * Recalculate metrics, update cards, visual calendar, conflict panel and registry
   */
  recalculateAndRender() {
    this.renderKPICards();
    this.renderCalendar();
    this.renderConflictsPanel();
    this.renderLeavesTable();
  },

  /**
   * Handles button actions (Approve, Reject, Delete)
   */
  handleTableAction(action, leaveId) {
    const idx = this.leaves.findIndex(l => l.id === leaveId);
    if (idx === -1) return;

    if (action === 'approve') {
      this.leaves[idx].status = 'Approved';
      this.app.showToast(`Leave request ${leaveId} approved successfully`, 'success');
    } else if (action === 'reject') {
      this.leaves[idx].status = 'Rejected';
      this.app.showToast(`Leave request ${leaveId} rejected`, 'info');
    } else if (action === 'delete') {
      if (confirm(`Are you sure you want to delete leave request ${leaveId}?`)) {
        this.leaves.splice(idx, 1);
        this.app.showToast(`Leave request ${leaveId} removed`, 'warning');
      }
    }

    this.saveLeaves();
    this.recalculateAndRender();
  },

  /**
   * Renders Leave KPI Card elements
   */
  renderKPICards() {
    // 1. Total Registered Leaves Days Sum
    const approvedLeaves = this.leaves.filter(l => l.status === 'Approved');
    const totalDays = approvedLeaves.reduce((sum, l) => sum + l.days, 0);

    // 2. Active Overlap Conflicts Count
    // Any overlap within same department
    let conflictsCount = 0;
    const processedPairs = new Set();

    this.leaves.forEach(l1 => {
      if (l1.status !== 'Rejected') {
        const r1 = this.resources.find(r => r.name === l1.name);
        if (!r1) return;

        this.leaves.forEach(l2 => {
          if (l2.status !== 'Rejected' && l1.id !== l2.id) {
            const r2 = this.resources.find(r => r.name === l2.name);
            if (!r2) return;

            // Check if same dept, same dates overlap
            if (r1.dept === r2.dept) {
              const start1 = new Date(l1.start);
              const end1 = new Date(l1.end);
              const start2 = new Date(l2.start);
              const end2 = new Date(l2.end);

              if (start1 <= end2 && end1 >= start2) {
                const pairId = [l1.id, l2.id].sort().join('-');
                if (!processedPairs.has(pairId)) {
                  processedPairs.add(pairId);
                  conflictsCount++;
                }
              }
            }
          }
        });
      }
    });

    // Update KPI Text
    const daysEl = document.getElementById('leave-kpi-days');
    const conflictsEl = document.getElementById('leave-kpi-conflicts');
    const capacityEl = document.getElementById('leave-kpi-capacity');

    if (daysEl) daysEl.textContent = `${totalDays} Days`;
    if (conflictsEl) {
      conflictsEl.textContent = `${conflictsCount} Active`;
      if (conflictsCount > 0) {
        conflictsEl.style.color = 'var(--brand-danger)';
        const card = conflictsEl.closest('.kpi-card');
        if (card) card.style.borderColor = 'var(--brand-danger)';
      } else {
        conflictsEl.style.color = 'var(--text-primary)';
        const card = conflictsEl.closest('.kpi-card');
        if (card) card.style.borderColor = 'var(--border-color)';
      }
    }

    if (capacityEl) {
      // Average available department capacity index (e.g. 85%)
      // If we have 5 resources total, and some are on leave this month
      const activeThisMonthCount = this.leaves
        .filter(l => l.status === 'Approved' && (l.start.includes(this.selectedMonth) || l.end.includes(this.selectedMonth)))
        .reduce((sum, l) => sum + l.days, 0);

      const totalDeptDaysPossible = this.resources.length * 21; // 21 working days approx
      const capacityIndex = Math.max(0, Math.round(((totalDeptDaysPossible - activeThisMonthCount) / totalDeptDaysPossible) * 100));

      capacityEl.textContent = `${capacityIndex}%`;
    }
  },

  /**
   * Renders the visual horizontal Gantt-style Leave Calendar Grid
   */
  renderCalendar() {
    const calendarContainer = document.getElementById('leave-calendar-grid');
    if (!calendarContainer) return;

    calendarContainer.innerHTML = '';

    // Setup dates for selected month
    const [year, month] = this.selectedMonth.split('-').map(Number);
    const dateObj = new Date(year, month - 1, 1);
    const monthName = dateObj.toLocaleString('default', { month: 'long' });
    const numDays = new Date(year, month, 0).getDate();

    // Create Calendar Table Elements
    const wrapper = document.createElement('div');
    wrapper.className = 'table-responsive';
    wrapper.style.border = '1px solid var(--border-color)';
    wrapper.style.borderRadius = 'var(--border-radius-sm)';
    wrapper.style.backgroundColor = 'var(--bg-card)';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '0.8rem';

    // 1. Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = 'var(--bg-main)';
    headerRow.style.borderBottom = '2px solid var(--border-color)';

    // Col 1: Employee name
    const empTh = document.createElement('th');
    empTh.textContent = 'Employee';
    empTh.style.padding = '10px 12px';
    empTh.style.minWidth = '140px';
    empTh.style.position = 'sticky';
    empTh.style.left = '0';
    empTh.style.backgroundColor = 'var(--bg-main)';
    empTh.style.zIndex = '2';
    headerRow.appendChild(empTh);

    // Days cols (1 to numDays)
    for (let day = 1; day <= numDays; day++) {
      const dayTh = document.createElement('th');
      dayTh.className = 'text-center';
      
      // Highlight weekends
      const curDate = new Date(year, month - 1, day);
      const isWeekend = curDate.getDay() === 0 || curDate.getDay() === 6;

      dayTh.innerHTML = `<div style="font-weight: 700;">${day}</div><div style="font-size: 0.65rem; font-weight: normal; color: var(--text-muted);">${curDate.toLocaleString('default', { weekday: 'narrow' })}</div>`;
      dayTh.style.minWidth = '30px';
      dayTh.style.padding = '4px';
      dayTh.style.borderLeft = '1px solid var(--border-color)';
      if (isWeekend) {
        dayTh.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
      }
      headerRow.appendChild(dayTh);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 2. Rows for each employee
    const tbody = document.createElement('tbody');
    this.resources.forEach(res => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';

      const nameTd = document.createElement('td');
      nameTd.style.padding = '8px 12px';
      nameTd.style.position = 'sticky';
      nameTd.style.left = '0';
      nameTd.style.backgroundColor = 'var(--bg-card)';
      nameTd.style.zIndex = '2';
      nameTd.style.borderRight = '1px solid var(--border-color)';
      nameTd.innerHTML = `<div class="font-bold">${res.name}</div><div class="text-secondary" style="font-size: 0.7rem;">${res.role} • ${res.dept}</div>`;
      tr.appendChild(nameTd);

      // Render cells for each day
      for (let day = 1; day <= numDays; day++) {
        const cellTd = document.createElement('td');
        cellTd.style.borderLeft = '1px solid var(--border-color)';
        cellTd.style.padding = '0';
        cellTd.style.height = '42px';
        cellTd.style.position = 'relative';

        const curDate = new Date(year, month - 1, day);
        const isWeekend = curDate.getDay() === 0 || curDate.getDay() === 6;
        if (isWeekend) {
          cellTd.style.backgroundColor = 'rgba(0, 0, 0, 0.03)';
        }

        // Check if employee has an active approved or pending leave on this date
        const activeLeave = this.leaves.find(l => {
          if (l.name === res.name && l.status !== 'Rejected') {
            const lStart = new Date(l.start);
            lStart.setHours(0,0,0,0);
            const lEnd = new Date(l.end);
            lEnd.setHours(0,0,0,0);
            
            const compareDate = new Date(curDate);
            compareDate.setHours(0,0,0,0);
            
            return compareDate >= lStart && compareDate <= lEnd;
          }
          return false;
        });

        if (activeLeave) {
          const block = document.createElement('div');
          block.style.position = 'absolute';
          block.style.top = '4px';
          block.style.bottom = '4px';
          block.style.left = '2px';
          block.style.right = '2px';
          block.style.borderRadius = '4px';
          block.style.display = 'flex';
          block.style.alignItems = 'center';
          block.style.justifyContent = 'center';
          block.style.fontSize = '0.65rem';
          block.style.fontWeight = '700';
          block.style.cursor = 'help';
          block.title = `${activeLeave.name}: ${activeLeave.type} (${activeLeave.start} to ${activeLeave.end}) - ${activeLeave.reason}`;

          // Style based on Category & Status
          if (activeLeave.status === 'Pending Review') {
            block.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
            block.style.border = '1px dashed var(--brand-warning)';
            block.style.color = 'var(--brand-warning)';
            block.innerHTML = `<i class="fa-solid fa-hourglass-half" style="font-size: 0.75rem;"></i>`;
          } else {
            // Approved
            if (activeLeave.type.includes('Sick')) {
              block.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
              block.style.color = 'var(--brand-danger)';
              block.style.border = '1px solid rgba(239, 68, 68, 0.3)';
              block.innerHTML = `<i class="fa-solid fa-house-medical" style="font-size: 0.75rem;"></i>`;
            } else if (activeLeave.type.includes('Personal')) {
              block.style.backgroundColor = 'rgba(6, 182, 212, 0.15)';
              block.style.color = 'var(--brand-info)';
              block.style.border = '1px solid rgba(6, 182, 212, 0.3)';
              block.innerHTML = `<i class="fa-solid fa-user-tag" style="font-size: 0.75rem;"></i>`;
            } else {
              // Vacation / Annual
              block.style.backgroundColor = 'rgba(79, 70, 229, 0.15)';
              block.style.color = 'var(--brand-primary)';
              block.style.border = '1px solid rgba(79, 70, 229, 0.3)';
              block.innerHTML = `<i class="fa-solid fa-umbrella-beach" style="font-size: 0.75rem;"></i>`;
            }
          }
          cellTd.appendChild(block);
        }

        tr.appendChild(cellTd);
      }
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    calendarContainer.appendChild(wrapper);

    // Render title label for Calendar month
    const calendarLabel = document.getElementById('leave-calendar-month-label');
    if (calendarLabel) {
      calendarLabel.textContent = `${monthName} ${year}`;
    }
  },

  /**
   * Evaluates active overlaps and renders Conflict list card
   */
  renderConflictsPanel() {
    const conflictsList = document.getElementById('leave-conflicts-list');
    if (!conflictsList) return;

    conflictsList.innerHTML = '';

    // Active conflicts analysis
    const list = [];
    const processedPairs = new Set();

    this.leaves.forEach(l1 => {
      if (l1.status !== 'Rejected') {
        const r1 = this.resources.find(r => r.name === l1.name);
        if (!r1) return;

        this.leaves.forEach(l2 => {
          if (l2.status !== 'Rejected' && l1.id !== l2.id) {
            const r2 = this.resources.find(r => r.name === l2.name);
            if (!r2) return;

            // Check department overlap
            if (r1.dept === r2.dept) {
              const start1 = new Date(l1.start);
              const end1 = new Date(l1.end);
              const start2 = new Date(l2.start);
              const end2 = new Date(l2.end);

              if (start1 <= end2 && end1 >= start2) {
                const pairId = [l1.id, l2.id].sort().join('-');
                if (!processedPairs.has(pairId)) {
                  processedPairs.add(pairId);

                  // Calculate overlap intersection dates
                  const maxStart = new Date(Math.max(start1, start2));
                  const minEnd = new Date(Math.min(end1, end2));
                  const formatOverDate = `${maxStart.toISOString().split('T')[0]} to ${minEnd.toISOString().split('T')[0]}`;

                  list.push({
                    type: 'Overlapping Department Absences',
                    title: `${r1.dept} Capacity Risk`,
                    desc: `<strong>${l1.name}</strong> (${l1.type}) and <strong>${l2.name}</strong> (${l2.type}) are away at the same time during ${formatOverDate}.`,
                    severity: 'High',
                    badge: `${r1.dept} Alert`
                  });
                }
              }
            }
          }
        });
      }
    });

    // Check for single resource departments (critical role absence)
    this.resources.forEach(res => {
      const hasSupervisorRole = res.role.toLowerCase().includes('lead') || res.role.toLowerCase().includes('manager');
      if (hasSupervisorRole) {
        const activeSupervisorLeaves = this.leaves.filter(l => l.name === res.name && l.status === 'Approved' && l.days >= 3);
        activeSupervisorLeaves.forEach(l => {
          list.push({
            type: 'Supervisor Absence Block',
            title: `Critical Role Void: ${res.role}`,
            desc: `<strong>${res.name}</strong> is away for ${l.days} days starting ${l.start}. Critical project milestones and approvals may stall.`,
            severity: 'Medium',
            badge: 'Supervisor Void'
          });
        });
      }
    });

    if (list.length === 0) {
      conflictsList.innerHTML = `
        <div class="text-center py-4 text-muted" style="font-size: 0.85rem;">
          <i class="fa-solid fa-circle-check text-success d-block mb-2" style="font-size: 1.75rem;"></i>
          No staffing conflicts or capacity blocks detected for this timeline.
        </div>
      `;
      return;
    }

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'p-3 mb-2 border rounded d-flex align-items-start gap-3';
      card.style.backgroundColor = 'var(--bg-main)';
      
      const badgeColor = item.severity === 'High' ? 'bg-danger' : 'bg-warning';
      const icon = item.severity === 'High' ? 'fa-triangle-exclamation text-danger' : 'fa-circle-exclamation text-warning';

      card.innerHTML = `
        <div style="font-size: 1.2rem; margin-top: 2px;">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="flex-grow-1">
          <div class="d-flex justify-content-between align-items-center">
            <h6 class="font-bold m-0" style="font-size: 0.85rem; color: var(--text-primary);">${item.title}</h6>
            <span class="badge ${badgeColor} px-2 py-0.5" style="font-size: 0.7rem;">${item.badge}</span>
          </div>
          <p class="m-0 text-secondary mt-1" style="font-size: 0.8rem; line-height: 1.4;">${item.desc}</p>
        </div>
      `;
      conflictsList.appendChild(card);
    });
  },

  /**
   * Renders the leaves registry table lists with query filters
   */
  renderLeavesTable() {
    const tableBody = document.getElementById('leaves-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    // Apply filters
    let filtered = this.leaves;
    if (this.searchQuery) {
      filtered = this.leaves.filter(l => 
        l.name.toLowerCase().includes(this.searchQuery) ||
        l.type.toLowerCase().includes(this.searchQuery) ||
        (l.reason && l.reason.toLowerCase().includes(this.searchQuery)) ||
        l.status.toLowerCase().includes(this.searchQuery)
      );
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-5 text-muted">
            <i class="fa-solid fa-folder-open mb-2 d-block" style="font-size: 2rem; opacity: 0.4;"></i>
            No leave records matches your search query.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(l => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';

      // Badges
      let statusClass = 'bg-success';
      if (l.status === 'Pending Review') statusClass = 'bg-warning text-dark';
      if (l.status === 'Rejected') statusClass = 'bg-danger';

      const riskClass = l.riskIncrease === 'High' || l.riskIncrease === 'Critical' ? 'color: var(--brand-danger); font-weight: 700;' : '';

      // Projects & Jiras display string
      const prjsStr = l.projectsAffected && l.projectsAffected.length > 0 
        ? l.projectsAffected.map(p => `<span class="badge bg-light text-dark border px-1.5 py-0.5 font-bold" style="font-size: 0.7rem; border-color: var(--border-color);">${p}</span>`).join(' ')
        : '-';

      const jirasStr = l.jirasAffected && l.jirasAffected.length > 0
        ? l.jirasAffected.map(j => j.split(' ')[0]).join(', ')
        : '-';

      // Inline action buttons based on current state
      let actionsHtml = '';
      if (l.status === 'Pending Review') {
        actionsHtml = `
          <button class="btn btn-xs btn-outline-success leave-action-btn" data-action="approve" data-id="${l.id}" title="Approve Request" style="font-size: 0.7rem; padding: 2px 6px;">
            <i class="fa-solid fa-check"></i>
          </button>
          <button class="btn btn-xs btn-outline-danger leave-action-btn" data-action="reject" data-id="${l.id}" title="Reject Request" style="font-size: 0.7rem; padding: 2px 6px; margin-left: 2px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        `;
      } else {
        actionsHtml = `
          <button class="btn btn-sm text-danger leave-action-btn" data-action="delete" data-id="${l.id}" title="Delete Record" style="background: none; border: none; padding: 0;">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        `;
      }

      tr.innerHTML = `
        <td style="padding: 12px 16px;">
          <div style="font-weight: 700; color: var(--brand-primary);">${l.id}</div>
        </td>
        <td>
          <div class="font-bold text-primary">${l.name}</div>
          <div class="text-secondary" style="font-size: 0.75rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${l.reason || '-'}">${l.reason || '-'}</div>
        </td>
        <td>
          <div style="font-size: 0.85rem; font-weight: 600;">${l.type}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); ${riskClass}">Risk: ${l.riskIncrease || 'Low'}</div>
        </td>
        <td style="font-size: 0.85rem;">
          <div>${l.start} to ${l.end}</div>
          <div class="text-muted" style="font-size: 0.7rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Jiras: ${jirasStr}">Jiras: ${jirasStr}</div>
        </td>
        <td>
          <div class="font-bold">${l.days} Business Days</div>
          <div class="d-flex gap-1 flex-wrap mt-0.5">${prjsStr}</div>
        </td>
        <td>
          <div class="d-flex align-items-center justify-content-between gap-2">
            <span class="badge ${statusClass} rounded-pill px-2.5 py-1" style="font-size: 0.75rem;">${l.status}</span>
            <div class="d-flex align-items-center">${actionsHtml}</div>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  },

  /**
   * Load a comprehensive sample logs database for demonstration
   */
  loadSampleData() {
    const samples = [
      { 
        id: 'LV-S1', 
        name: 'Alice Smith', 
        type: 'Annual Leave', 
        start: '2026-08-10', 
        end: '2026-08-15', 
        days: 5, 
        reason: 'Family trip to Disneyland', 
        status: 'Approved',
        projectsAffected: ['PRJ001', 'PRJ002'],
        jirasAffected: ['ARES-310 (Replication DB Setup)', 'ZEUS-405 (Microservice Endpoint Firewall)'],
        milestonesAffected: ['Project Ares Migration Phase'],
        resourceShortage: 'Engineering department at 66% capacity',
        riskIncrease: 'Medium'
      },
      { 
        id: 'LV-S2', 
        name: 'David Miller', 
        type: 'Sick Leave', 
        start: '2026-07-28', 
        end: '2026-07-30', 
        days: 3, 
        reason: 'Medical wisdom extraction procedure', 
        status: 'Approved',
        projectsAffected: ['PRJ001'],
        jirasAffected: ['ARES-212 (CORS Routing Filters)'],
        milestonesAffected: ['Harness testing suite prep'],
        resourceShortage: 'QA department at 0% capacity',
        riskIncrease: 'High'
      },
      { 
        id: 'LV-S3', 
        name: 'Bob Johnson', 
        type: 'Annual Leave', 
        start: '2026-07-29', 
        end: '2026-08-04', 
        days: 5, 
        reason: 'Friend weddings out of state', 
        status: 'Pending Review',
        projectsAffected: ['PRJ001'],
        jirasAffected: ['ARES-310 (Replication DB Setup)'],
        milestonesAffected: ['Ares sprint release cycle'],
        resourceShortage: 'Engineering department capacity overlaps with Alice Smith (Critical)',
        riskIncrease: 'Critical'
      },
      { 
        id: 'LV-S4', 
        name: 'Clara Oswald', 
        type: 'Personal Day', 
        start: '2026-07-14', 
        end: '2026-07-15', 
        days: 2, 
        reason: 'Renewing personal driver license and visa updates', 
        status: 'Approved',
        projectsAffected: ['PRJ003'],
        jirasAffected: ['HRM-112 (Router Maps Optimizations)'],
        milestonesAffected: ['Figma UI mocks handoff'],
        resourceShortage: 'Design department at 0% capacity',
        riskIncrease: 'Medium'
      },
      { 
        id: 'LV-S5', 
        name: 'Elena Rostova', 
        type: 'Annual Leave', 
        start: '2026-09-01', 
        end: '2026-09-08', 
        days: 6, 
        reason: 'Late summer retreat to Europe', 
        status: 'Approved',
        projectsAffected: ['PRJ001'],
        jirasAffected: ['ARES-104'],
        milestonesAffected: ['Demeter agro sensors backlog pruning'],
        resourceShortage: 'Product Management covered by David Miller',
        riskIncrease: 'Medium'
      }
    ];

    this.leaves = samples;
    this.saveLeaves();
    this.app.showToast('Pre-populated Enterprise Leave logs loaded with active capacity conflict!', 'success');
    this.recalculateAndRender();
  },

  /**
   * Reset data back to empty
   */
  resetData() {
    this.leaves = [];
    this.saveLeaves();
    this.app.showToast('Leave logs registry database wiped successfully.', 'info');
    this.recalculateAndRender();
    this.triggerLiveImpactAnalysis();
  }
};
