/* dashboard.js - Orchestrator for the main Executive Dashboard metrics, Chart.js integrations, and widgets */

import { Charts } from './charts.js';
import { Storage } from './storage.js';

export const DashboardModule = {
  // High fidelity dummy datasets representing standard portfolio configurations
  getDummyJSON() {
    return {
      customerProjects: [
        { label: 'AeroSpace Inc.', value: 12 },
        { label: 'Defense Lab', value: 8 },
        { label: 'Speedy Delivery', value: 15 },
        { label: 'Global Bank Corp.', value: 5 },
        { label: 'GreenField Farms', value: 2 }
      ],
      projectStatus: [
        { label: 'In Progress', value: 18 },
        { label: 'Completed', value: 20 },
        { label: 'Planning', value: 10 },
        { label: 'On Hold', value: 4 },
        { label: 'Delayed', value: 3 },
        { label: 'Critical', value: 1 }
      ],
      projectPriority: [
        { label: 'High Priority', value: 15 },
        { label: 'Medium Priority', value: 20 },
        { label: 'Low Priority', value: 7 }
      ],
      projectRisk: [
        { label: 'Critical Risks', value: 2 },
        { label: 'High Risks', value: 5 },
        { label: 'Medium Risks', value: 12 },
        { label: 'Low Risks', value: 18 }
      ],
      monthlyDeliveries: [
        { label: 'Jan', value: 3 },
        { label: 'Feb', value: 5 },
        { label: 'Mar', value: 4 },
        { label: 'Apr', value: 7 },
        { label: 'May', value: 8 },
        { label: 'Jun', value: 12 },
        { label: 'Jul', value: 10 },
        { label: 'Aug', value: 9 },
        { label: 'Sep', value: 11 },
        { label: 'Oct', value: 14 },
        { label: 'Nov', value: 13 },
        { label: 'Dec', value: 16 }
      ],
      departmentEffort: [
        { label: 'Engineering', value: 45 },
        { label: 'Design', value: 15 },
        { label: 'QA / Test', value: 25 },
        { label: 'Product', value: 10 },
        { label: 'Operations', value: 12 }
      ],
      remainingHours: [
        { label: 'Engineering', value: 540 },
        { label: 'Design', value: 180 },
        { label: 'QA / Test', value: 320 },
        { label: 'Operations', value: 200 }
      ],
      resourceUtilization: [
        { label: 'Lead Architects', value: 95 },
        { label: 'Fullstack Devs', value: 100 },
        { label: 'UX Designers', value: 75 },
        { label: 'QA Engineers', value: 60 },
        { label: 'Product Managers', value: 85 }
      ],
      sowStatus: [
        { label: 'Approved', value: 24 },
        { label: 'Pending Client Sign-off', value: 5 },
        { label: 'Under Draft', value: 8 },
        { label: 'In Review', value: 5 }
      ]
    };
  },

  getTasksData() {
    return [
      { id: 't1', title: 'Review Phase 1 System Architecture blueprint', priority: 'high', due: 'In 2 days', completed: false },
      { id: 't2', title: 'Prepare Q3 resource allocation matrix spreadsheets', priority: 'medium', due: 'In 4 days', completed: false },
      { id: 't3', title: 'Perform weekly risk matrix audits with security leads', priority: 'low', due: 'In 5 days', completed: true },
      { id: 't4', title: 'Coordinate external client reviews for dashboard UI', priority: 'high', due: 'In 6 days', completed: false }
    ];
  },

  getRecentActivities() {
    return [
      { id: 'a1', desc: '<span>Sarah Connor</span> allocated 3 designers to Project Ares', type: 'primary', time: '10 minutes ago' },
      { id: 'a2', desc: '<span>John Doe</span> marked risk "Spike in API latency" as <span>Mitigated</span>', type: 'success', time: '2 hours ago' },
      { id: 'a3', desc: '<span>Leave Tracker</span> auto-approved 3 vacation requests for QA team', type: 'success', time: '4 hours ago' },
      { id: 'a4', desc: '<span>Critical Alert:</span> Server backup execution failed', type: 'danger', time: '1 day ago' },
      { id: 'a5', desc: '<span>Alex Mercer</span> created new project <span>Zeus Shield</span>', type: 'primary', time: '1 day ago' }
    ];
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
        activeLeavesCount = 2; // fallback
      }

      // Dynamic integration with Weekend Planner
      let activeWeekendCount = weekendSupport; // fallback
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
      'metric-total-customers': '14',
      'metric-total-projects': '42',
      'metric-projects-in-progress': '18',
      'metric-completed-projects': '20',
      'metric-delayed-projects': '3',
      'metric-critical-projects': '1',
      'metric-pending-sow': '5',
      'metric-employees-on-leave': '2',
      'metric-weekend-support': '4',
      'metric-avg-project-health': '92%',
      'metric-remaining-hours': '1,240',
      'metric-logged-hours': '4,850'
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
  }
};
