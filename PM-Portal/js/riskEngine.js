/* riskEngine.js - Modular Automatic Risk Engine & Compliance Audit Suite */

import { Storage } from './storage.js';
import { Calculations } from './calculations.js';
import { Filters } from './filters.js';

export const RiskEngineModule = {
  app: null,
  projects: [],
  leaves: [],
  timeLogs: [],
  estimates: {},
  stories: {},       // project_id -> overdue stories count
  escalations: [],   // list of project_id under escalation
  searchQuery: '',
  severityFilter: 'all',

  /**
   * Initialize Risk Engine Page
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;

    // Load data structures
    this.loadData();

    // Setup event handlers
    this.setupEventListeners();

    // Calculate risk matrix and populate visual UI components
    this.recalculateAndRender();
  },

  /**
   * Load required datasets from central storage & sync variables
   */
  loadData() {
    // 1. Projects List
    this.projects = Storage.get('projects') || this.app.projectsList || [];
    
    // 2. Leaves List
    this.leaves = Storage.get('leaves') || this.app.leavesList || [];

    // 3. Time Logs List
    this.timeLogs = Storage.get('time_logs') || [];

    // 4. Department Estimates
    this.estimates = Storage.get('project_dept_estimates') || {};

    // 5. Overdue Backlog Stories
    let storedStories = Storage.get('risk_overdue_stories');
    if (!storedStories || typeof storedStories !== 'object') {
      storedStories = {
        'PRJ001': 3,
        'PRJ002': 0,
        'PRJ003': 0,
        'PRJ004': 5,
        'PRJ005': 1
      };
      Storage.set('risk_overdue_stories', storedStories);
    }
    this.stories = storedStories;

    // 6. Client Escalation Flags
    let storedEscalations = Storage.get('risk_escalations');
    if (!storedEscalations || !Array.isArray(storedEscalations)) {
      storedEscalations = ['PRJ004']; // Default escalation seed
      Storage.set('risk_escalations', storedEscalations);
    }
    this.escalations = storedEscalations;
  },

  /**
   * Write risk state variables to persistent local storage
   */
  saveData() {
    Storage.set('risk_overdue_stories', this.stories);
    Storage.set('risk_escalations', this.escalations);
  },

  /**
   * Register Event Listeners
   */
  setupEventListeners() {
    // Audit Scan button
    const auditBtn = document.getElementById('risk-btn-audit');
    if (auditBtn) {
      auditBtn.addEventListener('click', () => {
        // Play dynamic rotation animation
        const icon = auditBtn.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        
        this.app.showToast('Initiating automatic audit scan across all project and resourcing rosters...', 'info');
        
        setTimeout(() => {
          this.loadData();
          this.recalculateAndRender();
          if (icon) icon.classList.remove('fa-spin');
          this.app.showToast('Automatic risk engine audit audit completed successfully!', 'success');
        }, 600);
      });
    }

    // Reset Defaults button
    const resetBtn = document.getElementById('risk-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all custom project escalations and overdue stories to factory defaults?')) {
          Storage.remove('risk_overdue_stories');
          Storage.remove('risk_escalations');
          this.loadData();
          this.recalculateAndRender();
          this.app.showToast('Risk engine configurations reset to standard baseline.', 'info');
        }
      });
    }

    // Search query box
    const searchInp = document.getElementById('risk-search-input');
    if (searchInp) {
      searchInp.value = this.searchQuery;
      // Remove any existing clone listeners
      const newSearchInp = searchInp.cloneNode(true);
      searchInp.parentNode.replaceChild(newSearchInp, searchInp);

      newSearchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTableReport();
      });
    }

    // Severity level pill filters
    const pillsContainer = document.getElementById('risk-filters-severity-pills');
    if (pillsContainer) {
      const buttons = pillsContainer.querySelectorAll('button');
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.severityFilter = btn.getAttribute('data-severity');
          this.renderTableReport();
        });
      });
    }
  },

  /**
   * Evaluates and computes risk profile for a single project
   * @param {object} proj 
   * @returns {object} { score, severity, flags: [string], likelihood, impact }
   */
  evaluateProjectRisk(proj) {
    const flags = [];
    let totalPoints = 0;

    // 1. Overdue Projects
    // Estimated end is in past AND progress < 100%
    const todayStr = '2026-07-28';
    const isCompleted = proj.status === 'completed';
    if (!isCompleted && proj.estimatedEnd && proj.estimatedEnd < todayStr && proj.progress < 100) {
      flags.push({
        id: 'OVERDUE_PROJECT',
        label: 'Overdue Project Schedule ⚠️',
        desc: `Project past due target date (${proj.estimatedEnd})`
      });
      totalPoints += 15;
    }

    // 2. Overdue Stories
    const overdueStories = this.stories[proj.id] || 0;
    if (overdueStories > 0) {
      flags.push({
        id: 'OVERDUE_STORIES',
        label: 'Overdue Backlog Stories ⚠️',
        desc: `${overdueStories} stories past target sprint date`
      });
      totalPoints += 10;
    }

    // 3. No Developer Allocated
    const hasDev = proj.developer && proj.developer !== 'None' && proj.developer !== 'Unassigned' && proj.developer !== 'Select Employee...';
    if (!hasDev && !isCompleted) {
      flags.push({
        id: 'NO_DEV',
        label: 'No Developer Allocated ⚠️',
        desc: 'Engineering capacity vacancy detected'
      });
      totalPoints += 15;
    }

    // 4. No QA Allocated
    const hasQA = proj.qa && proj.qa !== 'None' && proj.qa !== 'Unassigned' && proj.qa !== 'Select Employee...';
    if (!hasQA && !isCompleted) {
      flags.push({
        id: 'NO_QA',
        label: 'No QA Analyst Allocated ⚠️',
        desc: 'Testing validation bottleneck hazard'
      });
      totalPoints += 15;
    }

    // 5. Pending SOW Status
    if (proj.status === 'planning') {
      flags.push({
        id: 'PENDING_SOW',
        label: 'Pending Statement of Work ⚠️',
        desc: 'Unsigned commercial contract clearance'
      });
      totalPoints += 10;
    }

    // 6. Developer Leave Conflict (Check if Developer is currently on leave on 2026-07-28)
    if (hasDev && !isCompleted) {
      const devLeave = this.leaves.find(l => 
        l.name === proj.developer && 
        l.status === 'Approved' && 
        l.start <= todayStr && 
        l.end >= todayStr
      );
      if (devLeave) {
        flags.push({
          id: 'DEV_LEAVE',
          label: 'Developer on Approved Leave ⚠️',
          desc: `Dev (${proj.developer}) out of office until ${devLeave.end}`
        });
        totalPoints += 10;
      }
    }

    // 7. QA Leave Conflict (Check if QA is currently on leave on 2026-07-28)
    if (hasQA && !isCompleted) {
      const qaLeave = this.leaves.find(l => 
        l.name === proj.qa && 
        l.status === 'Approved' && 
        l.start <= todayStr && 
        l.end >= todayStr
      );
      if (qaLeave) {
        flags.push({
          id: 'QA_LEAVE',
          label: 'QA on Approved Leave ⚠️',
          desc: `QA Analyst (${proj.qa}) out of office until ${qaLeave.end}`
        });
        totalPoints += 10;
      }
    }

    // 8. Over Budget Hours
    // Sum logged hours vs project estimated department hours
    let estHours = 100; // fallback default
    const projEstimates = this.estimates[proj.id];
    if (projEstimates) {
      estHours = Object.values(projEstimates).reduce((sum, h) => sum + (Number(h) || 0), 0);
    }
    const loggedHours = this.timeLogs
      .filter(l => l.project === proj.id)
      .reduce((sum, l) => sum + (Number(l.hours) || 0), 0);

    if (loggedHours > estHours && estHours > 0 && !isCompleted) {
      flags.push({
        id: 'OVER_BUDGET',
        label: 'Over Budget Hours ⚠️',
        desc: `Logged hours (${loggedHours} hrs) exceed budget estimate (${estHours} hrs)`
      });
      totalPoints += 15;
    }

    // 9. No Timesheet Activity in last 14 days
    // Check if there is no logged timesheet entries at all or all entries are older than 14 days
    const projLogs = this.timeLogs.filter(l => l.project === proj.id);
    let noActivity = false;
    if (projLogs.length === 0 && !isCompleted && proj.status !== 'planning' && proj.status !== 'on-hold') {
      noActivity = true;
    } else if (projLogs.length > 0 && !isCompleted && proj.status !== 'planning' && proj.status !== 'on-hold') {
      // Find latest log date
      const dates = projLogs.map(l => new Date(l.date).getTime());
      const maxDate = Math.max(...dates);
      const diffMs = new Date(todayStr).getTime() - maxDate;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 14) {
        noActivity = true;
      }
    }

    if (noActivity) {
      flags.push({
        id: 'NO_ACTIVITY',
        label: 'No Activity in 14 Days ⚠️',
        desc: 'Zero logs recorded on timesheet registry'
      });
      totalPoints += 10;
    }

    // 10. Customer Escalation
    const isEscalated = this.escalations.includes(proj.id);
    if (isEscalated) {
      flags.push({
        id: 'CUSTOMER_ESCALATION',
        label: 'Customer Escalation Ticket ⚠️',
        desc: 'Active escalation registered in customer account'
      });
      totalPoints += 20;
    }

    // Boundary cap 0-100
    const score = Math.min(100, totalPoints);

    // Determine status level
    let severity = 'Low';
    if (score >= 80) severity = 'Critical';
    else if (score >= 60) severity = 'High';
    else if (score >= 30) severity = 'Medium';

    // Map to heatmap coordinates: Likelihood (1-5) & Impact (1-5)
    // Probability based on calculated risk score
    let likelihood = 1;
    if (score >= 80) likelihood = 5;
    else if (score >= 60) likelihood = 4;
    else if (score >= 40) likelihood = 3;
    else if (score >= 20) likelihood = 2;

    // Impact based on financial stakes (budget)
    const budget = Number(proj.budget) || 100000;
    let impact = 1;
    if (budget >= 300000) impact = 5;
    else if (budget >= 200000) impact = 4;
    else if (budget >= 120000) impact = 3;
    else if (budget >= 80000) impact = 2;

    return {
      score,
      severity,
      flags,
      likelihood,
      impact,
      loggedHours,
      estHours
    };
  },

  /**
   * Recalculate KPIs, visual indicators, Heatmap, and Ledger table
   */
  recalculateAndRender() {
    // Pre-calculate evaluation for all projects
    this.evaluatedProjects = this.projects.map(proj => {
      const evaluation = this.evaluateProjectRisk(proj);
      return {
        ...proj,
        riskEval: evaluation
      };
    });

    // 1. Calculate KPI Metrics
    const totalProjects = this.evaluatedProjects.length;
    let sumScores = 0;
    let severeCount = 0; // Critical + High count
    let resourceStrainFailuresCount = 0; // counts NO_DEV, NO_QA, DEV_LEAVE, QA_LEAVE
    let totalScannedChecks = 0;
    let successfulScannedChecks = 0;

    this.evaluatedProjects.forEach(ep => {
      sumScores += ep.riskEval.score;
      if (ep.riskEval.severity === 'Critical' || ep.riskEval.severity === 'High') {
        severeCount++;
      }

      ep.riskEval.flags.forEach(f => {
        if (['NO_DEV', 'NO_QA', 'DEV_LEAVE', 'QA_LEAVE'].includes(f.id)) {
          resourceStrainFailuresCount++;
        }
      });

      // Compliance index metric: ratio of failed checks to total checks
      // Each project is scanned against 10 conditions.
      totalScannedChecks += 10;
      successfulScannedChecks += (10 - ep.riskEval.flags.length);
    });

    const avgRiskScore = totalProjects > 0 ? Math.round(sumScores / totalProjects) : 0;
    const complianceIndexValue = totalScannedChecks > 0 ? Math.round((successfulScannedChecks / totalScannedChecks) * 100) : 100;

    // Render KPIs to DOM
    const kpiAvgScore = document.getElementById('risk-kpi-avg-score');
    const kpiSevereCount = document.getElementById('risk-kpi-severe-count');
    const kpiResourceStrain = document.getElementById('risk-kpi-resource-strain');
    const kpiComplianceRate = document.getElementById('risk-kpi-compliance-rate');
    const kpiScoreColorWrapper = document.getElementById('risk-kpi-score-color');

    if (kpiAvgScore) kpiAvgScore.textContent = `${avgRiskScore} Index`;
    if (kpiSevereCount) kpiSevereCount.textContent = `${severeCount} Project(s)`;
    if (kpiResourceStrain) kpiResourceStrain.textContent = `${resourceStrainFailuresCount} Failure(s)`;
    if (kpiComplianceRate) kpiComplianceRate.textContent = `${complianceIndexValue}% Rate`;

    // Adjust KPI icon background color based on avg score severity
    if (kpiScoreColorWrapper) {
      if (avgRiskScore >= 60) {
        kpiScoreColorWrapper.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        kpiScoreColorWrapper.style.color = 'var(--brand-danger)';
      } else if (avgRiskScore >= 30) {
        kpiScoreColorWrapper.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
        kpiScoreColorWrapper.style.color = 'var(--brand-warning)';
      } else {
        kpiScoreColorWrapper.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
        kpiScoreColorWrapper.style.color = 'var(--brand-success)';
      }
    }

    // 2. Render Interactive Heatmap Matrix
    this.renderHeatmap();

    // 3. Render Audit Indicator Checklist Breakdown
    this.renderIndicatorsBreakdown();

    // 4. Render Table Roster
    this.renderTableReport();
  },

  /**
   * Render Heatmap 5x5 Matrix Layout
   */
  renderHeatmap() {
    const container = document.getElementById('risk-heatmap-grid');
    if (!container) return;

    container.innerHTML = '';

    // Create 25 boxes
    // Row goes from Impact 5 (top) down to 1 (bottom)
    // Column goes from Likelihood 1 (left) up to 5 (right)
    for (let imp = 5; imp >= 1; imp--) {
      for (let lik = 1; lik <= 5; lik++) {
        // Find projects matching this coordinate
        const matchedProjects = this.evaluatedProjects.filter(ep => 
          ep.riskEval.impact === imp && ep.riskEval.likelihood === lik
        );

        // Determine background color and border of this heat zone based on Likelihood * Impact
        const heatFactor = imp * lik;
        let bgStyle = 'rgba(16, 185, 129, 0.08)';
        let borderStyle = '1px solid rgba(16, 185, 129, 0.2)';
        let titleColor = 'var(--brand-success)';

        if (heatFactor >= 16) {
          bgStyle = 'rgba(239, 68, 68, 0.16)';
          borderStyle = '1.5px solid var(--brand-danger)';
          titleColor = 'var(--brand-danger)';
        } else if (heatFactor >= 10) {
          bgStyle = 'rgba(249, 115, 22, 0.14)';
          borderStyle = '1.5px solid #f97316';
          titleColor = '#e15f00';
        } else if (heatFactor >= 5) {
          bgStyle = 'rgba(245, 158, 11, 0.1)';
          borderStyle = '1.5px solid var(--brand-warning)';
          titleColor = '#cc8500';
        }

        const cell = document.createElement('div');
        cell.className = 'p-1.5 rounded d-flex flex-column justify-content-between align-items-stretch position-relative transition-all';
        cell.style.backgroundColor = bgStyle;
        cell.style.border = borderStyle;
        cell.style.minHeight = '58px';

        // Badges container
        let badgesHTML = '';
        if (matchedProjects.length > 0) {
          matchedProjects.forEach(ep => {
            let sevClass = 'bg-success';
            if (ep.riskEval.severity === 'Critical') sevClass = 'bg-danger';
            if (ep.riskEval.severity === 'High') sevClass = 'bg-warning text-dark';
            if (ep.riskEval.severity === 'Medium') sevClass = 'bg-primary';

            badgesHTML += `
              <span class="badge ${sevClass} text-white font-bold text-center px-1 py-0.5" 
                    title="${ep.name} (Risk: ${ep.riskEval.score})" 
                    style="font-size: 0.65rem; cursor: pointer; margin: 1px; display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;"
                    onclick="window.scrollToRiskProject('${ep.id}')">
                ${ep.id}
              </span>
            `;
          });
        }

        cell.innerHTML = `
          <div class="d-flex justify-content-between text-muted" style="font-size: 0.65rem; opacity: 0.85;">
            <span class="font-bold">I:${imp} L:${lik}</span>
            <span class="font-semibold" style="color: ${titleColor};">${heatFactor >= 16 ? 'Critical' : heatFactor >= 10 ? 'High' : heatFactor >= 5 ? 'Med' : 'Low'}</span>
          </div>
          <div class="d-flex flex-wrap gap-1 align-content-start mt-1" style="max-height: 38px; overflow-y: auto;">
            ${badgesHTML || '<span class="text-muted text-center w-100 font-semibold" style="font-size: 0.55rem; opacity: 0.5;">Empty</span>'}
          </div>
        `;

        container.appendChild(cell);
      }
    }

    // Attach global scrollTo helper
    window.scrollToRiskProject = (projId) => {
      const rowElement = document.getElementById(`risk-row-${projId}`);
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight row briefly
        rowElement.style.backgroundColor = 'rgba(79, 70, 229, 0.08)';
        setTimeout(() => {
          rowElement.style.backgroundColor = '';
        }, 1500);
      }
      this.searchQuery = projId.toLowerCase();
      const sBox = document.getElementById('risk-search-input');
      if (sBox) sBox.value = projId;
      this.renderTableReport();
    };
  },

  /**
   * Renders the right hand Checklist / breakdown list showing failures count
   */
  renderIndicatorsBreakdown() {
    const container = document.getElementById('risk-trigger-checklist-container');
    if (!container) return;

    container.innerHTML = '';

    // Defined the 10 failure checks with labels
    const checks = [
      { id: 'OVERDUE_PROJECT', label: 'Overdue Project Schedules', icon: 'fa-calendar-circle-exclamation', color: 'danger' },
      { id: 'OVERDUE_STORIES', label: 'Overdue Backlog Stories', icon: 'fa-list-check', color: 'warning' },
      { id: 'NO_DEV', label: 'No Developer Assigned', icon: 'fa-user-slash', color: 'danger' },
      { id: 'NO_QA', label: 'No QA Analyst Assigned', icon: 'fa-bug-slash', color: 'danger' },
      { id: 'PENDING_SOW', label: 'Pending Statements of Work (SOW)', icon: 'fa-file-signature', color: 'info' },
      { id: 'DEV_LEAVE', label: 'Developer on Approved Leave', icon: 'fa-user-clock', color: 'warning' },
      { id: 'QA_LEAVE', label: 'QA Analyst on Approved Leave', icon: 'fa-plane-departure', color: 'warning' },
      { id: 'OVER_BUDGET', label: 'Over Estimated Project Hours', icon: 'fa-clock', color: 'danger' },
      { id: 'NO_ACTIVITY', label: 'No Timesheet Activity (14 Days)', icon: 'fa-arrow-trend-down', color: 'warning' },
      { id: 'CUSTOMER_ESCALATION', label: 'Active Customer Escalations', icon: 'fa-triangle-exclamation', color: 'danger' }
    ];

    const totalProjects = this.evaluatedProjects.length;

    checks.forEach(chk => {
      // count how many projects have this flag
      const failCount = this.evaluatedProjects.filter(ep => 
        ep.riskEval.flags.some(f => f.id === chk.id)
      ).length;

      const percentage = totalProjects > 0 ? Math.round((failCount / totalProjects) * 100) : 0;
      
      const itemRow = document.createElement('div');
      itemRow.className = 'mb-2.5 p-2 rounded border d-flex flex-column gap-1.5';
      itemRow.style.backgroundColor = 'var(--bg-main)';
      itemRow.style.borderColor = 'var(--border-color)';

      itemRow.innerHTML = `
        <div class="d-flex justify-content-between align-items-center text-xs">
          <div class="d-flex align-items-center gap-2">
            <span class="text-${chk.color}-custom font-bold" style="color: var(--brand-${chk.color === 'danger' ? 'danger' : chk.color === 'warning' ? 'warning' : 'primary'}); font-size: 0.9rem;">
              <i class="fa-solid ${chk.icon}"></i>
            </span>
            <span class="font-bold text-primary">${chk.label}</span>
          </div>
          <div class="font-semibold text-secondary">
            ${failCount} / ${totalProjects} ${failCount > 0 ? '⚠️' : '✅'}
          </div>
        </div>
        <div class="progress" style="height: 5px; background-color: var(--border-color); border-radius: 10px;">
          <div class="progress-bar bg-${chk.color}" role="progressbar" style="width: ${percentage}%; border-radius: 10px;" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
      `;

      container.appendChild(itemRow);
    });
  },

  /**
   * Renders the complete compliance audit registry ledger table
   */
  renderTableReport() {
    const tbody = document.getElementById('risk-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Filter by Search Query
    let filtered = this.evaluatedProjects;
    if (this.searchQuery) {
      filtered = filtered.filter(ep => 
        ep.id.toLowerCase().includes(this.searchQuery) ||
        ep.name.toLowerCase().includes(this.searchQuery) ||
        ep.client.toLowerCase().includes(this.searchQuery) ||
        ep.manager.toLowerCase().includes(this.searchQuery)
      );
    }

    // Filter by Severity Level Pill selection
    if (this.severityFilter && this.severityFilter !== 'all') {
      filtered = filtered.filter(ep => ep.riskEval.severity === this.severityFilter);
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4">
            No compliance risks found matching search / severity criteria.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(ep => {
      const tr = document.createElement('tr');
      tr.id = `risk-row-${ep.id}`;
      tr.style.borderBottom = '1px solid var(--border-color)';

      // Severity Color classes
      let sevBadgeClass = 'bg-success-subtle text-success border-success-subtle';
      if (ep.riskEval.severity === 'Critical') sevBadgeClass = 'bg-danger-subtle text-danger border-danger-subtle font-bold';
      if (ep.riskEval.severity === 'High') sevBadgeClass = 'bg-warning-subtle text-warning border-warning-subtle font-bold';
      if (ep.riskEval.severity === 'Medium') sevBadgeClass = 'bg-info-subtle text-info border-info-subtle';

      // Assemble list of failing triggers as little styled badges
      let triggerBadgesHTML = '';
      if (ep.riskEval.flags.length === 0) {
        triggerBadgesHTML = '<span class="text-success font-semibold text-xs"><i class="fa-solid fa-circle-check me-1"></i> No risk flags detected</span>';
      } else {
        ep.riskEval.flags.forEach(f => {
          let theme = 'bg-danger-subtle text-danger';
          if (['OVERDUE_STORIES', 'DEV_LEAVE', 'QA_LEAVE', 'NO_ACTIVITY'].includes(f.id)) {
            theme = 'bg-warning-subtle text-warning';
          } else if (f.id === 'PENDING_SOW') {
            theme = 'bg-secondary-subtle text-secondary';
          }
          triggerBadgesHTML += `
            <span class="badge ${theme} p-1.5 rounded-1 border me-1 mb-1 font-semibold" style="font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px;" title="${f.desc}">
              <i class="fa-solid fa-triangle-exclamation"></i> ${f.label.replace(' ⚠️', '')}
            </span>
          `;
        });
      }

      // Checkbox or toggle for client escalation state
      const isEscalated = this.escalations.includes(ep.id);
      const escalationSwitch = `
        <div class="form-check form-switch d-flex justify-content-end pe-4">
          <input class="form-check-input" type="checkbox" role="switch" id="esc-switch-${ep.id}" ${isEscalated ? 'checked' : ''} onchange="window.toggleProjectEscalation('${ep.id}', this.checked)" style="cursor: pointer;" />
        </div>
      `;

      // Backlog stories buttons
      const storiesCount = this.stories[ep.id] || 0;
      const storiesControl = `
        <div class="d-inline-flex align-items-center gap-1.5 justify-content-center w-100">
          <button class="btn-enterprise btn-enterprise-secondary px-1.5 py-0.5" style="font-size: 0.75rem;" onclick="window.adjustProjectStories('${ep.id}', -1)" aria-label="Decrease stories">-</button>
          <span class="font-bold text-center" style="width: 25px; font-size: 0.85rem;">${storiesCount}</span>
          <button class="btn-enterprise btn-enterprise-secondary px-1.5 py-0.5" style="font-size: 0.75rem;" onclick="window.adjustProjectStories('${ep.id}', 1)" aria-label="Increase stories">+</button>
        </div>
      `;

      // Quick fixes or Mitigation actions
      let fixBtn = '';
      if (ep.riskEval.severity !== 'Low') {
        if (ep.riskEval.flags.some(f => f.id === 'NO_DEV')) {
          fixBtn = `<button class="btn-enterprise btn-enterprise-primary btn-xs py-1 px-2 font-bold" style="font-size: 0.7rem;" onclick="window.quickMitigate('${ep.id}', 'assign_dev')"><i class="fa-solid fa-user-plus"></i> Fix Dev</button>`;
        } else if (ep.riskEval.flags.some(f => f.id === 'NO_QA')) {
          fixBtn = `<button class="btn-enterprise btn-enterprise-primary btn-xs py-1 px-2 font-bold" style="font-size: 0.7rem;" onclick="window.quickMitigate('${ep.id}', 'assign_qa')"><i class="fa-solid fa-bug"></i> Fix QA</button>`;
        } else {
          fixBtn = `<button class="btn-enterprise btn-enterprise-secondary text-success border-success-subtle btn-xs py-1 px-2 font-bold" style="font-size: 0.7rem; background-color: rgba(16, 185, 129, 0.05);" onclick="window.quickMitigate('${ep.id}', 'mark_clear')"><i class="fa-solid fa-circle-check"></i> Clear</button>`;
        }
      } else {
        fixBtn = `<span class="text-success font-bold text-xs"><i class="fa-solid fa-circle-check"></i> Compliant</span>`;
      }

      tr.innerHTML = `
        <td style="padding: 12px 16px;">
          <div><strong class="text-primary">${ep.id}</strong></div>
          <div class="text-secondary font-semibold" style="font-size: 0.8rem; text-overflow: ellipsis; overflow: hidden; max-width: 170px;" title="${ep.name}">${ep.name}</div>
        </td>
        <td>
          <div class="font-semibold text-primary">${ep.manager || 'Alex Mercer'}</div>
          <div class="text-muted text-xs">${ep.client}</div>
        </td>
        <td style="text-align: center;">
          <span class="font-bold" style="font-size: 0.95rem; color: ${ep.riskEval.score >= 80 ? 'var(--brand-danger)' : ep.riskEval.score >= 60 ? '#f97316' : ep.riskEval.score >= 30 ? 'var(--brand-warning)' : 'var(--brand-success)'};">
            ${ep.riskEval.score}
          </span>
        </td>
        <td>
          <span class="badge ${sevBadgeClass} px-2 py-1 rounded" style="font-size: 0.75rem; border: 1.5px solid;">${ep.riskEval.severity}</span>
        </td>
        <td style="max-width: 320px;">
          <div class="d-flex flex-wrap">${triggerBadgesHTML}</div>
        </td>
        <td>${storiesControl}</td>
        <td>${escalationSwitch}</td>
        <td style="text-align: center;">${fixBtn}</td>
      `;

      tbody.appendChild(tr);
    });

    // Attach global quick-action window handlers
    window.toggleProjectEscalation = (projId, enabled) => {
      if (enabled) {
        if (!this.escalations.includes(projId)) {
          this.escalations.push(projId);
        }
        this.app.showToast(`Logged customer escalation ticket for project ${projId}`, 'danger');
      } else {
        this.escalations = this.escalations.filter(id => id !== projId);
        this.app.showToast(`Resolved escalation ticket for project ${projId}`, 'success');
      }
      this.saveData();
      this.recalculateAndRender();
    };

    window.adjustProjectStories = (projId, delta) => {
      const current = this.stories[projId] || 0;
      const next = Math.max(0, current + delta);
      this.stories[projId] = next;
      this.saveData();
      this.recalculateAndRender();
      if (delta > 0) {
        this.app.showToast(`Increased backlog overdue stories count for project ${projId}`, 'warning');
      } else {
        this.app.showToast(`Decreased overdue stories count for project ${projId}`, 'success');
      }
    };

    window.quickMitigate = (projId, action) => {
      if (action === 'assign_dev') {
        const availableDev = 'Alice Smith';
        // update project
        const index = this.projects.findIndex(p => p.id === projId);
        if (index !== -1) {
          this.projects[index].developer = availableDev;
          Storage.set('projects', this.projects);
          this.app.projectsList = this.projects;
          this.app.showToast(`Assigned Developer (${availableDev}) to project ${projId} to clear scheduling risk`, 'success');
          this.loadData();
          this.recalculateAndRender();
        }
      } else if (action === 'assign_qa') {
        const availableQA = 'David Miller';
        // update project
        const index = this.projects.findIndex(p => p.id === projId);
        if (index !== -1) {
          this.projects[index].qa = availableQA;
          Storage.set('projects', this.projects);
          this.app.projectsList = this.projects;
          this.app.showToast(`Assigned QA Analyst (${availableQA}) to project ${projId} to clear validation risk`, 'success');
          this.loadData();
          this.recalculateAndRender();
        }
      } else if (action === 'mark_clear') {
        // Clear stories, escalations, overdue dates
        const index = this.projects.findIndex(p => p.id === projId);
        if (index !== -1) {
          const ep = this.projects[index];
          this.stories[projId] = 0;
          this.escalations = this.escalations.filter(id => id !== projId);
          // push target end date into the future to clear past-due schedule
          ep.estimatedEnd = '2026-09-30'; 
          Storage.set('projects', this.projects);
          this.app.projectsList = this.projects;
          this.saveData();
          this.app.showToast(`Successfully mitigated timeline and contract risks for project ${projId}`, 'success');
          this.loadData();
          this.recalculateAndRender();
        }
      }
    };
  }
};
