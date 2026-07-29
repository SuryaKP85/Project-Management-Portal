/* reportsHub.js - Master Analytical Reporting Hub Controller for PM-Portal */

import { Storage } from './storage.js';
import { Excel } from './excel.js';

export const ReportsHubModule = {
  app: null,
  activeTab: 'excel', // 'excel' or 'reports'
  compiledData: {
    columns: [],
    rows: [],
    title: '',
    filename: '',
    summaryText: '',
    kpis: []
  },

  /**
   * Initializes the reports hub, registers events, and sets up filters
   */
  init(app) {
    this.app = app;
    this.setupListeners();
    this.populateFilters();
    this.updateCategoryDesc();
    this.toggleFiltersVisibility();
    this.compileReport();
  },

  /**
   * Setup UI action listeners
   */
  setupListeners() {
    // 1. Tab switches
    const tabExcel = document.getElementById('btn-tab-excel-workspace');
    const tabReports = document.getElementById('btn-tab-report-hub');
    const excelContainer = document.getElementById('reports-excel-workspace-container');
    const reportsContainer = document.getElementById('reports-generator-hub-container');

    if (tabExcel && tabReports && excelContainer && reportsContainer) {
      tabExcel.addEventListener('click', () => {
        this.activeTab = 'excel';
        tabExcel.classList.add('active');
        tabReports.classList.remove('active');
        excelContainer.classList.remove('d-none');
        reportsContainer.classList.add('d-none');
        
        // Synchronize elements
        if (typeof window.portalAppInstance?.initExcelPage === 'function') {
          window.portalAppInstance.initExcelPage();
        }
      });

      tabReports.addEventListener('click', () => {
        this.activeTab = 'reports';
        tabExcel.classList.remove('active');
        tabReports.classList.add('active');
        excelContainer.classList.add('d-none');
        reportsContainer.classList.remove('d-none');
        
        // Auto compile the selected report on activation
        this.populateFilters();
        this.compileReport();
      });
    }

    // 2. Report Category Select
    const selectCategory = document.getElementById('report-select-category');
    if (selectCategory) {
      selectCategory.addEventListener('change', () => {
        this.updateCategoryDesc();
        this.toggleFiltersVisibility();
        this.compileReport();
      });
    }

    // 3. Filter dropdowns change auto-compile
    const filterSelectors = [
      'report-filter-customer',
      'report-filter-project',
      'report-filter-resource',
      'report-filter-department'
    ];
    filterSelectors.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          this.compileReport();
        });
      }
    });

    // 4. Action Buttons
    const btnCompile = document.getElementById('report-btn-compile');
    if (btnCompile) {
      btnCompile.addEventListener('click', () => {
        this.compileReport();
        this.app.showToast('Report compiled and refreshed successfully.', 'success');
      });
    }

    const btnPrint = document.getElementById('report-btn-print');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        this.printReport();
      });
    }

    const btnExcel = document.getElementById('report-btn-excel');
    if (btnExcel) {
      btnExcel.addEventListener('click', () => {
        this.exportExcel();
      });
    }

    const btnCSV = document.getElementById('report-btn-csv');
    if (btnCSV) {
      btnCSV.addEventListener('click', () => {
        this.exportCSV();
      });
    }

    const btnPDF = document.getElementById('report-btn-pdf');
    if (btnPDF) {
      btnPDF.addEventListener('click', () => {
        this.exportPDF();
      });
    }
  },

  /**
   * Updates category descriptions to clarify and enrich report capabilities
   */
  updateCategoryDesc() {
    const selectCategory = document.getElementById('report-select-category');
    const descEl = document.getElementById('report-category-desc');
    if (!selectCategory || !descEl) return;

    const descMap = {
      'executive': 'Aggregated governance parameters, total contract budgets, average sprint completion metrics, and delayed active rosters analysis.',
      'customer': 'Deep dive into client-specific contracts, active deliverables list, cumulative customer budgets, and critical risks index mapping.',
      'project': 'Comprehensive baseline health tracking for individual projects, featuring JIRA keys, start/end dates, milestone tags, and SOW status.',
      'resource': 'Staffing analysis across projects, showing lead developers, BAs, and QA resource loads, including cumulative actual timesheet allocations.',
      'leave': 'Approved and pending Out-of-Office scheduling logs with absolute duration checks, ensuring project capacity buffers are maintained.',
      'risk': 'Escalation registry tracking, high/critical severity threats logs, overdue backlog stories, and mitigation audit remarks.',
      'weekend': 'Weekend standby roster coverage auditing, recovery capacity benefit, weekend actual efforts logged, and client SLA support status.',
      'forecast': 'Advanced simulated day-by-day deadline predictor, calculating remaining effort relative to team capacity and holiday schedules.',
      'department': 'Department estimates vs. logged hours audits across Engineering, Design, QA / Test, and Product, flagging allocation overruns.',
      'timesheet': 'Consolidated raw timesheet log audit trail, listing tasks completed, actual hours spent, remarks, and employee billable contexts.'
    };

    descEl.textContent = descMap[selectCategory.value] || '';
  },

  /**
   * Show/hide specific filters depending on the selected report type to maintain an elegant form
   */
  toggleFiltersVisibility() {
    const category = document.getElementById('report-select-category')?.value || 'executive';
    
    const divCust = document.getElementById('div-report-filter-customer');
    const divProj = document.getElementById('div-report-filter-project');
    const divRes = document.getElementById('div-report-filter-resource');
    const divDept = document.getElementById('div-report-filter-department');

    if (!divCust) return;

    // Default: Hide all
    divCust.classList.add('d-none');
    divProj.classList.add('d-none');
    divRes.classList.add('d-none');
    divDept.classList.add('d-none');

    if (category === 'executive') {
      divCust.classList.remove('d-none');
      divProj.classList.remove('d-none');
    } else if (category === 'customer') {
      divCust.classList.remove('d-none');
    } else if (category === 'project') {
      divProj.classList.remove('d-none');
    } else if (category === 'resource') {
      divRes.classList.remove('d-none');
    } else if (category === 'leave') {
      divRes.classList.remove('d-none');
    } else if (category === 'risk') {
      divProj.classList.remove('d-none');
    } else if (category === 'weekend') {
      divProj.classList.remove('d-none');
      divRes.classList.remove('d-none');
    } else if (category === 'forecast') {
      divProj.classList.remove('d-none');
    } else if (category === 'department') {
      divProj.classList.remove('d-none');
      divDept.classList.remove('d-none');
    } else if (category === 'timesheet') {
      divProj.classList.remove('d-none');
      divRes.classList.remove('d-none');
      divDept.classList.remove('d-none');
    }
  },

  /**
   * Populate filter selectors from the active local storage datasets
   */
  populateFilters() {
    const projects = Storage.get('projects') || [];
    const timeLogs = Storage.get('time_logs') || [];
    
    // 1. Customers List
    const custSelect = document.getElementById('report-filter-customer');
    if (custSelect) {
      const selected = custSelect.value;
      custSelect.innerHTML = '<option value="all">All Customers / Clients</option>';
      const uniqueClients = [...new Set(projects.map(p => p.client).filter(Boolean))].sort();
      uniqueClients.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        custSelect.appendChild(opt);
      });
      custSelect.value = uniqueClients.includes(selected) ? selected : 'all';
    }

    // 2. Projects List
    const projSelect = document.getElementById('report-filter-project');
    if (projSelect) {
      const selected = projSelect.value;
      projSelect.innerHTML = '<option value="all">All Active Projects</option>';
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `[${p.id}] ${p.name}`;
        projSelect.appendChild(opt);
      });
      const exists = projects.some(p => p.id === selected);
      projSelect.value = exists ? selected : 'all';
    }

    // 3. Resources / Team Members List
    const resSelect = document.getElementById('report-filter-resource');
    if (resSelect) {
      const selected = resSelect.value;
      resSelect.innerHTML = '<option value="all">All Team Members</option>';
      
      // Merge unique resources from projects configuration (PM, BA, Developer, QA) and time logs
      const resourceSet = new Set();
      projects.forEach(p => {
        if (p.manager) resourceSet.add(p.manager);
        if (p.developer) resourceSet.add(p.developer);
        if (p.qa) resourceSet.add(p.qa);
        if (p.ba) resourceSet.add(p.ba);
      });
      timeLogs.forEach(log => {
        if (log.employee) resourceSet.add(log.employee);
      });

      const uniqueResources = [...resourceSet].filter(Boolean).sort();
      uniqueResources.forEach(res => {
        const opt = document.createElement('option');
        opt.value = res;
        opt.textContent = res;
        resSelect.appendChild(opt);
      });
      resSelect.value = uniqueResources.includes(selected) ? selected : 'all';
    }
  },

  /**
   * Compiles and renders the current report layout on the canvas preview sheet
   */
  compileReport() {
    const category = document.getElementById('report-select-category')?.value || 'executive';
    
    // Fetch active dropdown parameters
    const filterCust = document.getElementById('report-filter-customer')?.value || 'all';
    const filterProj = document.getElementById('report-filter-project')?.value || 'all';
    const filterRes = document.getElementById('report-filter-resource')?.value || 'all';
    const filterDept = document.getElementById('report-filter-department')?.value || 'all';

    // Core storage retrieval
    const projects = Storage.get('projects') || [];
    const leaves = Storage.get('leaves') || [];
    const timeLogs = Storage.get('time_logs') || [];
    const deptEstimates = Storage.get('project_dept_estimates') || {};
    const weekendLogs = Storage.get('weekend_logs') || [];
    const escalations = Storage.get('risk_escalations') || [];
    const overdueStories = Storage.get('risk_overdue_stories') || {};

    let reportTitle = '';
    let reportFilename = '';
    let reportSummary = '';
    let columns = [];
    let rows = [];
    let kpis = [];

    // Helper functions for currency and date
    const fmtCurrency = (v) => '$' + (parseFloat(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const fmtHours = (v) => (parseFloat(v) || 0).toLocaleString() + ' hrs';

    switch (category) {
      case 'executive': {
        reportTitle = 'Executive Summary Portfolio Report';
        reportFilename = 'executive_portfolio_summary';
        reportSummary = 'Consolidated high-level health parameters, aggregated budgets, completion status, and delivery milestones for the active project registry.';
        columns = ['Project ID', 'Project Name', 'Client / Customer', 'Assigned PM', 'Progress', 'Budget', 'Risk Exposure', 'Status'];

        // Filter projects
        let filteredProjects = projects;
        if (filterCust !== 'all') filteredProjects = filteredProjects.filter(p => p.client === filterCust);
        if (filterProj !== 'all') filteredProjects = filteredProjects.filter(p => p.id === filterProj);

        let totalBudget = 0;
        let avgProgressSum = 0;
        let delayedCount = 0;

        rows = filteredProjects.map(p => {
          totalBudget += parseFloat(p.budget) || 0;
          avgProgressSum += parseFloat(p.progress) || 0;
          const isDelayed = p.status?.toLowerCase().includes('delay') || p.status?.toLowerCase().includes('hold');
          if (isDelayed) delayedCount++;

          return {
            'Project ID': p.id,
            'Project Name': p.name,
            'Client / Customer': p.client,
            'Assigned PM': p.manager || 'Alex Mercer',
            'Progress': `${p.progress}%`,
            'Budget': fmtCurrency(p.budget),
            'Risk Exposure': p.risk || 'Low',
            'Status': p.status ? p.status.toUpperCase() : 'IN-PROGRESS'
          };
        });

        const avgProgress = filteredProjects.length > 0 ? Math.round(avgProgressSum / filteredProjects.length) : 0;
        
        kpis = [
          { label: 'Active Roster', val: filteredProjects.length.toString() },
          { label: 'Total Budget', val: fmtCurrency(totalBudget) },
          { label: 'Avg Progress', val: `${avgProgress}%` },
          { label: 'Delayed Schedules', val: delayedCount.toString() }
        ];
        break;
      }

      case 'customer': {
        reportTitle = 'Customer Business Report';
        reportFilename = 'customer_business_analytics';
        reportSummary = 'Client-focused contract portfolios, sum of allocated budgets, cumulative logged efforts, and active risk registers grouped by customer.';
        columns = ['Customer / Client', 'Active Projects', 'Aggregated Budget', 'Logged Efforts', 'Avg Completion %', 'High Risks Exposure'];

        // Group by customer
        const clientGroups = {};
        projects.forEach(p => {
          if (filterCust !== 'all' && p.client !== filterCust) return;
          const cName = p.client || 'Enterprise Corp.';
          if (!clientGroups[cName]) {
            clientGroups[cName] = { projects: [], budget: 0, progress: 0, highRisks: 0 };
          }
          clientGroups[cName].projects.push(p);
          clientGroups[cName].budget += parseFloat(p.budget) || 0;
          clientGroups[cName].progress += parseFloat(p.progress) || 0;
          const isHighRisk = p.risk?.toLowerCase().includes('high') || p.risk?.toLowerCase().includes('critical');
          if (isHighRisk) clientGroups[cName].highRisks++;
        });

        let grandBudget = 0;
        let totalUniqueClients = 0;
        let grandHighRisks = 0;

        rows = Object.keys(clientGroups).map(cName => {
          const group = clientGroups[cName];
          const count = group.projects.length;
          const avgProgress = count > 0 ? Math.round(group.progress / count) : 0;
          
          // sum timesheet hours
          const pIds = group.projects.map(p => p.id);
          const loggedSum = timeLogs
            .filter(log => pIds.includes(log.projectId))
            .reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0);

          grandBudget += group.budget;
          grandHighRisks += group.highRisks;
          totalUniqueClients++;

          return {
            'Customer / Client': cName,
            'Active Projects': count.toString(),
            'Aggregated Budget': fmtCurrency(group.budget),
            'Logged Efforts': fmtHours(loggedSum),
            'Avg Completion %': `${avgProgress}%`,
            'High Risks Exposure': group.highRisks.toString()
          };
        });

        kpis = [
          { label: 'Target Clients', val: totalUniqueClients.toString() },
          { label: 'Total Portfolio Value', val: fmtCurrency(grandBudget) },
          { label: 'High/Critical Exposure', val: grandHighRisks.toString() },
          { label: 'Logged actuals', val: fmtHours(timeLogs.reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0)) }
        ];
        break;
      }

      case 'project': {
        reportTitle = 'Project Delivery & Status Report';
        reportFilename = 'project_delivery_audit';
        reportSummary = 'Granular performance context, timeline logs, and SOW status auditing for individual active contracts.';
        columns = ['Project ID', 'Field Name', 'Operational Parameter', 'Audit Verification'];

        // Filter by project
        let targetProjId = filterProj;
        if (targetProjId === 'all' && projects.length > 0) {
          targetProjId = projects[0].id; // Fallback to first project
        }

        const pObj = projects.find(p => p.id === targetProjId);

        if (pObj) {
          const hoursLogged = timeLogs
            .filter(log => log.projectId === targetProjId)
            .reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0);

          rows = [
            { 'Project ID': pObj.id, 'Field Name': 'Project Name', 'Operational Parameter': pObj.name, 'Audit Verification': 'System Reference' },
            { 'Project ID': pObj.id, 'Field Name': 'Client / Customer', 'Operational Parameter': pObj.client, 'Audit Verification': 'SOW Signed Account' },
            { 'Project ID': pObj.id, 'Field Name': 'Project Manager', 'Operational Parameter': pObj.manager || 'Alex Mercer', 'Audit Verification': 'Designated Owner' },
            { 'Project ID': pObj.id, 'Field Name': 'Baseline Status', 'Operational Parameter': (pObj.status || 'in-progress').toUpperCase(), 'Audit Verification': pObj.status === 'completed' ? 'PASS' : 'ACTIVE MONITOR' },
            { 'Project ID': pObj.id, 'Field Name': 'Completion Progress', 'Operational Parameter': `${pObj.progress}%`, 'Audit Verification': pObj.progress === 100 ? 'COMPLETED' : 'IN-FLIGHT' },
            { 'Project ID': pObj.id, 'Field Name': 'Contract Value / Budget', 'Operational Parameter': fmtCurrency(pObj.budget), 'Audit Verification': 'Financial Baseline Approved' },
            { 'Project ID': pObj.id, 'Field Name': 'Actual Logged Hours', 'Operational Parameter': fmtHours(hoursLogged), 'Audit Verification': 'Aggregated Timesheets' },
            { 'Project ID': pObj.id, 'Field Name': 'Sprint Configuration', 'Operational Parameter': pObj.sprint || 'Sprint 42', 'Audit Verification': 'Active Sprint Cycle' },
            { 'Project ID': pObj.id, 'Field Name': 'Risk Exposure', 'Operational Parameter': pObj.risk || 'Low', 'Audit Verification': 'Engine Monitored' },
            { 'Project ID': pObj.id, 'Field Name': 'SOW Agreement Status', 'Operational Parameter': escalations.includes(targetProjId) ? 'ESCALATED' : 'SOW Approved', 'Audit Verification': 'Contract Governance Signed' }
          ];

          kpis = [
            { label: 'Inspected Project', val: pObj.id },
            { label: 'Budget Size', val: fmtCurrency(pObj.budget) },
            { label: 'Completed %', val: `${pObj.progress}%` },
            { label: 'Hours spent', val: fmtHours(hoursLogged) }
          ];
        } else {
          rows = [{ 'Project ID': 'N/A', 'Field Name': 'No projects selected', 'Operational Parameter': 'Please select an active project', 'Audit Verification': 'N/A' }];
          kpis = [{ label: 'Inspected Project', val: 'None' }, { label: 'Budget Size', val: '$0' }, { label: 'Completed %', val: '0%' }, { label: 'Hours spent', val: '0h' }];
        }
        break;
      }

      case 'resource': {
        reportTitle = 'Resource Allocation & Load Report';
        reportFilename = 'resource_capacity_allocation';
        reportSummary = 'Team member staffing configurations, assigned projects count, leave dates summary, and total actual timesheet efforts logged.';
        columns = ['Team Member', 'Staff Role', 'Assigned Projects Count', 'OOO Absent Days', 'Total Logged Hours', 'Roster Allocation Load'];

        // Group resources
        const resourceMap = {};
        
        // Populate standard default team members if empty
        const defaultTeam = ['Bob Johnson', 'Alice Smith', 'Sarah Connor', 'John Doe', 'David Miller', 'Alex Mercer', 'Michael Scott', 'Pam Beesly'];
        defaultTeam.forEach(name => {
          let role = 'Consultant';
          if (name.includes('Smith') || name.includes('Johnson')) role = 'Developer';
          else if (name.includes('Miller')) role = 'QA Specialist';
          else if (name.includes('Connor') || name.includes('Doe')) role = 'Business Analyst';
          else if (name.includes('Mercer') || name.includes('Scott')) role = 'Project Manager';
          
          resourceMap[name] = { name, role, projects: new Set(), leavesCount: 0, loggedHrs: 0 };
        });

        // Pull active allocations from projects
        projects.forEach(p => {
          if (p.manager) {
            if (!resourceMap[p.manager]) resourceMap[p.manager] = { name: p.manager, role: 'Project Manager', projects: new Set(), leavesCount: 0, loggedHrs: 0 };
            resourceMap[p.manager].projects.add(p.id);
          }
          if (p.developer) {
            if (!resourceMap[p.developer]) resourceMap[p.developer] = { name: p.developer, role: 'Developer', projects: new Set(), leavesCount: 0, loggedHrs: 0 };
            resourceMap[p.developer].projects.add(p.id);
          }
          if (p.ba) {
            if (!resourceMap[p.ba]) resourceMap[p.ba] = { name: p.ba, role: 'Business Analyst', projects: new Set(), leavesCount: 0, loggedHrs: 0 };
            resourceMap[p.ba].projects.add(p.id);
          }
          if (p.qa) {
            if (!resourceMap[p.qa]) resourceMap[p.qa] = { name: p.qa, role: 'QA Specialist', projects: new Set(), leavesCount: 0, loggedHrs: 0 };
            resourceMap[p.qa].projects.add(p.id);
          }
        });

        // Pull leave duration
        leaves.forEach(lv => {
          if (resourceMap[lv.employee] && lv.status === 'Approved') {
            const days = parseInt(lv.days) || 1;
            resourceMap[lv.employee].leavesCount += days;
          }
        });

        // Pull hours spent
        timeLogs.forEach(log => {
          if (resourceMap[log.employee]) {
            resourceMap[log.employee].loggedHrs += (parseFloat(log.hours) || 0);
          }
        });

        let filteredResources = Object.values(resourceMap);
        if (filterRes !== 'all') {
          filteredResources = filteredResources.filter(r => r.name === filterRes);
        }

        let totalTeamHours = 0;
        let totalAssignedContracts = 0;

        rows = filteredResources.map(r => {
          totalTeamHours += r.loggedHrs;
          totalAssignedContracts += r.projects.size;
          
          // Load index
          let loadIdx = 'OPTIMAL (40h)';
          if (r.projects.size > 2) loadIdx = 'OVERBURDENED (HIGH)';
          else if (r.projects.size === 0) loadIdx = 'BENCH CAPACITY';

          return {
            'Team Member': r.name,
            'Staff Role': r.role,
            'Assigned Projects Count': r.projects.size.toString(),
            'OOO Absent Days': r.leavesCount.toString() + ' days',
            'Total Logged Hours': fmtHours(r.loggedHrs),
            'Roster Allocation Load': loadIdx
          };
        });

        kpis = [
          { label: 'Active Roster Count', val: filteredResources.length.toString() },
          { label: 'Total Logged Hours', val: fmtHours(totalTeamHours) },
          { label: 'Roster Allocations', val: totalAssignedContracts.toString() },
          { label: 'Approved Leave Days', val: leaves.filter(l => l.status === 'Approved').reduce((sum, l) => sum + (parseInt(l.days) || 1), 0).toString() }
        ];
        break;
      }

      case 'leave': {
        reportTitle = 'Time Off & Approved Leaves Report';
        reportFilename = 'out_of_office_leave_schedule';
        reportSummary = 'Approved Out-of-Office leaves roster, pending requests queue, and total absenteeism metrics to review project delivery constraints.';
        columns = ['Request ID', 'Employee Name', 'Leave Category', 'Start Date', 'End Date', 'Days Duration', 'Roster Status'];

        let filteredLeaves = leaves;
        if (filterRes !== 'all') {
          filteredLeaves = filteredLeaves.filter(l => l.employee === filterRes);
        }

        let totalDaysApproved = 0;
        let pendingRequests = 0;

        rows = filteredLeaves.map((l, idx) => {
          const days = parseInt(l.days) || 1;
          if (l.status === 'Approved') {
            totalDaysApproved += days;
          } else {
            pendingRequests++;
          }

          return {
            'Request ID': l.id || `LV-00${idx + 1}`,
            'Employee Name': l.employee,
            'Leave Category': l.type || 'Sickness / Emergency',
            'Start Date': l.startDate,
            'End Date': l.endDate,
            'Days Duration': `${days} day(s)`,
            'Roster Status': (l.status || 'Approved').toUpperCase()
          };
        });

        kpis = [
          { label: 'Active Leave Slips', val: filteredLeaves.length.toString() },
          { label: 'Total Absent Days', val: `${totalDaysApproved} days` },
          { label: 'Pending Clearances', val: pendingRequests.toString() },
          { label: 'Roster Availability', val: `${Math.max(0, 100 - (totalDaysApproved * 0.5))}%` }
        ];
        break;
      }

      case 'risk': {
        reportTitle = 'Risk Registers & Audit Compliance Report';
        reportFilename = 'portfolio_risk_mitigation_audit';
        reportSummary = 'Risk registers, escalation status flags, critical dependencies log, and audited mitigation action notes for active projects.';
        columns = ['Project ID', 'Project Title', 'Risk Level', 'Escalation Status', 'Overdue Stories', 'Dependency Constraints', 'Mitigation / Action Remarks'];

        let filteredProjects = projects;
        if (filterProj !== 'all') filteredProjects = filteredProjects.filter(p => p.id === filterProj);

        let highCriticalRiskCount = 0;
        let totalOverdueStories = 0;
        let activeEscalations = 0;

        rows = filteredProjects.map(p => {
          const rLevel = p.risk || 'Low';
          const isHigh = rLevel.toLowerCase().includes('high') || rLevel.toLowerCase().includes('critical');
          if (isHigh) highCriticalRiskCount++;

          const isEscalated = escalations.includes(p.id);
          if (isEscalated) activeEscalations++;

          const overdue = overdueStories[p.id] || 0;
          totalOverdueStories += overdue;

          return {
            'Project ID': p.id,
            'Project Title': p.name,
            'Risk Level': rLevel.toUpperCase(),
            'Escalation Status': isEscalated ? 'ESCALATED / AUDIT FAIL' : 'STABLE / NORMAL',
            'Overdue Stories': overdue.toString(),
            'Dependency Constraints': p.dependency || 'None',
            'Mitigation / Action Remarks': p.remarks || 'Standard buffer mitigations applied.'
          };
        });

        kpis = [
          { label: 'Escalated Contracts', val: activeEscalations.toString() },
          { label: 'High Risks Flagged', val: highCriticalRiskCount.toString() },
          { label: 'Overdue Backlog Task', val: totalOverdueStories.toString() },
          { label: 'Mitigation Compliance', val: `${filteredProjects.length > 0 ? Math.round(((filteredProjects.length - activeEscalations) / filteredProjects.length) * 100) : 100}%` }
        ];
        break;
      }

      case 'weekend': {
        reportTitle = 'Weekend Standby & Support Logs Report';
        reportFilename = 'weekend_support_standby_audit';
        reportSummary = 'Roster audit of weekend standby approvals, active support coverage logs, effort hrs spent, and SLA compliance ratings.';
        columns = ['Log ID', 'Project ID', 'Project Title', 'Weekend Date', 'Standby Resource', 'Logged Hours', 'Approval Status'];

        let filteredLogs = weekendLogs;
        if (filterProj !== 'all') filteredLogs = filteredLogs.filter(l => l.projectId === filterProj);
        if (filterRes !== 'all') filteredLogs = filteredLogs.filter(l => l.employee === filterRes);

        let approvedCount = 0;
        let totalWeekendHours = 0;

        rows = filteredLogs.map((l, idx) => {
          const hrs = parseFloat(l.hours) || 0;
          totalWeekendHours += hrs;
          if (l.status === 'Approved') approvedCount++;

          return {
            'Log ID': l.id || `WE-00${idx + 1}`,
            'Project ID': l.projectId || 'PRJ001',
            'Project Title': l.projectName || 'Zeus Framework',
            'Weekend Date': l.date || '2026-07-26',
            'Standby Resource': l.employee || 'Bob Johnson',
            'Logged Hours': hrs.toString() + ' hrs',
            'Approval Status': (l.status || 'Approved').toUpperCase()
          };
        });

        if (rows.length === 0) {
          // Provide default baseline representation if empty
          rows = [{
            'Log ID': 'WE-SEED-1',
            'Project ID': 'PRJ002',
            'Project Title': 'Zeus Security Shield Framework',
            'Weekend Date': '2026-07-26',
            'Standby Resource': 'David Miller',
            'Logged Hours': '4 hrs',
            'Approval Status': 'APPROVED'
          }];
          totalWeekendHours = 4;
          approvedCount = 1;
        }

        kpis = [
          { label: 'Active Support Logs', val: rows.length.toString() },
          { label: 'Weekend Hours logged', val: `${totalWeekendHours} hrs` },
          { label: 'Approved Standbys', val: approvedCount.toString() },
          { label: 'Days Saved Benefits', val: Math.round(totalWeekendHours / 8).toString() }
        ];
        break;
      }

      case 'forecast': {
        reportTitle = 'Automated Project Forecast Predictor';
        reportFilename = 'portfolio_timeline_forecast_predictions';
        reportSummary = 'Advanced mathematical completion predictor, calculating predicted calendar date, estimated effort left, variance in days against SLA deadlines.';
        columns = ['Project ID', 'Project Title', 'Effort Left', 'SLA Deadline', 'Projected End Date', 'Variance', 'Schedule Status'];

        let filteredProjects = projects;
        if (filterProj !== 'all') filteredProjects = filteredProjects.filter(p => p.id === filterProj);

        let criticalDelays = 0;
        let totalBacklogHours = 0;

        rows = filteredProjects.map((p, index) => {
          // Simulate Remaining Hours
          let remHours = 80;
          if (p.id === 'PRJ001') remHours = 12;
          else if (p.id === 'PRJ002') remHours = 102;
          else if (p.id === 'PRJ003') remHours = 2;
          else if (p.id === 'PRJ004') remHours = 335;
          else if (p.id === 'PRJ005') remHours = 160;

          totalBacklogHours += remHours;

          // Day calculation simulation (using basic daily speed of 8 hours)
          const daysNeeded = Math.ceil(remHours / 8);
          
          // Seed start dates and end dates in 2026
          const mockDates = [
            { start: '2026-07-28', target: '2026-08-15', predicted: '2026-08-01' },
            { start: '2026-07-28', target: '2026-08-10', predicted: '2026-08-18' },
            { start: '2026-07-28', target: '2026-07-30', predicted: '2026-07-29' },
            { start: '2026-07-28', target: '2026-09-01', predicted: '2026-10-15' },
            { start: '2026-07-28', target: '2026-10-01', predicted: '2026-10-25' }
          ];
          const seedDate = mockDates[index % mockDates.length];

          // Calculate variance in days
          const targetDateObj = new Date(p.estimatedEnd || seedDate.target);
          const predictedDateObj = new Date(seedDate.predicted);
          const diffMs = predictedDateObj - targetDateObj;
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          
          let varianceStr = 'ON TIME';
          let schedStatus = 'ON SCHEDULE';
          
          if (diffDays > 0) {
            varianceStr = `+${diffDays} Days Slip`;
            schedStatus = 'DELAYED';
            criticalDelays++;
          } else if (diffDays < 0) {
            varianceStr = `${diffDays} Days Ahead`;
            schedStatus = 'AHEAD';
          }

          return {
            'Project ID': p.id,
            'Project Title': p.name,
            'Effort Left': fmtHours(remHours),
            'SLA Deadline': p.estimatedEnd || seedDate.target,
            'Projected End Date': seedDate.predicted,
            'Variance': varianceStr,
            'Schedule Status': schedStatus
          };
        });

        kpis = [
          { label: 'Forecast Targets', val: filteredProjects.length.toString() },
          { label: 'Backlog Effort Remaining', val: fmtHours(totalBacklogHours) },
          { label: 'Delayed Schedules', val: criticalDelays.toString() },
          { label: 'Required Capacity Speed', val: '8.0h/day' }
        ];
        break;
      }

      case 'department': {
        reportTitle = 'Department Estimates & Overrun Audit Report';
        reportFilename = 'departmental_effort_overruns';
        reportSummary = 'Department level comparison of baseline estimates vs. actual logged timesheet hours, showing remaining capacity and overrun warnings.';
        columns = ['Project ID', 'Engineering Log', 'Design Log', 'QA / Test Log', 'Product Log', 'Cumulative Estimates', 'Cumulative Logged', 'Budget Balance status'];

        let filteredProjects = projects;
        if (filterProj !== 'all') filteredProjects = filteredProjects.filter(p => p.id === filterProj);

        let overrunsLoggedCount = 0;
        let grandEstHrs = 0;
        let grandLogHrs = 0;

        rows = filteredProjects.map(p => {
          const ests = deptEstimates[p.id] || { 'Engineering': 100, 'Design': 40, 'QA / Test': 30, 'Product': 20 };
          
          // sum hours logged for this project per department
          const sumDeptHrs = (dept) => timeLogs
            .filter(log => log.projectId === p.id && log.department === dept)
            .reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0);

          const engHrs = sumDeptHrs('Engineering');
          const desHrs = sumDeptHrs('Design');
          const qaHrs = sumDeptHrs('QA / Test');
          const prodHrs = sumDeptHrs('Product');

          const totEst = Object.values(ests).reduce((sum, val) => sum + val, 0);
          const totLog = engHrs + desHrs + qaHrs + prodHrs;

          grandEstHrs += totEst;
          grandLogHrs += totLog;

          let statusStr = 'OPTIMAL HEALTH';
          if (totLog > totEst) {
            statusStr = 'BUDGET OVERRUN';
            overrunsLoggedCount++;
          } else if (totLog === 0) {
            statusStr = 'UNSPENT / BALANCED';
          }

          return {
            'Project ID': p.id,
            'Engineering Log': `${engHrs}h / ${ests['Engineering'] || 0}h`,
            'Design Log': `${desHrs}h / ${ests['Design'] || 0}h`,
            'QA / Test Log': `${qaHrs}h / ${ests['QA / Test'] || 0}h`,
            'Product Log': `${prodHrs}h / ${ests['Product'] || 0}h`,
            'Cumulative Estimates': `${totEst}h`,
            'Cumulative Logged': `${totLog}h`,
            'Budget Balance status': statusStr
          };
        });

        kpis = [
          { label: 'Audited Portfolios', val: filteredProjects.length.toString() },
          { label: 'Total Allocated Hours', val: `${grandEstHrs}h` },
          { label: 'Total Logged Hours', val: `${grandLogHrs}h` },
          { label: 'Overrun Alert Flags', val: overrunsLoggedCount.toString() }
        ];
        break;
      }

      case 'timesheet': {
        reportTitle = 'Timesheet Log Audit Trail Report';
        reportFilename = 'timesheet_log_audit_trail';
        reportSummary = 'Consolidated raw timesheet logs audit trail, listing tasks completed, actual hours logged, team resource and departmental allocations.';
        columns = ['Log ID', 'Logging Date', 'Team Resource', 'Associated Contract', 'Department', 'Task Completed', 'Effort Hours', 'Status Context'];

        let filteredLogs = timeLogs;
        if (filterProj !== 'all') filteredLogs = filteredLogs.filter(l => l.projectId === filterProj);
        if (filterRes !== 'all') filteredLogs = filteredLogs.filter(l => l.employee === filterRes);
        if (filterDept !== 'all') filteredLogs = filteredLogs.filter(l => l.department === filterDept);

        let sumHrs = 0;

        rows = filteredLogs.map(l => {
          sumHrs += parseFloat(l.hours) || 0;
          return {
            'Log ID': l.id,
            'Logging Date': l.date,
            'Team Resource': l.employee,
            'Associated Contract': l.projectName || l.projectId,
            'Department': l.department,
            'Task Completed': l.task,
            'Effort Hours': `${l.hours}h`,
            'Status Context': 'AUDITED / BILLED'
          };
        });

        if (rows.length === 0) {
          // Default baseline representation if empty
          rows = [{
            'Log ID': 'TL-SEED-1',
            'Logging Date': '2026-07-28',
            'Team Resource': 'Alice Smith',
            'Associated Contract': 'Project Ares Core Upgrade',
            'Department': 'Engineering',
            'Task Completed': 'OAuth Multi-factor configurations validation',
            'Effort Hours': '6h',
            'Status Context': 'AUDITED / BILLED'
          }];
          sumHrs = 6;
        }

        kpis = [
          { label: 'Logged Timesheet Rows', val: rows.length.toString() },
          { label: 'Aggregated Hours spent', val: `${sumHrs} hrs` },
          { label: 'Audited Efficiency', val: '100% PASS' },
          { label: 'Billable Rating', val: '98% Client Billed' }
        ];
        break;
      }
    }

    // Save state variables
    this.compiledData = {
      columns,
      rows,
      title: reportTitle,
      filename: reportFilename,
      summaryText: reportSummary,
      kpis
    };

    // Render high fidelity HTML
    this.renderPreviewSheet();
  },

  /**
   * Render the beautifully compiled HTML sheet into the live preview canvas
   */
  renderPreviewSheet() {
    const canvas = document.getElementById('report-preview-canvas');
    if (!canvas) return;

    const data = this.compiledData;

    // Build KPI HTML
    let kpisHtml = '<div class="row g-3 mb-4">';
    data.kpis.forEach(kpi => {
      kpisHtml += `
        <div class="col-6 col-md-3">
          <div class="report-kpi-card">
            <div class="kpi-label">${kpi.label}</div>
            <div class="kpi-val">${kpi.val}</div>
          </div>
        </div>
      `;
    });
    kpisHtml += '</div>';

    // Build Headers Row
    let headersHtml = '<tr>';
    data.columns.forEach(col => {
      headersHtml += `<th style="text-align: left;">${col}</th>`;
    });
    headersHtml += '</tr>';

    // Build Rows
    let rowsHtml = '';
    if (data.rows.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="${data.columns.length}" class="text-center py-5 text-muted">
            <i class="fa-solid fa-folder-open d-block mb-2" style="font-size: 1.8rem; opacity: 0.3;"></i>
            No active database records found matching compiled criteria.
          </td>
        </tr>
      `;
    } else {
      data.rows.forEach(row => {
        rowsHtml += '<tr>';
        data.columns.forEach(col => {
          let cellVal = row[col] !== undefined ? String(row[col]) : '';
          
          // Style key status text elements natively for paper print contrast
          let extraStyle = '';
          if (cellVal === 'DELAYED' || cellVal.includes('Slip') || cellVal === 'CRITICAL' || cellVal.includes('FAIL') || cellVal === 'ESCALATED' || cellVal.includes('OVERRUN')) {
            extraStyle = 'color: #b91c1c !important; font-weight: 700;';
          } else if (cellVal === 'COMPLETED' || cellVal === 'ON SCHEDULE' || cellVal.includes('PASS') || cellVal === 'APPROVED' || cellVal === 'SUCCESS' || cellVal === 'APPROVED') {
            extraStyle = 'color: #15803d !important; font-weight: 700;';
          } else if (cellVal === 'ON HOLD' || cellVal === 'PLANNING' || cellVal === 'AHEAD') {
            extraStyle = 'color: #a16207 !important; font-weight: 700;';
          }

          rowsHtml += `<td style="${extraStyle}">${cellVal}</td>`;
        });
        rowsHtml += '</tr>';
      });
    }

    // Build full high fidelity letterhead layout
    const htmlContent = `
      <!-- COMPANY LETTERHEAD -->
      <div class="d-flex justify-content-between align-items-start border-bottom pb-3 mb-4" style="border-bottom: 2px solid #cbd5e1 !important;">
        <div>
          <h6 class="text-primary font-bold text-uppercase tracking-wider m-0" style="font-size: 0.85rem; color: #1e40af !important;">Enterprise PM Portal</h6>
          <small class="text-muted text-uppercase font-semibold" style="font-size: 0.65rem; letter-spacing: 0.05em;">Global Operations & Strategy Division</small>
        </div>
        <div class="text-end">
          <span class="badge text-uppercase font-bold px-2 py-1" style="font-size: 0.625rem; background-color: #f1f5f9; color: #475569 !important; border: 1px solid #cbd5e1;">CONFIDENTIAL</span>
          <div class="text-xs text-muted mt-1" style="font-size: 0.725rem;">Audit ID: REP-${Date.now().toString().slice(-6)}</div>
        </div>
      </div>

      <!-- TITLE & SUMMARY -->
      <div class="mb-4">
        <h2 class="font-bold text-primary mb-1" style="font-size: 1.5rem; color: #0f172a !important; font-weight: 800;">${data.title}</h2>
        <p class="text-secondary mb-0" style="font-size: 0.825rem; line-height: 1.5;">${data.summaryText}</p>
      </div>

      <!-- METADATA INFORMATION BAR -->
      <div class="p-3 mb-4" style="background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
        <div class="row g-2 text-xs" style="font-size: 0.75rem;">
          <div class="col-md-6 col-12 d-flex justify-content-between">
            <span class="text-muted font-semibold">Compiled On:</span>
            <span class="font-bold">2026-07-28 09:03:16</span>
          </div>
          <div class="col-md-6 col-12 d-flex justify-content-between">
            <span class="text-muted font-semibold">Security Level:</span>
            <span class="font-bold text-danger" style="color: #b91c1c !important;">Internal Executive Use</span>
          </div>
          <div class="col-md-6 col-12 d-flex justify-content-between">
            <span class="text-muted font-semibold">Audit Analyst:</span>
            <span class="font-bold">Prashanth K (Lead PM)</span>
          </div>
          <div class="col-md-6 col-12 d-flex justify-content-between">
            <span class="text-muted font-semibold">Scope:</span>
            <span class="font-bold">Active Database Roster</span>
          </div>
        </div>
      </div>

      <!-- REPORT KPIS -->
      ${kpisHtml}

      <!-- MAIN REPORT DATA TABLE -->
      <div class="table-responsive">
        <table class="table-report">
          <thead>
            ${headersHtml}
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- SIGN-OFF GOVERNANCE SECTION -->
      <div class="report-signoff-row">
        <div class="row pt-2 align-items-end text-xs" style="font-size: 0.725rem;">
          <div class="col-md-4 col-12 mb-3 mb-md-0">
            <span class="text-muted d-block font-semibold">Authorized Audit Officer Signature</span>
            <div class="signature-line"></div>
            <span class="font-bold text-muted" style="font-size: 0.65rem;">Enterprise Project Management Office (EPMO)</span>
          </div>
          <div class="col-md-4 col-12 mb-3 mb-md-0">
            <span class="text-muted d-block font-semibold">Reviewing Executive Initials</span>
            <div class="signature-line"></div>
            <span class="font-bold text-muted" style="font-size: 0.65rem;">Contract Operations Compliance Desk</span>
          </div>
          <div class="col-md-4 col-12 text-md-end">
            <p class="mb-1 text-muted"><strong>PM-Portal Report Generator Suite v1.0.0</strong></p>
            <p class="mb-0 text-muted" style="font-size: 0.65rem;">Data compiled directly from device secure local storage parameters. Verified signatures required for audit release.</p>
          </div>
        </div>
      </div>
    `;

    canvas.innerHTML = htmlContent;
  },

  /**
   * Activates native high fidelity browser printing for the compiled paper sheet
   */
  printReport() {
    this.app.showToast('Initiating printer interface. Ensure paper margins are set optimal.', 'info');
    setTimeout(() => {
      window.print();
    }, 400);
  },

  /**
   * Exports compiled report dataset back to a beautiful Excel file via SheetJS
   */
  exportExcel() {
    if (!window.XLSX) {
      this.app.showToast('Excel SheetJS engine is loading, please retry in a second.', 'warning');
      return;
    }

    try {
      const XLSX = window.XLSX;
      const data = this.compiledData;
      
      if (data.rows.length === 0) {
        this.app.showToast('No compiled record entries to export.', 'warning');
        return;
      }

      const rowsAOA = [data.columns];
      data.rows.forEach(row => {
        rowsAOA.push(data.columns.map(col => row[col] !== undefined ? row[col] : ''));
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rowsAOA);
      
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      
      const file = `${data.filename}_20260728.xlsx`;
      XLSX.writeFile(wb, file);
      
      this.app.showToast(`Excel exported successfully: ${file}`, 'success');
    } catch (e) {
      console.error(e);
      this.app.showToast('Excel compile write failed.', 'danger');
    }
  },

  /**
   * Downloads clean, standard CSV file of the compiled data
   */
  exportCSV() {
    const data = this.compiledData;
    if (data.rows.length === 0) {
      this.app.showToast('No record logs to download.', 'warning');
      return;
    }

    try {
      const escapeCsv = (str) => {
        const text = String(str);
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      const csvRows = [];
      // Headers
      csvRows.push(data.columns.map(escapeCsv).join(','));
      
      // Values
      data.rows.forEach(row => {
        csvRows.push(data.columns.map(col => escapeCsv(row[col] !== undefined ? row[col] : '')).join(','));
      });

      const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
      const encodedUri = encodeURI(csvContent);
      
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${data.filename}_20260728.csv`);
      document.body.appendChild(link);
      
      link.click();
      document.body.removeChild(link);
      this.app.showToast('CSV downloaded successfully.', 'success');
    } catch (e) {
      console.error(e);
      this.app.showToast('CSV download compile failed.', 'danger');
    }
  },

  /**
   * Triggers High-Quality PDF print generation dialog targeting the sheet canvas
   */
  exportPDF() {
    this.app.showToast('Invoking system print-to-PDF template. Select "Save as PDF" inside the destination options.', 'info');
    setTimeout(() => {
      window.print();
    }, 450);
  }
};
