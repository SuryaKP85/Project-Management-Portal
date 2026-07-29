/* forecastEngine.js - Modular Forecast Engine with automatic day-by-day timeline simulators */

import { Storage } from './storage.js';
import { Calculations } from './calculations.js';

export const ForecastEngineModule = {
  app: null,
  projects: [],
  leaves: [],
  weekendLogs: [],
  estimates: {},
  timeLogs: [],
  activeProjectId: '',
  searchQuery: '',
  currentHealthFilter: 'all',

  /**
   * Initialize the Forecast Engine Module
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;

    // Load data dependencies from storage
    this.loadData();

    // Setup event handlers for form, filters, search
    this.setupEventListeners();

    // Populate the dropdown selector in the sidebar
    this.populateProjectSelector();

    // Run automatic forecasts for all projects
    this.recalculateAllAndRender();
  },

  /**
   * Load required datasets from storage or sync with central app
   */
  loadData() {
    this.projects = Storage.get('projects') || this.app.projectsList || [];
    this.leaves = Storage.get('leaves') || this.app.leavesList || [];
    this.weekendLogs = Storage.get('weekend_logs') || this.app.weekendLogsList || [];
    
    // Load time logging matrices
    this.timeLogs = Storage.get('time_logs') || [];
    this.estimates = Storage.get('project_dept_estimates') || {
      'PRJ001': { 'Engineering': 120, 'Design': 60, 'QA / Test': 50, 'Product': 30 },
      'PRJ002': { 'Engineering': 220, 'Design': 100, 'QA / Test': 80, 'Product': 50 },
      'PRJ003': { 'Engineering': 80, 'Design': 30, 'QA / Test': 30, 'Product': 20 },
      'PRJ004': { 'Engineering': 180, 'Design': 70, 'QA / Test': 60, 'Product': 40 },
      'PRJ005': { 'Engineering': 100, 'Design': 50, 'QA / Test': 40, 'Product': 20 }
    };

    // Ensure state synchrony back to central app
    this.app.projectsList = this.projects;
  },

  /**
   * Populates the sidebar simulator project selection box
   */
  populateProjectSelector() {
    const selectEl = document.getElementById('forecast-sim-project');
    if (!selectEl) return;

    selectEl.innerHTML = '';
    
    if (this.projects.length === 0) {
      selectEl.innerHTML = '<option value="">No Projects Found...</option>';
      return;
    }

    this.projects.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = `${p.id} - ${p.name}`;
      selectEl.appendChild(option);
    });

    // Set first project as active by default if none selected
    if (!this.activeProjectId && this.projects.length > 0) {
      this.activeProjectId = this.projects[0].id;
    }

    selectEl.value = this.activeProjectId;
    this.loadProjectToSimulator(this.activeProjectId);
  },

  /**
   * Formats and loads a project's real state into the simulator panel
   * @param {string} projectId 
   */
  loadProjectToSimulator(projectId) {
    const p = this.projects.find(proj => proj.id === projectId);
    if (!p) return;

    this.activeProjectId = projectId;

    // Calculate auto-derived hours
    const autoHours = this.getProjectRemainingHours(p);
    
    const remInput = document.getElementById('forecast-sim-rem-hours');
    const autoLabel = document.getElementById('forecast-sim-auto-hours');
    const capInput = document.getElementById('forecast-sim-capacity');
    
    if (remInput) {
      remInput.value = autoHours;
    }
    if (autoLabel) {
      autoLabel.textContent = `Auto-derived from timesheet: ${autoHours} hrs`;
    }

    // Default daily capacity based on developer allocation or 8h standard
    if (capInput) {
      const devName = p.developer;
      const resources = Storage.get('resources') || this.app.resourcesList || [];
      const res = resources.find(r => r.name.toLowerCase() === (devName || '').toLowerCase());
      if (res) {
        // e.g. 8 hours * allocation percent
        const cap = Math.max(1, Math.round((res.allocation / 100) * 8));
        capInput.value = cap;
      } else {
        capInput.value = 8;
      }
    }

    // Load dynamic info for Resource & Leaves
    const resDetails = document.getElementById('forecast-sim-resource-details');
    if (resDetails) {
      const devName = p.developer || 'No Developer Assigned';
      const devLeaves = this.leaves.filter(l => l.name.toLowerCase() === devName.toLowerCase() && l.status === 'approved');
      if (devLeaves.length > 0) {
        resDetails.innerHTML = `<span class="text-warning font-bold"><i class="fa-solid fa-plane-departure text-warning me-1"></i> ${devName} has ${devLeaves.length} scheduled leave block(s)</span>`;
      } else {
        resDetails.innerHTML = `<span class="text-success font-semibold"><i class="fa-solid fa-circle-check text-success me-1"></i> ${devName} has no OOO leaves in forecast horizon</span>`;
      }
    }

    // Load dynamic info for Weekend Work standby logs
    const wkDetails = document.getElementById('forecast-sim-weekend-details');
    if (wkDetails) {
      const wkLogs = this.weekendLogs.filter(l => l.project === p.id && l.status === 'Approved');
      const totalWkHrs = wkLogs.reduce((sum, l) => sum + l.hours, 0);
      if (totalWkHrs > 0) {
        wkDetails.innerHTML = `<span class="text-info font-bold"><i class="fa-solid fa-business-time text-info me-1"></i> ${wkLogs.length} approved weekend standby log(s) (${totalWkHrs} Hrs total)</span>`;
      } else {
        wkDetails.innerHTML = `<span class="text-secondary font-semibold"><i class="fa-solid fa-circle-minus text-secondary me-1"></i> No approved weekend standby work scheduled</span>`;
      }
    }

    // Trigger simulator calculations for this project specifically
    this.runSingleForecastSimulation();
  },

  /**
   * Set up UI event handlers
   */
  setupEventListeners() {
    // 1. Selector Change
    const projectSelect = document.getElementById('forecast-sim-project');
    if (projectSelect) {
      projectSelect.addEventListener('change', (e) => {
        this.loadProjectToSimulator(e.target.value);
      });
    }

    // 2. Form Submit
    const form = document.getElementById('forecast-simulator-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.runSingleForecastSimulation();
      });
    }

    // 3. Search table
    const searchInp = document.getElementById('forecast-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderForecastTable();
      });
    }

    // 4. Health pill filters
    const filterContainer = document.getElementById('forecast-table-health-filters');
    if (filterContainer) {
      filterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn) {
          // Update active style
          filterContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          this.currentHealthFilter = btn.getAttribute('data-health');
          this.renderForecastTable();
        }
      });
    }

    // 5. Run Portfolio Forecast
    const runAllBtn = document.getElementById('forecast-btn-run-all');
    if (runAllBtn) {
      runAllBtn.addEventListener('click', () => {
        this.recalculateAllAndRender();
        this.app.showToast('Portfolio-wide forecast simulator synchronized', 'success');
      });
    }

    // 6. Reset Form Defaults
    const resetBtn = document.getElementById('forecast-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Restore default daily capacities and sync project estimates?')) {
          this.loadData();
          this.populateProjectSelector();
          this.recalculateAllAndRender();
          this.app.showToast('Forecast sandbox parameters restored to defaults', 'info');
        }
      });
    }
  },

  /**
   * Helper to calculate a project's remaining hours automatically
   * @param {object} p 
   * @returns {number}
   */
  getProjectRemainingHours(p) {
    let pEst = 0;
    let pLogged = 0;
    const depts = ['Engineering', 'Design', 'QA / Test', 'Product'];

    depts.forEach(dept => {
      pEst += (this.estimates[p.id]?.[dept] || 0);
      pLogged += this.timeLogs
        .filter(l => l.projectId === p.id && l.department === dept)
        .reduce((sum, l) => sum + l.hours, 0);
    });

    if (pEst > 0) {
      return Math.max(0, pEst - pLogged);
    }

    // Return smart progress fallback if estimates aren't seeded yet
    return Math.max(0, Math.round((1 - (p.progress || 0) / 100) * 120));
  },

  /**
   * Calculates the number of business days between two dates
   * @param {Date} d1 
   * @param {Date} d2 
   * @returns {number}
   */
  getBusinessDaysBetween(d1, d2) {
    const start = new Date(d1);
    const end = new Date(d2);
    
    if (start > end) return 0;
    
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  },

  /**
   * Run day-by-day simulation loop to forecast completion
   * @param {object} project 
   * @param {number} remHours 
   * @param {number} dailyCapacity 
   * @param {boolean} respectLeaves 
   * @param {boolean} utilizeWeekends 
   * @returns {object} Simulated timeline results
   */
  simulateProjectTimeline(project, remHours, dailyCapacity, respectLeaves, utilizeWeekends) {
    const todayStr = '2026-07-28'; // Fixed anchor for PM-Portal timeline coherence
    const simStart = new Date(todayStr);

    let remaining = remHours;
    let daysCount = 0;
    let businessDaysCount = 0;
    let totalWeekendHrsApplied = 0;
    let totalLeaveDaysImpacted = 0;
    
    const timelineSteps = [];
    const currentDate = new Date(simStart);

    if (remaining <= 0) {
      return {
        completionDate: simStart,
        calendarDaysRemaining: 0,
        businessDaysRemaining: 0,
        weekendHoursUsed: 0,
        leaveDaysEncountered: 0,
        timelineSteps: []
      };
    }

    // Max 365 iterations loop safety limit
    while (remaining > 0 && daysCount < 365) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

      let workDoneToday = 0;
      let stepReason = '';

      if (isWeekend) {
        if (utilizeWeekends) {
          // Find approved weekend work for this project on this date
          const wkLogs = this.weekendLogs.filter(l => l.project === project.id && l.date === dateStr && l.status === 'Approved');
          if (wkLogs.length > 0) {
            const hrs = wkLogs.reduce((sum, l) => sum + l.hours, 0);
            workDoneToday = Math.min(remaining, hrs);
            remaining -= workDoneToday;
            totalWeekendHrsApplied += workDoneToday;
            stepReason = `Weekend standby work executed (${workDoneToday} hrs completed)`;
          }
        }
      } else {
        businessDaysCount++;

        // Check if developer is on leave today
        let isOnLeave = false;
        if (respectLeaves && project.developer) {
          isOnLeave = this.leaves.some(l => {
            if (l.name.toLowerCase() === project.developer.toLowerCase() && l.status === 'approved') {
              const start = new Date(l.start);
              const end = new Date(l.end);
              // Clear time parts for strict date equivalence
              const sDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
              const eDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
              const cDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
              return cDate >= sDate && cDate <= eDate;
            }
            return false;
          });
        }

        if (isOnLeave) {
          workDoneToday = 0;
          totalLeaveDaysImpacted++;
          stepReason = `Leave Block: ${project.developer} OOO (0 hrs capacity)`;
        } else {
          workDoneToday = Math.min(remaining, dailyCapacity);
          remaining -= workDoneToday;
          stepReason = `Standard business progress (${workDoneToday} hrs completed)`;
        }
      }

      // Record logical milestone step log
      if (workDoneToday > 0 || stepReason.includes('Leave Block')) {
        timelineSteps.push({
          dateLabel: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }),
          dateStr: dateStr,
          work: workDoneToday,
          reason: stepReason,
          rem: remaining,
          isWeekend,
          isLeave: stepReason.includes('Leave Block')
        });
      }

      if (remaining > 0) {
        daysCount++;
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return {
      completionDate: new Date(currentDate),
      calendarDaysRemaining: daysCount,
      businessDaysRemaining: businessDaysCount,
      weekendHoursUsed: totalWeekendHrsApplied,
      leaveDaysEncountered: totalLeaveDaysImpacted,
      timelineSteps: timelineSteps
    };
  },

  /**
   * Evaluates and updates the single sandbox simulator metrics on the right card
   */
  runSingleForecastSimulation() {
    const p = this.projects.find(proj => proj.id === this.activeProjectId);
    if (!p) return;

    // 1. Get input parameter values
    const remHours = parseFloat(document.getElementById('forecast-sim-rem-hours').value) || 0;
    const dailyCapacity = parseFloat(document.getElementById('forecast-sim-capacity').value) || 8;
    const respectLeaves = document.getElementById('forecast-sim-respect-leaves').checked;
    const utilizeWeekends = document.getElementById('forecast-sim-utilize-weekends').checked;

    // 2. Perform simulations (Both nominal and without weekends to derive benefits)
    const result = this.simulateProjectTimeline(p, remHours, dailyCapacity, respectLeaves, utilizeWeekends);
    const resultNoWeekends = this.simulateProjectTimeline(p, remHours, dailyCapacity, respectLeaves, false);

    // 3. Compute derived metrics
    const targetEndDate = new Date(p.estimatedEnd);
    const completionDate = result.completionDate;

    // Days Remaining (Calendar & Business)
    const calDaysRem = result.calendarDaysRemaining;

    // Daily Burn Rate (Hours per calendar day)
    const burnRate = calDaysRem > 0 ? (remHours / calDaysRem).toFixed(1) : '0.0';

    // Schedule Variance (positive means early/on track, negative means delayed)
    const targetMs = targetEndDate.setHours(0,0,0,0);
    const complMs = new Date(completionDate).setHours(0,0,0,0);
    const diffTime = targetMs - complMs;
    const varianceDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Projected Delay
    const delayDays = varianceDays < 0 ? Math.abs(varianceDays) : 0;

    // Effort Variance
    // Total original estimated budget hrs
    let originalEst = 0;
    const depts = ['Engineering', 'Design', 'QA / Test', 'Product'];
    depts.forEach(dept => {
      originalEst += (this.estimates[p.id]?.[dept] || 0);
    });
    if (originalEst === 0) originalEst = 120; // baseline default

    const totalLogged = this.timeLogs
      .filter(l => l.projectId === p.id)
      .reduce((sum, l) => sum + l.hours, 0);

    const projectedTotalEffort = totalLogged + remHours;
    const effortVariance = projectedTotalEffort - originalEst;

    // Capacity Requirement
    // weekday business days between today (2026-07-28) and target end date
    const today = new Date('2026-07-28');
    const bDaysToTarget = this.getBusinessDaysBetween(today, new Date(p.estimatedEnd));
    let requiredCapacity = 'N/A';
    if (bDaysToTarget > 0) {
      requiredCapacity = `${(remHours / bDaysToTarget).toFixed(1)} hrs/day`;
    } else {
      requiredCapacity = 'Overdue';
    }

    // Weekend Benefit (Compare calendars)
    const benefitDays = resultNoWeekends.calendarDaysRemaining - result.calendarDaysRemaining;
    const weekendBenefitText = benefitDays > 0 
      ? `Accelerated delivery by ${benefitDays} calendar days` 
      : 'No timeline acceleration registered';

    // Forecast Health Status
    let health = 'On Track';
    let healthClass = 'bg-success-subtle text-success';
    let healthBorderColor = 'rgba(16, 185, 129, 0.15)';
    let highlightBoxBg = 'rgba(16, 185, 129, 0.05)';
    let highlightBoxTextColor = 'text-success';
    let healthExpl = 'Project completion date satisfies target SLA window.';

    if (delayDays > 7) {
      health = 'Critical';
      healthClass = 'bg-danger-subtle text-danger border border-danger-subtle';
      healthBorderColor = 'rgba(239, 68, 68, 0.2)';
      highlightBoxBg = 'rgba(239, 68, 68, 0.05)';
      highlightBoxTextColor = 'text-danger';
      healthExpl = `Critical backlog delay! Exceeds SLA threshold by ${delayDays} calendar days. Increase capacity immediately.`;
    } else if (delayDays > 0) {
      health = 'At Risk';
      healthClass = 'bg-warning-subtle text-warning border border-warning-subtle';
      healthBorderColor = 'rgba(245, 158, 11, 0.2)';
      highlightBoxBg = 'rgba(245, 158, 11, 0.05)';
      highlightBoxTextColor = 'text-warning';
      healthExpl = `Minor schedule overrun of ${delayDays} calendar day(s). Consider weekend allocations.`;
    }

    // 4. Update DOM Elements
    const hBadge = document.getElementById('forecast-result-health-badge');
    if (hBadge) {
      hBadge.textContent = health.toUpperCase();
      hBadge.className = `badge ${healthClass} px-2.5 py-1 font-bold`;
    }

    const hlBox = document.getElementById('forecast-date-highlight-box');
    if (hlBox) {
      hlBox.style.backgroundColor = highlightBoxBg;
      hlBox.style.borderColor = healthBorderColor;
      
      if (health === 'Critical') {
        hlBox.style.borderLeft = '5px solid var(--brand-danger)';
      } else if (health === 'At Risk') {
        hlBox.style.borderLeft = '5px solid var(--brand-warning)';
      } else {
        hlBox.style.borderLeft = '5px solid var(--brand-success)';
      }
    }

    const resDate = document.getElementById('forecast-res-date');
    if (resDate) {
      resDate.textContent = completionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      resDate.className = `mb-0 font-bold ${highlightBoxTextColor}`;
    }

    const labelVar = document.getElementById('forecast-label-variance');
    const resVar = document.getElementById('forecast-res-variance');
    if (resVar) {
      if (varianceDays >= 0) {
        if (labelVar) labelVar.textContent = 'Ahead of Target';
        resVar.textContent = `+${varianceDays} Calendar Days`;
        resVar.className = 'mb-0 font-bold text-success';
      } else {
        if (labelVar) labelVar.textContent = 'Projected Overrun';
        resVar.textContent = `${Math.abs(varianceDays)} Days Overdue`;
        resVar.className = 'mb-0 font-bold text-danger';
      }
    }

    // 3x3 stats cards
    const daysRemEl = document.getElementById('forecast-res-days-rem');
    if (daysRemEl) daysRemEl.textContent = `${calDaysRem} Days (${result.businessDaysRemaining} Workdays)`;

    const hoursRemEl = document.getElementById('forecast-res-hours-rem');
    if (hoursRemEl) hoursRemEl.textContent = `${remHours} Hrs`;

    const burnEl = document.getElementById('forecast-res-burn-rate');
    if (burnEl) burnEl.textContent = `${burnRate} hrs/day`;

    const effortVarEl = document.getElementById('forecast-res-effort-variance');
    if (effortVarEl) {
      if (effortVariance > 0) {
        effortVarEl.textContent = `+${effortVariance} hrs Overrun`;
        effortVarEl.className = 'font-bold text-danger';
      } else if (effortVariance < 0) {
        effortVarEl.textContent = `${effortVariance} hrs Safe`;
        effortVarEl.className = 'font-bold text-success';
      } else {
        effortVarEl.textContent = '0 hrs Variance';
        effortVarEl.className = 'font-bold text-secondary';
      }
    }

    const delayEl = document.getElementById('forecast-res-delay');
    if (delayEl) {
      if (delayDays > 0) {
        delayEl.textContent = `${delayDays} Calendar Days`;
        delayEl.className = 'font-bold text-danger';
      } else {
        delayEl.textContent = 'No Delay';
        delayEl.className = 'font-bold text-success';
      }
    }

    const capReqEl = document.getElementById('forecast-res-req-capacity');
    if (capReqEl) {
      capReqEl.textContent = requiredCapacity;
      if (requiredCapacity === 'Overdue') {
        capReqEl.className = 'font-bold text-danger';
      } else {
        const numericCap = parseFloat(requiredCapacity) || 0;
        if (numericCap > dailyCapacity) {
          capReqEl.className = 'font-bold text-warning';
        } else {
          capReqEl.className = 'font-bold text-success';
        }
      }
    }

    const wkBenefitEl = document.getElementById('forecast-res-weekend-benefit');
    if (wkBenefitEl) {
      wkBenefitEl.textContent = weekendBenefitText;
      if (benefitDays > 0) {
        wkBenefitEl.className = 'font-bold text-success';
      } else {
        wkBenefitEl.className = 'font-bold text-secondary';
      }
    }

    const explEl = document.getElementById('forecast-res-health-explanation');
    if (explEl) explEl.textContent = healthExpl;

    // Simulation step badges rendering
    const timelineLog = document.getElementById('forecast-timeline-log');
    const timelineStepCount = document.getElementById('forecast-timeline-step-count');
    
    if (timelineLog) {
      timelineLog.innerHTML = '';
      if (result.timelineSteps.length === 0) {
        timelineLog.innerHTML = '<span class="text-xs text-muted font-semibold p-2">No remaining effort to schedule. Simulation idle.</span>';
        if (timelineStepCount) timelineStepCount.textContent = 'Calculated in 0 steps';
        return;
      }

      result.timelineSteps.forEach((step, idx) => {
        const card = document.createElement('div');
        card.className = 'p-2 rounded border text-nowrap d-flex flex-column justify-content-between text-center';
        card.style.minWidth = '130px';
        card.style.backgroundColor = 'var(--bg-card)';
        card.style.borderColor = 'var(--border-color)';

        let headerStyle = 'color: var(--brand-primary); font-weight: 700; font-size: 0.75rem;';
        let bodyBg = 'bg-secondary-subtle';
        let badgeText = `${step.work}h applied`;

        if (step.isLeave) {
          headerStyle = 'color: var(--brand-danger); font-weight: 700; font-size: 0.75rem;';
          bodyBg = 'bg-danger-subtle text-danger';
          badgeText = 'OOO Leave';
        } else if (step.isWeekend) {
          headerStyle = 'color: var(--brand-success); font-weight: 700; font-size: 0.75rem;';
          bodyBg = 'bg-success-subtle text-success';
          badgeText = `WK: +${step.work}h`;
        }

        card.innerHTML = `
          <div style="${headerStyle}" class="border-bottom pb-1 mb-1">${step.dateLabel}</div>
          <div class="text-xs font-semibold text-secondary" style="font-size: 0.7rem; overflow: hidden; text-overflow: ellipsis;" title="${step.reason}">${step.reason}</div>
          <div class="mt-1 pb-0.5"><span class="badge ${bodyBg} font-bold" style="font-size: 0.65rem;">${badgeText}</span></div>
          <div class="text-muted font-bold mt-1" style="font-size: 0.65rem;">Bal: ${step.rem}h</div>
        `;
        timelineLog.appendChild(card);
      });

      if (timelineStepCount) {
        timelineStepCount.textContent = `Calculated in ${result.timelineSteps.length} simulated working checkpoints`;
      }
    }
  },

  /**
   * Run automated simulation checks across ALL projects to compute aggregated portfolio stats and table data
   */
  recalculateAllAndRender() {
    this.loadData();

    // Sum overall portfolio metrics
    let totalBacklogHrs = 0;
    let totalDelayedCount = 0;
    let totalWeekendBenefitDays = 0;
    let totalNominalDailyBurnRate = 0;

    const computedPortfolioForecasts = [];

    this.projects.forEach(p => {
      const remHours = this.getProjectRemainingHours(p);
      totalBacklogHrs += remHours;

      // Default standard capacity parameters for simulation
      const defaultCapacity = 8;
      
      const res = this.simulateProjectTimeline(p, remHours, defaultCapacity, true, true);
      const resNoWeekends = this.simulateProjectTimeline(p, remHours, defaultCapacity, true, false);

      // Save calculated details
      const completionDate = res.completionDate;
      const targetEndDate = new Date(p.estimatedEnd);

      const complMs = new Date(completionDate).setHours(0,0,0,0);
      const targetMs = targetEndDate.setHours(0,0,0,0);
      const varianceDays = Math.ceil((targetMs - complMs) / (1000 * 60 * 60 * 24));
      const delayDays = varianceDays < 0 ? Math.abs(varianceDays) : 0;

      if (delayDays > 0) {
        totalDelayedCount++;
      }

      const benefitDays = resNoWeekends.calendarDaysRemaining - res.calendarDaysRemaining;
      if (benefitDays > 0) {
        totalWeekendBenefitDays += benefitDays;
      }

      const calDaysRem = res.calendarDaysRemaining;
      const burnRateVal = calDaysRem > 0 ? (remHours / calDaysRem) : 0;
      totalNominalDailyBurnRate += burnRateVal;

      let health = 'On Track';
      if (delayDays > 7) {
        health = 'Critical';
      } else if (delayDays > 0) {
        health = 'At Risk';
      }

      // required capacity to hit deadline
      const today = new Date('2026-07-28');
      const bDaysToTarget = this.getBusinessDaysBetween(today, new Date(p.estimatedEnd));
      let requiredCapacity = 'N/A';
      if (bDaysToTarget > 0) {
        requiredCapacity = `${(remHours / bDaysToTarget).toFixed(1)}h/d`;
      } else {
        requiredCapacity = 'Overdue';
      }

      computedPortfolioForecasts.push({
        project: p,
        remHours,
        completionDate,
        varianceDays,
        burnRate: burnRateVal.toFixed(1),
        requiredCapacity,
        health
      });
    });

    // Compute averages
    const avgBurn = this.projects.length > 0 ? (totalNominalDailyBurnRate / this.projects.length).toFixed(1) : '0.0';

    // Update KPI panels on top of the Forecast screen
    const kpiAvgBurn = document.getElementById('forecast-kpi-avg-burn');
    const kpiTotalBacklog = document.getElementById('forecast-kpi-total-backlog');
    const kpiDelayed = document.getElementById('forecast-kpi-delayed');
    const kpiWeekendDays = document.getElementById('forecast-kpi-weekend-days');

    if (kpiAvgBurn) kpiAvgBurn.textContent = `${avgBurn} hrs/day`;
    if (kpiTotalBacklog) kpiTotalBacklog.textContent = `${totalBacklogHrs} Hours`;
    if (kpiDelayed) {
      kpiDelayed.textContent = `${totalDelayedCount} Project(s)`;
      if (totalDelayedCount > 0) {
        kpiDelayed.className = 'kpi-value mb-0 text-danger';
      } else {
        kpiDelayed.className = 'kpi-value mb-0';
      }
    }
    if (kpiWeekendDays) kpiWeekendDays.textContent = `${totalWeekendBenefitDays} Days saved`;

    // Render details to project table
    this.computedPortfolioForecasts = computedPortfolioForecasts;
    this.renderForecastTable();
  },

  /**
   * Render table grid with filtered results
   */
  renderForecastTable() {
    const tbody = document.getElementById('forecast-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    
    if (!this.computedPortfolioForecasts || this.computedPortfolioForecasts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">No forecasting simulations calculated.</td></tr>';
      return;
    }

    // Apply filters
    let filtered = this.computedPortfolioForecasts;

    if (this.currentHealthFilter !== 'all') {
      filtered = filtered.filter(f => f.health === this.currentHealthFilter);
    }

    if (this.searchQuery) {
      filtered = filtered.filter(f => {
        return f.project.name.toLowerCase().includes(this.searchQuery) ||
               f.project.id.toLowerCase().includes(this.searchQuery) ||
               (f.project.manager || '').toLowerCase().includes(this.searchQuery) ||
               (f.project.client || '').toLowerCase().includes(this.searchQuery);
      });
    }

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">No projects match current search or filters.</td></tr>';
      return;
    }

    filtered.forEach(f => {
      const p = f.project;
      
      let healthClass = 'bg-success';
      if (f.health === 'Critical') {
        healthClass = 'bg-danger';
      } else if (f.health === 'At Risk') {
        healthClass = 'bg-warning text-dark';
      }

      // Target Date format
      const targetStr = new Date(p.estimatedEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const forecastStr = f.completionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      // Variance styling
      let varHTML = '';
      if (f.varianceDays >= 0) {
        varHTML = `<span class="text-success font-bold"><i class="fa-solid fa-circle-check"></i> +${f.varianceDays}d</span>`;
      } else {
        varHTML = `<span class="text-danger font-bold"><i class="fa-solid fa-circle-exclamation"></i> ${Math.abs(f.varianceDays)}d behind</span>`;
      }

      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid var(--border-color)';
      
      // Highlight row if currently selected in sandbox simulator
      if (p.id === this.activeProjectId) {
        row.style.backgroundColor = 'rgba(79, 70, 229, 0.04)';
        row.style.borderLeft = '3px solid var(--brand-primary)';
      }

      row.innerHTML = `
        <td style="padding: 12px 16px;">
          <span style="color: var(--brand-primary); font-weight: 700;">${p.id}</span>
          <span class="d-block font-semibold text-secondary" style="font-size: 0.8rem;">${p.name}</span>
        </td>
        <td>
          <span class="font-semibold d-block" style="color: var(--text-primary);">${p.manager || '-'}</span>
          <span class="text-muted text-xs d-block">${p.developer || 'No Dev assigned'}</span>
        </td>
        <td class="text-center text-secondary">${targetStr}</td>
        <td class="text-center font-semibold text-primary" style="font-size: 0.825rem;">${forecastStr}</td>
        <td class="text-center font-bold">${f.remHours}h</td>
        <td class="text-center text-secondary">${f.burnRate}h/d</td>
        <td class="text-center">${varHTML}</td>
        <td class="text-center font-semibold">${f.requiredCapacity}</td>
        <td class="text-center">
          <span class="badge ${healthClass} rounded-pill px-2 py-1 font-bold" style="font-size: 0.7rem;">${f.health}</span>
        </td>
        <td class="text-center">
          <button class="btn-enterprise btn-enterprise-secondary btn-sm font-bold py-1 px-2.5 forecast-btn-inspect" data-project="${p.id}" style="font-size: 0.75rem;">
            <i class="fa-solid fa-chart-line"></i> Inspect
          </button>
        </td>
      `;

      tbody.appendChild(row);
    });

    // Attach listeners to "Inspect" buttons
    tbody.querySelectorAll('.forecast-btn-inspect').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pId = btn.getAttribute('data-project');
        const selector = document.getElementById('forecast-sim-project');
        if (selector) {
          selector.value = pId;
          this.loadProjectToSimulator(pId);
          // Scroll slightly up to the simulator controls for better UX
          const ctrlForm = document.getElementById('forecast-simulator-form');
          if (ctrlForm) {
            ctrlForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
    });
  }
};
