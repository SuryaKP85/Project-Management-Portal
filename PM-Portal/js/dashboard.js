/* dashboard.js - Orchestrator for the main Executive Dashboard metrics, Chart.js integrations, and widgets */

import { Charts } from './charts.js';
import { Storage } from './storage.js';

export const DashboardModule = {
  // Default datasets for fresh state
  getDummyJSON() {
    return {
      customerProjects: [],
      projectStatus: [],
      projectPriority: [],
      projectRisk: [],
      monthlyDeliveries: [],
      departmentEffort: [],
      remainingHours: [],
      resourceUtilization: [],
      sowStatus: []
    };
  },

  getTasksData() {
    return [];
  },

  getRecentActivities() {
    return [];
  },

  /**
   * Compiles dynamic metrics and chart datasets from Excel rows in localStorage
   */
  getDynamicData() {
    let raw = localStorage.getItem('excel_imported_data');
    let rows = null;
    if (raw) {
      try {
        rows = JSON.parse(raw);
      } catch (e) {}
    }
    
    // Fallback to active projects register from LocalStorage
    if (!rows || rows.length === 0) {
      const projectsStored = localStorage.getItem('projects') || localStorage.getItem('pm_portal_projects');
      if (projectsStored) {
        try {
          const list = JSON.parse(projectsStored);
          if (Array.isArray(list) && list.length > 0) {
            // Map projects structure to excel schema keys to ensure charts work perfectly!
            rows = list.map(p => ({
              'Customer': p.client || 'Enterprise Corp',
              'Project': p.name || p.id,
              'Status': p.status || 'planning',
              'Risk': p.risk || 'Low',
              'SOW': p.sprint || 'Approved',
              'Weekend': 'No',
              'Completion %': p.progress || 0,
              'Total Estimated': p.budget ? p.budget / 100 : 1500,
              'Total Actual': p.progress ? (p.budget / 100) * (p.progress / 100) : 0,
              'Total Remaining': p.budget ? (p.budget / 100) * (1 - (p.progress / 100)) : 1500
            }));
          }
        } catch (e) {}
      }
    }
    
    if (!rows || rows.length === 0) return null;
    
    try {
      
      const customers = new Set();
      const projects = new Set();
      let inProgress = 0;
      let completed = 0;
      let delayed = 0;
      let critical = 0;
      let pendingSOW = 0;
      let weekendSupport = 0;
      let totalCompletion = 0;
      let totalRemaining = 0;
      let totalActual = 0;
      
      const customerProjectsMap = {};
      const projectStatusMap = {};
      const projectPriorityMap = { 'High Priority': 0, 'Medium Priority': 0, 'Low Priority': 0 };
      const projectRiskMap = { 'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0 };
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyDeliveriesMap = {};
      months.forEach(m => monthlyDeliveriesMap[m] = 0);
      
      let baEstimatedSum = 0;
      let devEstimatedSum = 0;
      let qaEstimatedSum = 0;
      
      let baRemainingSum = 0;
      let devRemainingSum = 0;
      let qaRemainingSum = 0;
      
      const resourceUtilizationMap = {
        'Lead Architects': 0,
        'Fullstack Devs': 0,
        'UX Designers': 0,
        'QA Engineers': 0,
        'Product Managers': 0
      };
      const resourceCounts = {
        'Lead Architects': 0,
        'Fullstack Devs': 0,
        'UX Designers': 0,
        'QA Engineers': 0,
        'Product Managers': 0
      };
      
      const sowStatusMap = {};

      rows.forEach(row => {
        const custName = (row['Customer'] || "General").trim();
        const prjName = (row['Project'] || "General").trim();
        const status = (row['Status'] || "").trim();
        const statusLower = status.toLowerCase();
        const sow = (row['SOW'] || "").trim();
        const risk = (row['Risk'] || "").trim();
        const riskLower = risk.toLowerCase();
        const weekend = (row['Weekend'] || "").trim().toLowerCase();
        
        const completionVal = parseFloat(row['Completion %']) || 0;
        
        const baEst = parseFloat(row['BA Estimated']) || 0;
        const devEst = parseFloat(row['DEV Estimated']) || 0;
        const qaEst = parseFloat(row['QA Estimated']) || 0;
        
        const baAct = parseFloat(row['BA Actual']) || 0;
        const devAct = parseFloat(row['DEV Actual']) || 0;
        const qaAct = parseFloat(row['QA Actual']) || 0;
        
        const baRem = parseFloat(row['BA Remaining']) || 0;
        const devRem = parseFloat(row['DEV Remaining']) || 0;
        const qaRem = parseFloat(row['QA Remaining']) || 0;
        
        baEstimatedSum += baEst;
        devEstimatedSum += devEst;
        qaEstimatedSum += qaEst;
        
        baRemainingSum += baRem;
        devRemainingSum += devRem;
        qaRemainingSum += qaRem;
        
        totalActual += (baAct + devAct + qaAct);
        
        if (custName) customers.add(custName);
        if (prjName) projects.add(prjName);
        
        // Status calculations
        if (statusLower.includes('progress') || statusLower === 'active' || statusLower === 'in progress') {
          inProgress++;
        } else if (statusLower.includes('completed') || statusLower === 'complete' || statusLower === 'done') {
          completed++;
        } else if (statusLower.includes('delay') || statusLower === 'delayed') {
          delayed++;
        } else if (statusLower.includes('critical') || statusLower.includes('hold') || statusLower === 'on hold') {
          critical++;
        }
        
        // SOW pending
        if (sow.toLowerCase().includes('pending')) {
          pendingSOW++;
        }
        
        // Weekend support
        if (weekend === 'yes' || weekend === 'true' || weekend === 'y') {
          weekendSupport++;
        }
        
        totalCompletion += completionVal;
        
        // Grouping: Customer projects
        customerProjectsMap[custName] = (customerProjectsMap[custName] || 0) + 1;
        
        // Grouping: Status
        const statusLabel = row['Status'] || 'Unknown';
        projectStatusMap[statusLabel] = (projectStatusMap[statusLabel] || 0) + 1;
        
        // Grouping: Priority mapping based on Risk or Status
        if (riskLower.includes('critical') || riskLower.includes('high') || statusLower.includes('critical')) {
          projectPriorityMap['High Priority']++;
        } else if (riskLower.includes('medium') || statusLower.includes('delay') || statusLower.includes('hold')) {
          projectPriorityMap['Medium Priority']++;
        } else {
          projectPriorityMap['Low Priority']++;
        }
        
        // Grouping: Risk
        if (riskLower.includes('critical')) {
          projectRiskMap['Critical']++;
        } else if (riskLower.includes('high')) {
          projectRiskMap['High']++;
        } else if (riskLower.includes('medium')) {
          projectRiskMap['Medium']++;
        } else {
          projectRiskMap['Low']++;
        }
        
        // Grouping: Monthly Deliveries (by Go Live or Estimated End date)
        const dateStr = row['Go Live'] || row['Estimated End'] || "";
        if (dateStr) {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            const mLabel = months[date.getMonth()];
            if (monthlyDeliveriesMap[mLabel] !== undefined) {
              monthlyDeliveriesMap[mLabel]++;
            }
          }
        }
        
        // Grouping: Resource Allocation (utilization mapping)
        const pm = (row['PM'] || "").trim();
        const ba = (row['BA'] || "").trim();
        const dev = (row['Developer'] || "").trim();
        const qa = (row['QA'] || "").trim();
        
        if (pm) {
          resourceCounts['Product Managers'] += 1;
          resourceUtilizationMap['Product Managers'] += 85;
        }
        if (ba) {
          resourceCounts['UX Designers'] += 1;
          resourceUtilizationMap['UX Designers'] += 75;
        }
        if (dev) {
          resourceCounts['Fullstack Devs'] += 1;
          resourceUtilizationMap['Fullstack Devs'] += 95;
        }
        if (qa) {
          resourceCounts['QA Engineers'] += 1;
          resourceUtilizationMap['QA Engineers'] += 80;
        }
        
        // SOW Status
        if (sow) {
          sowStatusMap[sow] = (sowStatusMap[sow] || 0) + 1;
        }
      });

      totalRemaining = baRemainingSum + devRemainingSum + qaRemainingSum;

      // Format listings for Chart.js inputs
      const customerProjectsList = Object.entries(customerProjectsMap).map(([label, value]) => ({ label, value }));
      const projectStatusList = Object.entries(projectStatusMap).map(([label, value]) => ({ label, value }));
      const projectPriorityList = Object.entries(projectPriorityMap).map(([label, value]) => ({ label, value }));
      const projectRiskList = Object.entries(projectRiskMap).map(([label, value]) => ({ label, value }));
      const monthlyDeliveriesList = Object.entries(monthlyDeliveriesMap).map(([label, value]) => ({ label, value }));
      
      const totalEstimatedSum = baEstimatedSum + devEstimatedSum + qaEstimatedSum;
      const deptEffortList = [
        { label: 'Engineering', value: devEstimatedSum > 0 ? Math.round((devEstimatedSum / totalEstimatedSum) * 100) : 45 },
        { label: 'Design', value: baEstimatedSum > 0 ? Math.round((baEstimatedSum / totalEstimatedSum) * 100) : 15 },
        { label: 'QA / Test', value: qaEstimatedSum > 0 ? Math.round((qaEstimatedSum / totalEstimatedSum) * 100) : 25 },
        { label: 'Product', value: 10 },
        { label: 'Operations', value: 12 }
      ];

      const remainingHoursList = [
        { label: 'Engineering', value: devRemainingSum },
        { label: 'Design', value: baRemainingSum },
        { label: 'QA / Test', value: qaRemainingSum },
        { label: 'Operations', value: 100 }
      ];

      const resourceUtilizationList = Object.keys(resourceUtilizationMap).map(key => {
        const count = resourceCounts[key] || 1;
        const val = Math.min(100, Math.round(resourceUtilizationMap[key] / count));
        return { label: key, value: val || 75 };
      });

      const sowStatusList = Object.entries(sowStatusMap).map(([label, value]) => ({ label, value }));

      // Dynamic integration with Daily Time Logging
      const rawLogs = localStorage.getItem('pm_portal_time_logs');
      if (rawLogs) {
        try {
          const timeLogs = JSON.parse(rawLogs);
          if (Array.isArray(timeLogs) && timeLogs.length > 0) {
            totalActual = timeLogs.reduce((sum, l) => sum + l.hours, 0);

            // Load estimates
            let projectDeptEst = {};
            const rawEst = localStorage.getItem('pm_portal_project_dept_estimates');
            if (rawEst) {
              projectDeptEst = JSON.parse(rawEst);
            } else {
              projectDeptEst = {
                'PRJ001': { 'Engineering': 120, 'Design': 60, 'QA / Test': 50, 'Product': 30 },
                'PRJ002': { 'Engineering': 220, 'Design': 100, 'QA / Test': 80, 'Product': 50 },
                'PRJ003': { 'Engineering': 80, 'Design': 30, 'QA / Test': 30, 'Product': 20 },
                'PRJ004': { 'Engineering': 180, 'Design': 70, 'QA / Test': 60, 'Product': 40 },
                'PRJ005': { 'Engineering': 100, 'Design': 50, 'QA / Test': 40, 'Product': 20 }
              };
            }

            // Sum up remaining hours across all projects and departments
            let calcRemaining = 0;
            const projIds = ['PRJ001', 'PRJ002', 'PRJ003', 'PRJ004', 'PRJ005'];
            const depts = ['Engineering', 'Design', 'QA / Test', 'Product'];
            
            projIds.forEach(pId => {
              depts.forEach(dept => {
                const est = projectDeptEst[pId]?.[dept] || 0;
                const logged = timeLogs
                  .filter(l => l.projectId === pId && l.department === dept)
                  .reduce((sum, l) => sum + l.hours, 0);
                if (est > logged) {
                  calcRemaining += (est - logged);
                }
              });
            });
            totalRemaining = calcRemaining;

            // Recalculate average project health/completion
            let totalCompletionSum = 0;
            projIds.forEach(pId => {
              let pEst = 0;
              let pLogged = 0;
              depts.forEach(dept => {
                pEst += (projectDeptEst[pId]?.[dept] || 0);
                pLogged += timeLogs
                  .filter(l => l.projectId === pId && l.department === dept)
                  .reduce((sum, l) => sum + l.hours, 0);
              });
              const completion = pEst > 0 ? Math.min(100, Math.round((pLogged / pEst) * 100)) : 0;
              totalCompletionSum += completion;
            });
            
            const avgCompVal = Math.round(totalCompletionSum / projIds.length);
            totalCompletion = avgCompVal * rows.length; // ensures division by rows.length matches avgCompVal
          }
        } catch (e) {
          console.warn("Error integrating time logs into dashboard calculations:", e);
        }
      }

      // Dynamic integration with Leave Tracker
      let activeLeavesCount = 0;
      const rawLeaves = localStorage.getItem('pm_portal_leaves') || localStorage.getItem('leaves');
      if (rawLeaves) {
        try {
          const leaves = JSON.parse(rawLeaves);
          if (Array.isArray(leaves)) {
            activeLeavesCount = leaves.filter(l => l.status === 'Approved').length;
          }
        } catch (e) {
          console.warn("Error calculating dashboard leaves count:", e);
        }
      } else {
        activeLeavesCount = 0;
      }

      // Dynamic integration with Weekend Planner
      let activeWeekendCount = 0;
      const rawWeekendLogs = localStorage.getItem('pm_portal_weekend_logs') || localStorage.getItem('weekend_logs');
      if (rawWeekendLogs) {
        try {
          const wkLogs = JSON.parse(rawWeekendLogs);
          if (Array.isArray(wkLogs)) {
            activeWeekendCount = wkLogs.filter(l => l.status === 'Approved').length;
          }
        } catch (e) {
          console.warn("Error calculating dashboard weekend support count:", e);
        }
      }

      return {
        kpis: {
          'metric-total-customers': customers.size.toString(),
          'metric-total-projects': projects.size.toString(),
          'metric-projects-in-progress': inProgress.toString(),
          'metric-completed-projects': completed.toString(),
          'metric-delayed-projects': delayed.toString(),
          'metric-critical-projects': critical.toString(),
          'metric-pending-sow': pendingSOW.toString(),
          'metric-employees-on-leave': activeLeavesCount.toString(),
          'metric-weekend-support': activeWeekendCount.toString(),
          'metric-avg-project-health': rows.length > 0 ? `${Math.round(totalCompletion / rows.length)}%` : '0%',
          'metric-remaining-hours': totalRemaining.toLocaleString(),
          'metric-logged-hours': totalActual.toLocaleString()
        },
        charts: {
          customerProjects: customerProjectsList,
          projectStatus: projectStatusList,
          projectPriority: projectPriorityList,
          projectRisk: projectRiskList,
          monthlyDeliveries: monthlyDeliveriesList,
          departmentEffort: deptEffortList,
          remainingHours: remainingHoursList,
          resourceUtilization: resourceUtilizationList,
          sowStatus: sowStatusList.length > 0 ? sowStatusList : [
            { label: 'Approved', value: completed },
            { label: 'Pending Client Sign-off', value: pendingSOW }
          ]
        }
      };
    } catch (e) {
      console.error("Failed to parse local storage spreadsheet elements:", e);
      return null;
    }
  },

  /**
   * Initializes the dashboard components, metrics, charts, checklists, and listeners
   */
  init(app) {
    this.app = app;
    this.renderMetrics();
    this.renderAllCharts();
    this.renderTasks();
    this.renderActivities();
    this.setupListeners();
  },

  /**
   * Redraw all 9 requested Chart.js graphs using dummy or dynamic datasets
   */
  renderAllCharts() {
    const dynamicData = this.getDynamicData();
    const data = dynamicData ? dynamicData.charts : this.getDummyJSON();
    
    Charts.renderCustomerProjects('chart-customer-projects', data.customerProjects);
    Charts.renderProjectStatus('chart-project-status', data.projectStatus);
    Charts.renderProjectPriority('chart-project-priority', data.projectPriority);
    Charts.renderProjectRisk('chart-project-risk', data.projectRisk);
    Charts.renderMonthlyDeliveries('chart-monthly-deliveries', data.monthlyDeliveries);
    Charts.renderDeptEffort('chart-dept-effort', data.departmentEffort);
    Charts.renderRemainingHours('chart-remaining-hours', data.remainingHours);
    Charts.renderResourceUtilization('chart-resource-utilization', data.resourceUtilization);
    Charts.renderSOWStatus('chart-sow-status', data.sowStatus);
  },

  /**
   * Populate the 12 executive level KPI metric cards
   */
  renderMetrics() {
    const dynamicData = this.getDynamicData();
    const metrics = dynamicData ? dynamicData.kpis : {
      'metric-total-customers': '0',
      'metric-total-projects': '0',
      'metric-projects-in-progress': '0',
      'metric-completed-projects': '0',
      'metric-delayed-projects': '0',
      'metric-critical-projects': '0',
      'metric-pending-sow': '0',
      'metric-employees-on-leave': '0',
      'metric-weekend-support': '0',
      'metric-avg-project-health': '0%',
      'metric-remaining-hours': '0',
      'metric-logged-hours': '0'
    };

    Object.entries(metrics).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
  },

  /**
   * Draw the interactive tasks checklist
   */
  renderTasks() {
    const container = document.getElementById('dashboard-tasks-container');
    if (!container) return;

    // Load tasks from storage or fall back to default mockup
    let tasks = Storage.get('dashboard_tasks');
    if (!tasks) {
      tasks = this.getTasksData();
      Storage.set('dashboard_tasks', tasks);
    }

    container.innerHTML = '';
    
    tasks.forEach(task => {
      const taskRow = document.createElement('div');
      taskRow.className = `task-item ${task.completed ? 'completed' : ''}`;
      taskRow.id = `task-row-${task.id}`;
      
      taskRow.innerHTML = `
        <input type="checkbox" id="chk-${task.id}" class="task-checkbox" ${task.completed ? 'checked' : ''} />
        <div class="task-info">
          <p class="task-title-text" style="color: var(--text-primary);">${task.title}</p>
          <div class="task-meta">
            <span class="task-badge badge-${task.priority}">${task.priority}</span>
            <span class="task-due"><i class="fa-regular fa-calendar-days"></i> ${task.due}</span>
          </div>
        </div>
      `;
      
      container.appendChild(taskRow);
      
      // Wire checkbox toggle
      const chk = taskRow.querySelector('.task-checkbox');
      chk.addEventListener('change', (e) => {
        this.toggleTask(task.id, e.target.checked);
      });
    });
  },

  /**
   * Toggle a task completion state and show a toast
   */
  toggleTask(taskId, isCompleted) {
    let tasks = Storage.get('dashboard_tasks', []);
    tasks = tasks.map(t => t.id === taskId ? { ...t, completed: isCompleted } : t);
    Storage.set('dashboard_tasks', tasks);
    
    const row = document.getElementById(`task-row-${taskId}`);
    if (row) {
      if (isCompleted) {
        row.classList.add('completed');
        this.app.showToast('Task marked as completed', 'success');
      } else {
        row.classList.remove('completed');
        this.app.showToast('Task marked as active', 'info');
      }
    }
  },

  /**
   * Render recent activity audit list
   */
  renderActivities() {
    const container = document.getElementById('dashboard-activity-container');
    if (!container) return;

    container.innerHTML = '';
    
    this.getRecentActivities().forEach(act => {
      const node = document.createElement('div');
      node.className = 'activity-node';
      node.innerHTML = `
        <div class="activity-dot ${act.type}"></div>
        <div class="activity-content">
          <p class="activity-desc" style="color: var(--text-primary);">${act.desc}</p>
          <div class="activity-time-stamp">${act.time}</div>
        </div>
      `;
      container.appendChild(node);
    });
  },

  /**
   * Sets up dashboard event listeners
   */
  setupListeners() {
    // Handle manual KPI Refresh Button
    const refreshBtn = document.getElementById('refresh-dashboard-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        const icon = refreshBtn.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        
        setTimeout(() => {
          this.renderMetrics();
          this.renderAllCharts();
          this.renderActivities();
          if (icon) icon.classList.remove('fa-spin');
          this.app.showToast('Executive Dashboard metrics refreshed successfully', 'success');
        }, 600);
      });
    }

    // Auto resize charts on window size change
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const dashboardPage = document.getElementById('page-dashboard');
        if (dashboardPage && dashboardPage.classList.contains('active')) {
          this.renderAllCharts();
        }
      }, 250);
    });

    // Wire drilldown click handlers on Executive Dashboard KPI cards
    const kpiCards = document.querySelectorAll('.stats-grid-executive .kpi-card, .kpi-card');
    kpiCards.forEach(card => {
      const metricEl = card.querySelector('.kpi-value');
      const metricId = metricEl ? metricEl.id : null;
      if (metricId) {
        card.style.cursor = 'pointer';
        card.setAttribute('title', 'Click to view executive drill-down details');
        card.onclick = () => {
          this.openMetricDrilldown(metricId);
        };
      }
    });
  },

  /**
   * Generates and opens an interactive modal drilldown for executive KPI metrics
   */
  openMetricDrilldown(metricId) {
    let title = 'Executive Metric Drilldown';
    let bodyHtml = '';
    
    // Load live collections from Storage or app defaults
    let projects = Storage.getProjects();
    if (!projects || projects.length === 0) projects = this.app?.projectsList || [];
    
    let customers = Storage.getCustomers();
    if (!customers || customers.length === 0) customers = this.app?.customersList || [];
    
    let timeLogs = Storage.getTimeLogs();
    if (!timeLogs || timeLogs.length === 0) {
      try {
        const raw = localStorage.getItem('pm_portal_time_logs');
        if (raw) timeLogs = JSON.parse(raw);
      } catch (e) {}
    }
    
    let leaves = Storage.getLeaves();
    if (!leaves || leaves.length === 0) {
      try {
        const raw = localStorage.getItem('pm_portal_leaves') || localStorage.getItem('leaves');
        if (raw) leaves = JSON.parse(raw);
      } catch (e) {}
    }
    
    let weekendLogs = Storage.getWeekendWork();
    if (!weekendLogs || weekendLogs.length === 0) {
      try {
        const raw = localStorage.getItem('pm_portal_weekend_logs') || localStorage.getItem('weekend_logs');
        if (raw) weekendLogs = JSON.parse(raw);
      } catch (e) {}
    }

    if (metricId === 'metric-total-customers') {
      title = 'Total Registered Customers Drilldown';
      const rowsHtml = customers.map(c => `
        <tr>
          <td class="font-semibold text-primary">${c.id || 'CST'}</td>
          <td class="font-bold">${c.name}</td>
          <td><span class="badge bg-light text-dark border">${c.industry || 'General'}</span></td>
          <td>${c.contact || 'N/A'}</td>
          <td><span class="badge bg-success-subtle text-success">${c.status || 'Active'}</span></td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 d-flex justify-content-between align-items-center">
          <p class="text-muted m-0 font-semibold" style="font-size: 0.85rem;">Showing ${customers.length} registered customer accounts in portfolio.</p>
        </div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Customer Code</th><th>Customer / Client Name</th><th>Industry</th><th>Primary Contact</th><th>Status</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="5" class="text-center py-3 text-muted">No customers found.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-total-projects') {
      title = 'Total Portfolio Projects Drilldown';
      const rowsHtml = projects.map(p => `
        <tr>
          <td class="font-semibold text-primary">${p.id}</td>
          <td class="font-bold">${p.name}</td>
          <td>${p.client}</td>
          <td>${p.manager}</td>
          <td><span class="badge bg-info-subtle text-info">${p.status}</span></td>
          <td class="font-semibold">$${Number(p.budget || 0).toLocaleString()}</td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Total projects tracked across all accounts (${projects.length} total).</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Code</th><th>Project Name</th><th>Client</th><th>Manager</th><th>Status</th><th>Budget</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center py-3 text-muted">No projects found.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-projects-in-progress') {
      title = 'Projects In Progress Drilldown';
      const filtered = projects.filter(p => {
        const s = (p.status || '').toLowerCase();
        return s.includes('progress') || s === 'active';
      });
      const rowsHtml = filtered.map(p => `
        <tr>
          <td class="font-semibold text-primary">${p.id}</td>
          <td class="font-bold">${p.name}</td>
          <td>${p.client}</td>
          <td>${p.manager}</td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="progress w-100" style="height: 6px;">
                <div class="progress-bar bg-primary" style="width: ${p.progress || 0}%;"></div>
              </div>
              <span class="font-bold">${p.progress || 0}%</span>
            </div>
          </td>
          <td class="font-semibold">$${Number(p.budget || 0).toLocaleString()}</td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Currently active projects in execution (${filtered.length} active).</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Code</th><th>Project Name</th><th>Client</th><th>Manager</th><th>Progress</th><th>Budget</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center py-3 text-muted">No in-progress projects found.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-completed-projects') {
      title = 'Completed Projects Drilldown';
      const filtered = projects.filter(p => {
        const s = (p.status || '').toLowerCase();
        return s.includes('complete') || s === 'done';
      });
      const rowsHtml = filtered.map(p => `
        <tr>
          <td class="font-semibold text-primary">${p.id}</td>
          <td class="font-bold">${p.name}</td>
          <td>${p.client}</td>
          <td>${p.manager}</td>
          <td><span class="badge bg-success-subtle text-success">Completed (100%)</span></td>
          <td class="font-semibold">$${Number(p.budget || 0).toLocaleString()}</td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Successfully completed portfolio deliverables (${filtered.length} completed).</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Code</th><th>Project Name</th><th>Client</th><th>Manager</th><th>Status</th><th>Final Budget</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center py-3 text-muted">No completed projects found.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-delayed-projects') {
      title = 'Delayed Projects Drilldown';
      const filtered = projects.filter(p => {
        const s = (p.status || '').toLowerCase();
        const r = (p.risk || '').toLowerCase();
        return s.includes('delay') || r === 'high' || r === 'critical';
      });
      const rowsHtml = filtered.map(p => `
        <tr>
          <td class="font-semibold text-primary">${p.id}</td>
          <td class="font-bold">${p.name}</td>
          <td>${p.client}</td>
          <td>${p.manager}</td>
          <td><span class="badge bg-warning-subtle text-warning">${p.risk || 'Medium'} Risk</span></td>
          <td><span class="badge bg-danger-subtle text-danger">${p.status}</span></td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Projects experiencing schedule delays or requiring governance intervention (${filtered.length} items).</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Code</th><th>Project Name</th><th>Client</th><th>Manager</th><th>Risk Level</th><th>Status</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center py-3 text-muted">No delayed projects found.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-critical-projects') {
      title = 'Critical / On-Hold Projects Drilldown';
      const filtered = projects.filter(p => {
        const s = (p.status || '').toLowerCase();
        const r = (p.risk || '').toLowerCase();
        return s.includes('critical') || s.includes('hold') || r === 'critical';
      });
      const rowsHtml = filtered.map(p => `
        <tr>
          <td class="font-semibold text-primary">${p.id}</td>
          <td class="font-bold">${p.name}</td>
          <td>${p.client}</td>
          <td>${p.manager}</td>
          <td><span class="badge bg-danger text-white">${p.risk || 'Critical'}</span></td>
          <td><span class="badge bg-secondary-subtle text-dark">${p.status}</span></td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Projects marked critical or placed on-hold (${filtered.length} items).</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Code</th><th>Project Name</th><th>Client</th><th>Manager</th><th>Risk Level</th><th>Status</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center py-3 text-muted">No critical projects found.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-pending-sow') {
      title = 'Pending SOW Agreements Drilldown';
      const rowsHtml = projects.map(p => `
        <tr>
          <td class="font-semibold text-primary">${p.id}</td>
          <td class="font-bold">${p.name}</td>
          <td>${p.client}</td>
          <td>${p.manager}</td>
          <td class="font-semibold">$${Number(p.budget || 0).toLocaleString()}</td>
          <td><span class="badge bg-warning-subtle text-warning">Pending Sign-off</span></td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">SOW agreements and contractual documentation pending sign-off.</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Code</th><th>Project Name</th><th>Client</th><th>Manager</th><th>Budget</th><th>SOW Status</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-employees-on-leave') {
      title = 'Employees on Leave Log Drilldown';
      const rowsHtml = (leaves || []).map(l => `
        <tr>
          <td class="font-bold">${l.name || l.employee || 'Employee'}</td>
          <td><span class="badge bg-light text-dark border">${l.type || 'Annual Leave'}</span></td>
          <td>${l.start || 'N/A'} to ${l.end || 'N/A'}</td>
          <td class="font-semibold">${l.days || 1} day(s)</td>
          <td><span class="badge bg-success-subtle text-success">${l.status || 'Approved'}</span></td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Approved team member leave logs and time-off requests.</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Employee</th><th>Leave Type</th><th>Dates</th><th>Duration</th><th>Status</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="5" class="text-center py-3 text-muted">No active leave records found.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-weekend-support') {
      title = 'Weekend Standby Roster Drilldown';
      const rowsHtml = (weekendLogs || []).map(w => `
        <tr>
          <td class="font-bold">${w.employee || w.name || 'Team Member'}</td>
          <td>${w.project || w.projectName || 'General Support'}</td>
          <td>${w.date || 'Upcoming Weekend'}</td>
          <td>${w.task || 'On-call Standby'}</td>
          <td><span class="badge bg-success-subtle text-success">${w.status || 'Approved'}</span></td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Active team roster assigned for weekend deployment & on-call support.</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Team Member</th><th>Assigned Project</th><th>Date</th><th>Task / Responsibility</th><th>Status</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="5" class="text-center py-3 text-muted">No weekend support rosters scheduled.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-avg-project-health') {
      title = 'Portfolio Project Health Matrix Drilldown';
      const rowsHtml = projects.map(p => {
        const prog = p.progress || 0;
        let healthBadge = '<span class="badge bg-success-subtle text-success">Healthy (95+)</span>';
        if (prog < 30) healthBadge = '<span class="badge bg-danger-subtle text-danger">At Risk</span>';
        else if (prog < 70) healthBadge = '<span class="badge bg-warning-subtle text-warning">Needs Review</span>';
        return `
          <tr>
            <td class="font-semibold text-primary">${p.id}</td>
            <td class="font-bold">${p.name}</td>
            <td>${p.client}</td>
            <td>${p.manager}</td>
            <td class="font-semibold">${prog}%</td>
            <td>${healthBadge}</td>
          </tr>
        `;
      }).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Detailed breakdown of progress ratings and health indicators across all projects.</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Code</th><th>Project Name</th><th>Client</th><th>Manager</th><th>Completion</th><th>Health Indicator</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-remaining-hours') {
      title = 'Remaining Estimated Hours Drilldown';
      const rowsHtml = projects.map(p => {
        const est = (p.budget || 150000) / 1000;
        const prog = (p.progress || 0) / 100;
        const rem = Math.round(est * (1 - prog));
        return `
          <tr>
            <td class="font-semibold text-primary">${p.id}</td>
            <td class="font-bold">${p.name}</td>
            <td>${p.client}</td>
            <td>${Math.round(est)} hrs</td>
            <td class="font-semibold text-warning">${rem} hrs remaining</td>
          </tr>
        `;
      }).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Project-level breakdown of allocated vs remaining capacity hours.</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Code</th><th>Project Name</th><th>Client</th><th>Total Estimated</th><th>Remaining Effort</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    } else if (metricId === 'metric-logged-hours') {
      title = 'Timesheet Logged Hours Ledger Drilldown';
      const rowsHtml = (timeLogs || []).map(t => `
        <tr>
          <td class="font-mono text-muted">${t.date || '2026-07-29'}</td>
          <td class="font-bold">${t.employee || 'Team Member'}</td>
          <td>${t.projectName || t.projectId || 'PRJ'}</td>
          <td><span class="badge bg-light text-dark border">${t.department || 'Dev'}</span></td>
          <td>${t.task || 'Development'}</td>
          <td class="font-bold text-primary">${t.hours} hrs</td>
        </tr>
      `).join('');
      bodyHtml = `
        <div class="mb-3 text-muted font-semibold" style="font-size: 0.85rem;">Timesheet entries logged in the system (${timeLogs.length} entries).</div>
        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover align-middle" style="font-size: 0.85rem;">
            <thead class="table-light sticky-top">
              <tr><th>Date</th><th>Employee</th><th>Project</th><th>Department</th><th>Task Description</th><th>Hours</th></tr>
            </thead>
            <tbody>${rowsHtml || '<tr><td colspan="6" class="text-center py-3 text-muted">No time logs recorded.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    } else {
      bodyHtml = `<p class="text-muted py-3">No detailed drilldown data available for this metric.</p>`;
    }

    if (this.app && typeof this.app.openModal === 'function') {
      this.app.openModal(title, bodyHtml);
    }
  }
};
