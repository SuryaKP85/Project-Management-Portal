/* customers.js - Customers Directory and Interactive Executive Performance Portfolio Dashboard */

import { Storage } from './storage.js';
import { Filters } from './filters.js';
import { Calculations } from './calculations.js';

export const CustomersModule = {
  app: null,
  activeCustomerId: null,
  activeTab: 'cust-overview',
  charts: {},

  /**
   * Initialize Customers Module
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;
    this.activeTab = 'cust-overview';
    this.activeCustomerId = null;
    
    // Set view back to list directory state
    this.showListView();
    
    // Render list
    this.renderDirectory();
    
    // Bind listeners
    this.setupEventListeners();
  },

  /**
   * Renders the master list of client accounts
   */
  renderDirectory() {
    const listBody = document.getElementById('customers-table-body');
    if (!listBody) return;

    listBody.innerHTML = '';
    const items = this.app.customersList || [];
    const query = document.getElementById('customer-search-input')?.value || '';
    const status = document.getElementById('customer-status-select')?.value || 'all';

    // Refresh dynamic project count based on projects in localStorage
    const projects = this.app.projectsList || [];
    const enrichedCustomers = items.map(c => {
      const pCount = projects.filter(p => p.client.toLowerCase().trim() === c.name.toLowerCase().trim()).length;
      return { ...c, projects: pCount };
    });

    let filtered = Filters.bySearch(enrichedCustomers, query, ['id', 'name', 'industry', 'contact']);
    filtered = Filters.byStatus(filtered, status, 'status');

    if (filtered.length === 0) {
      listBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No customers match the active filter criteria.</td></tr>`;
      return;
    }

    filtered.forEach(c => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.id = `row-cust-${c.id}`;
      
      const statusClass = c.status === 'active' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-muted';
      const statusLabel = c.status === 'active' ? 'Active Account' : 'Suspended';

      tr.innerHTML = `
        <td><div class="table-project-title font-mono font-bold">${c.id}</div></td>
        <td>
          <div class="font-bold text-primary-custom" style="color: var(--brand-primary); font-size: 1rem;">${c.name}</div>
          <small class="text-muted d-block">${c.projects} active enterprise projects</small>
        </td>
        <td><span class="text-secondary-custom font-semibold">${c.industry}</span></td>
        <td>
          <div class="font-semibold text-secondary-custom">${c.contact}</div>
          <small class="text-muted d-block" style="font-size: 0.75rem;">Lead Partner</small>
        </td>
        <td><span class="status-badge rounded-pill px-3 py-1 font-bold ${statusClass}">${statusLabel}</span></td>
      `;

      // Clicking a row opens the dashboard!
      tr.addEventListener('click', () => {
        this.openDashboard(c.id);
      });

      listBody.appendChild(tr);
    });
  },

  /**
   * Set up filters and list table triggers
   */
  setupEventListeners() {
    const searchInp = document.getElementById('customer-search-input');
    const statusSelect = document.getElementById('customer-status-select');
    const backBtn = document.getElementById('btn-back-to-cust-list');
    const tabBtns = document.querySelectorAll('.btn-cust-tab');
    const reportBtn = document.getElementById('btn-cust-summary-report');

    if (searchInp) {
      searchInp.addEventListener('input', () => {
        this.renderDirectory();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        this.renderDirectory();
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.showListView();
      });
    }

    if (tabBtns) {
      tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tab = e.currentTarget.getAttribute('data-tab');
          this.switchTab(tab);
        });
      });
    }

    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        this.openSummaryReportModal();
      });
    }
  },

  /**
   * Toggles UI panels back to the Customers Directory list
   */
  showListView() {
    const listCont = document.getElementById('customers-list-container');
    const dashCont = document.getElementById('customers-dashboard-container');
    
    if (listCont) listCont.style.display = 'block';
    if (dashCont) dashCont.style.display = 'none';
    this.activeCustomerId = null;
    
    // Destroy charts on unload to prevent leaks
    this.destroyCharts();
  },

  /**
   * Switch the sub-navigation tab in the Customer Dashboard
   */
  switchTab(tabId) {
    this.activeTab = tabId;
    
    // Update tab header buttons
    const tabBtns = document.querySelectorAll('.btn-cust-tab');
    tabBtns.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
        btn.style.backgroundColor = 'var(--brand-primary)';
        btn.style.color = '#ffffff';
      } else {
        btn.classList.remove('active');
        btn.style.backgroundColor = 'transparent';
        btn.style.color = 'var(--text-secondary)';
      }
    });

    // Update tab content panes
    const panels = document.querySelectorAll('.cust-tab-panel');
    panels.forEach(panel => {
      if (panel.id === `pane-${tabId}`) {
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    });

    // Render charts specifically when entering Overview & Charts
    if (tabId === 'cust-overview') {
      this.renderOverviewCharts();
    }
  },

  /**
   * Calculates the Effort metrics (Hours, progress) dynamically for a customer
   * @param {string} customerName 
   */
  calculateCustomerKPIs(customerName) {
    const projects = this.app.projectsList || [];
    const clientProjects = projects.filter(p => p.client.toLowerCase().trim() === customerName.toLowerCase().trim());
    
    let totalEst = 0;
    let totalAct = 0;
    
    clientProjects.forEach(p => {
      // Derive Estimated Effort (Hours) based on project budget ($125/hr standard)
      const estEffort = Math.round((Number(p.budget) || 120000) / 125);
      const actEffort = Math.round(estEffort * ((Number(p.progress) || 0) / 100));
      
      totalEst += estEffort;
      totalAct += actEffort;
    });

    // If no projects registered, fallback to a sensible template default
    if (clientProjects.length === 0) {
      return {
        estimated: 0,
        actual: 0,
        remaining: 0,
        completion: 0,
        projectCount: 0
      };
    }

    const totalRem = Math.max(0, totalEst - totalAct);
    const avgCompletion = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) : 0;

    return {
      estimated: totalEst,
      actual: totalAct,
      remaining: totalRem,
      completion: avgCompletion,
      projectCount: clientProjects.length
    };
  },

  /**
   * Helper to fetch or generate highly realistic mock tickets per project
   */
  getProjectTickets(project) {
    const seed = project.id.charCodeAt(p => p.id.length - 1) || 42;
    const tickets = [];
    const risk = (project.risk || 'Low').toLowerCase();
    
    // Assign count based on risk level
    let jiraCount = 2;
    let hdCount = 1;
    if (risk === 'medium') { jiraCount = 4; hdCount = 2; }
    else if (risk === 'high') { jiraCount = 7; hdCount = 4; }
    else if (risk === 'critical') { jiraCount = 12; hdCount = 6; }

    const devs = ['Bob Johnson', 'Alice Smith', 'Clara Oswald', 'David Miller', 'Elena Rostova'];
    const issuesList = [
      'Memory leak during garbage collection batch runs',
      'API gateway rejects connection under concurrent load',
      'Webpack bundle optimization exceeds budget limits',
      'UAT feedback: input validation fails in legacy browsers',
      'Stripe checkout webhook fails to trigger subscription',
      'Localization resources fail to sync on high latency',
      'CSS layout breakage in responsive desktop viewports',
      'Redis cache eviction locks main process thread pool',
      'Authentication token expires prematurely in background'
    ];

    for (let i = 1; i <= jiraCount; i++) {
      const idx = (seed + i) % issuesList.length;
      tickets.push({
        id: `JIRA-${project.id}-${100 + i}`,
        type: 'Jira Issue',
        desc: issuesList[idx],
        severity: i % 3 === 0 ? 'S1 - Critical' : (i % 2 === 0 ? 'S2 - High' : 'S3 - Medium'),
        owner: devs[(seed + i) % devs.length]
      });
    }

    for (let i = 1; i <= hdCount; i++) {
      const idx = (seed + i + 5) % issuesList.length;
      tickets.push({
        id: `HD-${project.id}-${50 + i}`,
        type: 'Helpdesk Ticket',
        desc: `Client Report: ${issuesList[idx].toLowerCase()}`,
        severity: i % 2 === 0 ? 'High Severity' : 'Normal Severity',
        owner: devs[(seed + i + 2) % devs.length]
      });
    }

    return tickets;
  },

  /**
   * Helper to generate realistic milestones per project
   */
  getProjectMilestones(project) {
    const progress = Number(project.progress) || 0;
    const items = [
      { name: 'Project Inception & Scope Charter', trigger: 0, target: 'Completed' },
      { name: 'Business Requirements Document Sign-off', trigger: 20, target: 'Completed' },
      { name: 'Technical Architecture & DB Design Draft', trigger: 40, target: 'Completed' },
      { name: 'Core API Services Integration Complete', trigger: 65, target: 'In Progress' },
      { name: 'System Integration & QA Phase (SIT)', trigger: 80, target: 'Pending' },
      { name: 'User Acceptance Testing & Sign-off (UAT)', trigger: 95, target: 'Pending' }
    ];

    return items.map(m => {
      const completed = progress >= m.trigger;
      let statusText = 'Pending';
      if (completed) {
        statusText = 'Completed';
      } else if (progress > Math.max(0, m.trigger - 20)) {
        statusText = 'Active In Progress';
      }
      return {
        name: m.name,
        status: statusText,
        isCompleted: completed
      };
    });
  },

  /**
   * Opens the customer dashboard view for a specific customer
   * @param {string} customerId 
   */
  openDashboard(customerId) {
    const customer = (this.app.customersList || []).find(c => c.id === customerId);
    if (!customer) return;

    this.activeCustomerId = customerId;

    // Toggle container views
    const listCont = document.getElementById('customers-list-container');
    const dashCont = document.getElementById('customers-dashboard-container');
    if (listCont) listCont.style.display = 'none';
    if (dashCont) dashCont.style.display = 'block';

    // Update Header Text
    const dashName = document.getElementById('cust-dash-name');
    const dashSubtitle = document.getElementById('cust-dash-subtitle');
    if (dashName) dashName.textContent = `${customer.name} — Portfolio Dashboard`;
    if (dashSubtitle) dashSubtitle.textContent = `Client Portal Overview for ${customer.industry} Sector Account`;

    // 1. Calculate dynamic KPI numbers
    const kpis = this.calculateCustomerKPIs(customer.name);
    
    // Populate cards
    const estEl = document.getElementById('cust-kpi-est-hours');
    const actEl = document.getElementById('cust-kpi-act-hours');
    const remEl = document.getElementById('cust-kpi-rem-hours');
    const compEl = document.getElementById('cust-kpi-completion');

    if (estEl) estEl.textContent = `${kpis.estimated.toLocaleString()} hrs`;
    if (actEl) actEl.textContent = `${kpis.actual.toLocaleString()} hrs`;
    if (remEl) remEl.textContent = `${kpis.remaining.toLocaleString()} hrs`;
    if (compEl) compEl.textContent = `${kpis.completion}%`;

    // 2. Populate Profile details card
    const profName = document.getElementById('cust-profile-name');
    const profStatus = document.getElementById('cust-profile-status');
    const profIndustry = document.getElementById('cust-profile-industry');
    const profContact = document.getElementById('cust-profile-contact');
    const profCount = document.getElementById('cust-profile-projects-count');
    const profCode = document.getElementById('cust-profile-code');

    if (profName) profName.textContent = customer.name;
    if (profIndustry) profIndustry.textContent = customer.industry;
    if (profContact) profContact.textContent = customer.contact;
    if (profCount) profCount.textContent = kpis.projectCount.toString();
    if (profCode) profCode.textContent = customer.id;
    if (profStatus) {
      if (customer.status === 'active') {
        profStatus.className = 'badge bg-success-subtle text-success font-bold px-3 py-1';
        profStatus.textContent = 'Active Registry';
      } else {
        profStatus.className = 'badge bg-secondary-subtle text-muted font-bold px-3 py-1';
        profStatus.textContent = 'Suspended Account';
      }
    }

    // 3. Populate dynamic project lists inside Tab 2
    this.populateProjectsAndTimeline(customer);

    // 4. Populate Risks and Tickets lists inside Tab 3
    this.populateRisksAndTickets(customer);

    // 5. Populate Milestones and Allocation inside Tab 4
    this.populateMilestonesAndAllocations(customer);

    // Default view tab reset
    this.switchTab('cust-overview');
  },

  /**
   * Compiles Tab 2: Projects table and interactive start/end timeline Gantt
   */
  populateProjectsAndTimeline(customer) {
    const tableBody = document.getElementById('cust-projects-table-body');
    const ganttContainer = document.getElementById('cust-gantt-container');
    if (!tableBody || !ganttContainer) return;

    tableBody.innerHTML = '';
    ganttContainer.innerHTML = '';

    const projects = this.app.projectsList || [];
    const clientProjects = projects.filter(p => p.client.toLowerCase().trim() === customer.name.toLowerCase().trim());

    if (clientProjects.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No active projects registered.</td></tr>`;
      ganttContainer.innerHTML = `<div class="text-center text-muted py-4">No milestone timelines to render.</div>`;
      return;
    }

    clientProjects.forEach(p => {
      // Risk badge styling
      let riskBadge = '<span class="badge bg-secondary-subtle text-muted">Low</span>';
      if (p.risk === 'Medium') riskBadge = '<span class="badge bg-warning-subtle text-warning">Medium</span>';
      else if (p.risk === 'High') riskBadge = '<span class="badge bg-orange-subtle text-orange" style="background-color:rgba(249,115,22,0.15); color:rgb(249,115,22);">High</span>';
      else if (p.risk === 'Critical') riskBadge = '<span class="badge bg-danger-subtle text-danger font-bold">Critical</span>';

      // Status Badge
      let statusClass = 'bg-primary-subtle text-primary';
      let statusLabel = 'In Progress';
      if (p.status === 'completed') { statusClass = 'bg-success-subtle text-success'; statusLabel = 'Completed'; }
      else if (p.status === 'planning') { statusClass = 'bg-secondary-subtle text-secondary'; statusLabel = 'Planning'; }
      else if (p.status === 'on-hold') { statusClass = 'bg-warning-subtle text-warning'; statusLabel = 'On Hold'; }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="font-mono font-bold text-muted">${p.id}</span></td>
        <td><div class="font-bold text-secondary-custom">${p.name}</div></td>
        <td><div class="font-semibold text-muted">${p.manager}</div></td>
        <td>${riskBadge}</td>
        <td>
          <div class="d-flex align-items-center gap-2" style="min-width: 110px;">
            <div class="progress w-100" style="height: 6px; background-color: var(--border-color);">
              <div class="progress-bar" style="width: ${p.progress}%; background-color: var(--brand-primary);"></div>
            </div>
            <span class="font-bold text-primary" style="font-size: 0.775rem;">${p.progress}%</span>
          </div>
        </td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      `;
      tableBody.appendChild(tr);

      // 2. Gantt progress bars
      const ganttRow = document.createElement('div');
      ganttRow.className = 'border rounded-3 p-3';
      ganttRow.style.backgroundColor = 'var(--bg-card)';
      
      const pStart = p.estimatedStart || '2026-07-01';
      const pEnd = p.estimatedEnd || '2026-12-31';

      ganttRow.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="font-bold text-secondary-custom" style="font-size: 0.9rem;">${p.name}</span>
          <span class="font-mono text-muted" style="font-size: 0.75rem;">${pStart} to ${pEnd}</span>
        </div>
        <div class="progress" style="height: 18px; border-radius: 9px; background-color: var(--border-color); overflow: hidden;">
          <div class="progress-bar d-flex justify-content-center align-items-center text-white font-bold" style="width: ${p.progress}%; background: linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-info) 100%); font-size: 0.7rem;">
            ${p.progress}% Completed
          </div>
        </div>
      `;
      ganttContainer.appendChild(ganttRow);
    });
  },

  /**
   * Compiles Tab 3: Risk registry logs and Open ticket support lists
   */
  populateRisksAndTickets(customer) {
    const riskBody = document.getElementById('cust-risks-table-body');
    const ticketBody = document.getElementById('cust-tickets-table-body');
    if (!riskBody || !ticketBody) return;

    riskBody.innerHTML = '';
    ticketBody.innerHTML = '';

    const projects = this.app.projectsList || [];
    const clientProjects = projects.filter(p => p.client.toLowerCase().trim() === customer.name.toLowerCase().trim());

    if (clientProjects.length === 0) {
      riskBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">No project risks mapped.</td></tr>`;
      ticketBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No active ticket logs.</td></tr>`;
      return;
    }

    let allTickets = [];

    clientProjects.forEach(p => {
      // Risk row
      const riskTr = document.createElement('tr');
      let scoreBadge = '';
      let strategy = '';

      if (p.risk === 'Low') {
        scoreBadge = '<span class="badge bg-success-subtle text-success">Low Risk (Level 1)</span>';
        strategy = 'Standard bi-weekly sprint reviews. Standard QA checklist governance.';
      } else if (p.risk === 'Medium') {
        scoreBadge = '<span class="badge bg-warning-subtle text-warning">Medium Risk (Level 2)</span>';
        strategy = 'Enforce continuous integration and testing. Active product backlog pruning.';
      } else if (p.risk === 'High') {
        scoreBadge = '<span class="badge bg-orange-subtle text-orange" style="background-color:rgba(249,115,22,0.15); color:rgb(249,115,22);">High Risk (Level 3)</span>';
        strategy = 'Direct executive sponsorship oversight. Weekly delivery mitigation audits.';
      } else {
        scoreBadge = '<span class="badge bg-danger-subtle text-danger font-bold">Critical Risk (Level 4)</span>';
        strategy = 'Escalate with dedicated delivery tiger team. Daily core burndown tracking.';
      }

      riskTr.innerHTML = `
        <td><div class="font-bold text-secondary-custom">${p.name}</div></td>
        <td>${scoreBadge}</td>
        <td><small class="text-muted font-semibold d-block" style="line-height:1.3;">${strategy}</small></td>
      `;
      riskBody.appendChild(riskTr);

      // Collect tickets
      const prjTickets = this.getProjectTickets(p);
      allTickets = allTickets.concat(prjTickets);
    });

    if (allTickets.length === 0) {
      ticketBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">All Jira and Helpdesk tickets resolved!</td></tr>`;
      return;
    }

    allTickets.forEach(t => {
      const tr = document.createElement('tr');
      
      let typeIcon = '<i class="fa-solid fa-code-pull-request text-primary"></i>';
      if (t.type.includes('Helpdesk')) {
        typeIcon = '<i class="fa-solid fa-circle-question text-warning"></i>';
      }

      let sevClass = 'badge bg-secondary-subtle text-dark';
      if (t.severity.includes('Critical') || t.severity.includes('High')) {
        sevClass = 'badge bg-danger-subtle text-danger font-bold';
      }

      tr.innerHTML = `
        <td><span class="font-mono font-bold text-muted">${t.id}</span></td>
        <td><span class="font-semibold text-secondary-custom" style="font-size:0.8rem;">${typeIcon} ${t.type}</span></td>
        <td><div class="text-secondary-custom font-semibold">${t.desc}</div></td>
        <td><span class="${sevClass}" style="font-size:0.7rem;">${t.severity}</span></td>
        <td><div class="text-muted font-semibold">${t.owner}</div></td>
      `;
      ticketBody.appendChild(tr);
    });
  },

  /**
   * Compiles Tab 4: Project Roadmaps Milestones checklist & Resource Allocations table
   */
  populateMilestonesAndAllocations(customer) {
    const mileContainer = document.getElementById('cust-milestones-container');
    const allocBody = document.getElementById('cust-allocations-table-body');
    if (!mileContainer || !allocBody) return;

    mileContainer.innerHTML = '';
    allocBody.innerHTML = '';

    const projects = this.app.projectsList || [];
    const clientProjects = projects.filter(p => p.client.toLowerCase().trim() === customer.name.toLowerCase().trim());

    if (clientProjects.length === 0) {
      mileContainer.innerHTML = `<div class="text-center text-muted py-4">No active milestones registered.</div>`;
      allocBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No active allocations.</td></tr>`;
      return;
    }

    // 1. Milestones checklist list
    clientProjects.forEach(p => {
      const prjMilestones = this.getProjectMilestones(p);
      
      const div = document.createElement('div');
      div.className = 'border rounded-3 p-3 mb-3';
      div.style.backgroundColor = 'var(--bg-card)';
      
      let milestonesHtml = `<h6 class="font-bold text-secondary-custom mb-3" style="font-size: 0.9rem;"><i class="fa-regular fa-folder text-primary me-2"></i>${p.name}</h6>`;
      milestonesHtml += `<div class="d-flex flex-column gap-2">`;
      
      prjMilestones.forEach(m => {
        const icon = m.isCompleted 
          ? '<i class="fa-solid fa-circle-check text-success" style="font-size:1.1rem;"></i>' 
          : '<i class="fa-regular fa-circle text-muted" style="font-size:1.1rem;"></i>';
        const strike = m.isCompleted ? 'text-decoration-line-through text-muted' : 'text-secondary-custom font-semibold';
        
        let badgeClass = 'bg-secondary-subtle text-muted';
        if (m.status === 'Completed') badgeClass = 'bg-success-subtle text-success';
        if (m.status === 'Active In Progress') badgeClass = 'bg-warning-subtle text-warning font-bold';

        milestonesHtml += `
          <div class="d-flex align-items-center justify-content-between p-2 rounded border border-dashed bg-light-custom" style="font-size:0.8rem;">
            <div class="d-flex align-items-center gap-2">
              ${icon}
              <span class="${strike}">${m.name}</span>
            </div>
            <span class="badge ${badgeClass}" style="font-size:0.65rem;">${m.status}</span>
          </div>
        `;
      });
      milestonesHtml += `</div>`;
      div.innerHTML = milestonesHtml;
      mileContainer.appendChild(div);

      // 2. Resource allocation records
      // Assign PM, BA, Dev, QA mock records
      const team = [
        { name: p.manager || 'Alex Mercer', role: 'Project Manager', load: '30%' },
        { name: p.developer || 'Bob Johnson', role: 'Lead Developer', load: '100%' },
        { name: p.qa || 'David Miller', role: 'QA Automation Specialist', load: '50%' },
        { name: p.ba || 'Sarah Connor', role: 'Business Analyst', load: '40%' }
      ];

      team.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="font-bold text-secondary-custom">${t.name}</span></td>
          <td><span class="text-secondary-custom font-semibold">${t.role}</span></td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <span class="table-progress-bar" style="width: 80px;">
                <span class="table-progress-fill" style="width: ${t.load}; background-color: var(--brand-info);"></span>
              </span>
              <span class="font-bold text-primary-custom" style="font-size:0.8rem;">${t.load}</span>
            </div>
          </td>
          <td><span class="font-mono text-muted font-bold">${p.id}</span></td>
        `;
        allocBody.appendChild(tr);
      });
    });
  },

  /**
   * Render Chart.js figures customized dynamically for this customer's active projects
   */
  renderOverviewCharts() {
    this.destroyCharts();

    const customer = (this.app.customersList || []).find(c => c.id === this.activeCustomerId);
    if (!customer) return;

    const projects = this.app.projectsList || [];
    const clientProjects = projects.filter(p => p.client.toLowerCase().trim() === customer.name.toLowerCase().trim());

    // Fallback if no projects
    if (clientProjects.length === 0) return;

    // --- CHART 1: PROJECT HEALTH & STATUS (DOUGHNUT) ---
    const healthCanvas = document.getElementById('chart-cust-project-health');
    if (healthCanvas) {
      // Aggregate project status
      const statusCounts = { 'In Progress': 0, 'Completed': 0, 'Planning': 0, 'On Hold': 0 };
      clientProjects.forEach(p => {
        let label = 'In Progress';
        if (p.status === 'completed') label = 'Completed';
        else if (p.status === 'planning') label = 'Planning';
        else if (p.status === 'on-hold') label = 'On Hold';
        statusCounts[label] = (statusCounts[label] || 0) + 1;
      });

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const colors = ['#4f46e5', '#10b981', '#475569', '#f59e0b'];

      const ctx = healthCanvas.getContext('2d');
      this.charts['project-health'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: Object.keys(statusCounts),
          datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: colors,
            borderWidth: isDark ? 3 : 2,
            borderColor: isDark ? '#1e293b' : '#ffffff',
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: isDark ? '#94a3b8' : '#64748b',
                font: { family: "'Plus Jakarta Sans', sans-serif", size: 10, weight: '500' },
                boxWidth: 10,
                padding: 10
              }
            }
          }
        }
      });
    }

    // --- CHART 2: TICKETS BACKLOG (BAR CHART) ---
    const ticketsCanvas = document.getElementById('chart-cust-tickets');
    if (ticketsCanvas) {
      const projectNames = [];
      const jiraCounts = [];
      const hdCounts = [];

      clientProjects.forEach(p => {
        // Shorten long project names
        const shortName = p.name.length > 18 ? p.name.substring(0, 16) + '...' : p.name;
        projectNames.push(shortName);

        const tickets = this.getProjectTickets(p);
        const jiras = tickets.filter(t => t.type.includes('Jira')).length;
        const hds = tickets.filter(t => t.type.includes('Helpdesk')).length;
        
        jiraCounts.push(jiras);
        hdCounts.push(hds);
      });

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const ctx = ticketsCanvas.getContext('2d');
      
      this.charts['tickets-backlog'] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: projectNames,
          datasets: [
            {
              label: 'Jira Backlog',
              data: jiraCounts,
              backgroundColor: '#4f46e5',
              borderRadius: 4,
              maxBarThickness: 15
            },
            {
              label: 'Helpdesk SLA Tickets',
              data: hdCounts,
              backgroundColor: '#f59e0b',
              borderRadius: 4,
              maxBarThickness: 15
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: "'Plus Jakarta Sans', sans-serif", size: 9 } }
            },
            y: {
              grid: { color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
              ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: "'Plus Jakarta Sans', sans-serif", size: 9 }, precision: 0 }
            }
          },
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: isDark ? '#94a3b8' : '#64748b',
                font: { family: "'Plus Jakarta Sans', sans-serif", size: 10 },
                boxWidth: 10,
                padding: 10
              }
            }
          }
        }
      });
    }
  },

  /**
   * Destroy active charts to prevent leaks
   */
  destroyCharts() {
    Object.keys(this.charts).forEach(key => {
      if (this.charts[key]) {
        this.charts[key].destroy();
        this.charts[key] = null;
      }
    });
    this.charts = {};
  },

  /**
   * Generates and triggers the beautiful "Customer Summary Report" popup
   */
  openSummaryReportModal() {
    const customer = (this.app.customersList || []).find(c => c.id === this.activeCustomerId);
    if (!customer) return;

    const kpis = this.calculateCustomerKPIs(customer.name);
    const projects = this.app.projectsList || [];
    const clientProjects = projects.filter(p => p.client.toLowerCase().trim() === customer.name.toLowerCase().trim());

    let projectsRowsHtml = '';
    let riskSummaryHtml = '';
    let milestonesSummaryHtml = '';
    let resourcesSummaryHtml = '';

    clientProjects.forEach(p => {
      // Build project row
      projectsRowsHtml += `
        <tr>
          <td><strong style="color:var(--brand-primary);">${p.id}</strong></td>
          <td><strong>${p.name}</strong></td>
          <td>${p.manager}</td>
          <td>${p.risk}</td>
          <td><strong>${p.progress}%</strong></td>
          <td><span style="text-transform: capitalize; font-weight: bold; color: var(--brand-success);">${p.status}</span></td>
        </tr>
      `;

      // Build risk row
      let strategy = p.risk === 'Low' ? 'Bi-weekly reviews.' : (p.risk === 'Medium' ? 'Prune product backlog.' : 'Tiger team escalation.');
      riskSummaryHtml += `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td><strong>${p.risk} Risk</strong></td>
          <td>${strategy}</td>
        </tr>
      `;

      // Build milestones
      const milestones = this.getProjectMilestones(p);
      const completedCount = milestones.filter(m => m.isCompleted).length;
      milestonesSummaryHtml += `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td>${completedCount} / 6 Milestones Passed</td>
          <td>${Math.round((completedCount/6)*100)}% roadmap progress</td>
        </tr>
      `;

      // Build resources
      resourcesSummaryHtml += `
        <tr>
          <td>${p.manager}</td>
          <td>Project Manager</td>
          <td>30% Allocation</td>
          <td>${p.id}</td>
        </tr>
        <tr>
          <td>${p.developer}</td>
          <td>Lead Developer</td>
          <td>100% Allocation</td>
          <td>${p.id}</td>
        </tr>
        <tr>
          <td>${p.qa}</td>
          <td>QA Analyst</td>
          <td>50% Allocation</td>
          <td>${p.id}</td>
        </tr>
      `;
    });

    const reportHtml = `
      <div id="print-summary-report-card" class="p-3" style="font-family: 'Plus Jakarta Sans', sans-serif;">
        <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 30px; background-color: #ffffff; color: #1e293b;">
          
          <!-- Document Header -->
          <div class="d-flex justify-content-between align-items-center border-bottom pb-4 mb-4">
            <div>
              <h2 style="color: #4f46e5; margin: 0; font-weight: 800; font-size: 1.6rem; letter-spacing:-0.5px;">CUSTOMER SUMMARY REPORT</h2>
              <p style="color: #64748b; margin: 5px 0 0 0; font-size: 0.9rem;">Executive Performance Portfolio & Governance Audit</p>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Date Generated</span>
              <strong style="display: block; font-size: 0.95rem; color: #0f172a;">July 28, 2026</strong>
            </div>
          </div>

          <!-- Profile grid -->
          <div class="row g-3 mb-4" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 0;">
            <div class="col-md-3">
              <span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: bold;">Client Account</span>
              <strong style="display: block; font-size: 1rem; color: #0f172a; margin-top: 2px;">${customer.name}</strong>
            </div>
            <div class="col-md-3">
              <span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: bold;">Sector Industry</span>
              <strong style="display: block; font-size: 1rem; color: #0f172a; margin-top: 2px;">${customer.industry}</strong>
            </div>
            <div class="col-md-3">
              <span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: bold;">Executive Lead</span>
              <strong style="display: block; font-size: 1rem; color: #0f172a; margin-top: 2px;">${customer.contact}</strong>
            </div>
            <div class="col-md-3">
              <span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: bold;">Contract Registry</span>
              <strong style="display: block; font-size: 1rem; color: #10b981; margin-top: 2px;">ACTIVE CLIENT</strong>
            </div>
          </div>

          <!-- KPIs Metrics Bar -->
          <h5 style="font-weight: 800; color: #0f172a; margin-bottom: 15px; text-transform: uppercase; font-size: 0.9rem; letter-spacing: 0.5px;">1. Operational Effort Balance</h5>
          <div class="row g-3 mb-4 text-center">
            <div class="col-3">
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background-color: #fdfdfd;">
                <span style="font-size:0.7rem; color:#64748b; text-transform:uppercase; font-weight:bold; display:block;">Estimated Scope</span>
                <strong style="font-size:1.3rem; color:#4f46e5; display:block; margin-top:5px;">${kpis.estimated.toLocaleString()} hrs</strong>
              </div>
            </div>
            <div class="col-3">
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background-color: #fdfdfd;">
                <span style="font-size:0.7rem; color:#64748b; text-transform:uppercase; font-weight:bold; display:block;">Delivered To-Date</span>
                <strong style="font-size:1.3rem; color:#10b981; display:block; margin-top:5px;">${kpis.actual.toLocaleString()} hrs</strong>
              </div>
            </div>
            <div class="col-3">
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background-color: #fdfdfd;">
                <span style="font-size:0.7rem; color:#64748b; text-transform:uppercase; font-weight:bold; display:block;">Remaining Backlog</span>
                <strong style="font-size:1.3rem; color:#f59e0b; display:block; margin-top:5px;">${kpis.remaining.toLocaleString()} hrs</strong>
              </div>
            </div>
            <div class="col-3">
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; background-color: #fdfdfd;">
                <span style="font-size:0.7rem; color:#64748b; text-transform:uppercase; font-weight:bold; display:block;">SLA Delivery index</span>
                <strong style="font-size:1.3rem; color:#06b6d4; display:block; margin-top:5px;">${kpis.completion}% Completed</strong>
              </div>
            </div>
          </div>

          <!-- Project Performance -->
          <h5 style="font-weight: 800; color: #0f172a; margin-bottom: 12px; text-transform: uppercase; font-size: 0.9rem; letter-spacing: 0.5px;">2. Associated Project Accounts</h5>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 0.85rem; border:1px solid #e2e8f0;">
            <thead>
              <tr style="background-color: #f1f5f9; text-align: left; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 10px;">ID</th>
                <th style="padding: 10px;">Project Title</th>
                <th style="padding: 10px;">Manager</th>
                <th style="padding: 10px;">Risk Rating</th>
                <th style="padding: 10px;">Progress</th>
                <th style="padding: 10px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${projectsRowsHtml || '<tr><td colspan="6" style="padding:15px; text-align:center;" class="text-muted">No associated projects.</td></tr>'}
            </tbody>
          </table>

          <!-- Secondary Grid: Risks and Milestones -->
          <div class="row g-4 mb-4">
            <div class="col-md-6">
              <h5 style="font-weight: 800; color: #0f172a; margin-bottom: 12px; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.5px; border-bottom:2px solid #ef4444; padding-bottom:5px;">3. Project Governance Risks</h5>
              <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; border:1px solid #e2e8f0;">
                <thead>
                  <tr style="background-color: #fdf2f2; text-align: left;">
                    <th style="padding: 8px;">Project</th>
                    <th style="padding: 8px;">Risk Score</th>
                    <th style="padding: 8px;">Governance Plan</th>
                  </tr>
                </thead>
                <tbody>
                  ${riskSummaryHtml || '<tr><td colspan="3" style="padding:10px; text-align:center;">No risks registered.</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="col-md-6">
              <h5 style="font-weight: 800; color: #0f172a; margin-bottom: 12px; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.5px; border-bottom:2px solid #10b981; padding-bottom:5px;">4. Milestone Roadmaps</h5>
              <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; border:1px solid #e2e8f0;">
                <thead>
                  <tr style="background-color: #f0fdf4; text-align: left;">
                    <th style="padding: 8px;">Project</th>
                    <th style="padding: 8px;">Milestone Status</th>
                    <th style="padding: 8px;">Roadmap Progress</th>
                  </tr>
                </thead>
                <tbody>
                  ${milestonesSummaryHtml || '<tr><td colspan="3" style="padding:10px; text-align:center;">No milestones registered.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Resource Directory -->
          <h5 style="font-weight: 800; color: #0f172a; margin-bottom: 12px; text-transform: uppercase; font-size: 0.9rem; letter-spacing: 0.5px;">5. Allocated Human Resources</h5>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; border:1px solid #e2e8f0; margin-bottom: 25px;">
            <thead>
              <tr style="background-color: #f1f5f9; text-align: left;">
                <th style="padding: 8px;">Staff Member</th>
                <th style="padding: 8px;">Assigned Role</th>
                <th style="padding: 8px;">Workload Allocation</th>
                <th style="padding: 8px;">Project Account</th>
              </tr>
            </thead>
            <tbody>
              ${resourcesSummaryHtml || '<tr><td colspan="4" style="padding:12px; text-align:center;">No allocated resources.</td></tr>'}
            </tbody>
          </table>

          <!-- Footer/SLA -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; font-size: 0.75rem; color: #64748b; line-height: 1.4; text-align: center;">
            <strong>Confidentiality Notice & SLA Guarantee:</strong> This performance document is compiled automatically for <strong>${customer.name}</strong> under non-disclosure security profiles. All estimated and accrued effort indexes are verified with staff timesheets. Premium SLA delivery guarantees active backup failovers 24/7/365.
          </div>

        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-sm btn-light border font-semibold py-2 px-3" id="btn-print-cancel-report">Cancel</button>
      <button class="btn btn-sm btn-outline-secondary font-semibold py-2 px-3" id="btn-export-csv-report"><i class="fa-solid fa-file-csv"></i> Export CSV Summary</button>
      <button class="btn-enterprise btn-enterprise-primary" id="btn-print-trigger-report"><i class="fa-solid fa-print"></i> Trigger Print System</button>
    `;

    this.app.openModal(`Client Account Performance Summary Report`, reportHtml, () => {
      // Return true to close, but we manage action triggers inside setupModalActionListeners
      return true;
    });

    // Replace footer with custom export/print controls!
    const modalFooter = document.getElementById('global-modal-footer');
    if (modalFooter) {
      modalFooter.innerHTML = footerHtml;
      
      const printBtn = document.getElementById('btn-print-trigger-report');
      const csvBtn = document.getElementById('btn-export-csv-report');
      const cancelBtn = document.getElementById('btn-print-cancel-report');

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          document.getElementById('global-modal-overlay').classList.remove('show');
        });
      }

      if (printBtn) {
        printBtn.addEventListener('click', () => {
          this.triggerBrowserPrint();
        });
      }

      if (csvBtn) {
        csvBtn.addEventListener('click', () => {
          this.exportReportToCSV(customer, clientProjects, kpis);
        });
      }
    }
  },

  /**
   * Triggers the printer window for the specific report contents
   */
  triggerBrowserPrint() {
    const printArea = document.getElementById('print-summary-report-card');
    if (!printArea) return;

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      this.app.showToast('Printer window blocked by browser. Please enable popups.', 'warning');
      return;
    }

    // Bootstrap is included for visual styles
    printWindow.document.write(`
      <html>
        <head>
          <title>Summary Report - ${this.activeCustomerId}</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
            body { 
              font-family: 'Plus Jakarta Sans', sans-serif; 
              background-color: #ffffff; 
              padding: 20px; 
            }
            table th { padding: 12px !important; }
            table td { padding: 12px !important; border: 1px solid #e2e8f0; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${printArea.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
  },

  /**
   * Helper to download CSV report containing effort, projects, risks, resource details
   */
  exportReportToCSV(customer, projects, kpis) {
    let csvContent = `data:text/csv;charset=utf-8,`;
    
    // Title Block
    csvContent += `EXECUTIVE CUSTOMER PERFORMANCE REPORT - ${customer.name}\r\n`;
    csvContent += `Generated On,July 28 2026\r\n`;
    csvContent += `Client Name,${customer.name}\r\n`;
    csvContent += `Industry Sector,${customer.industry}\r\n`;
    csvContent += `Lead Partner,${customer.contact}\r\n`;
    csvContent += `Contract Status,${customer.status.toUpperCase()}\r\n\r\n`;

    // Operational KPI Metrics
    csvContent += `OPERATIONAL EFFORT METRICS\r\n`;
    csvContent += `Estimated Effort (Hrs),Actual Effort Spent (Hrs),Remaining Backlog (Hrs),Portfolio Delivery %\r\n`;
    csvContent += `${kpis.estimated},${kpis.actual},${kpis.remaining},${kpis.completion}%\r\n\r\n`;

    // Projects Registry list
    csvContent += `ASSOCIATED ENTERPRISE PROJECTS\r\n`;
    csvContent += `Project ID,Project Name,Manager,Risk Score,Progress %,Status\r\n`;
    
    projects.forEach(p => {
      csvContent += `"${p.id}","${p.name.replace(/"/g, '""')}","${p.manager}","${p.risk}","${p.progress}%","${p.status}"\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${customer.name.replace(/\s+/g, '_')}_Performance_Summary_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.app.showToast('CSV Executive Report exported successfully', 'success');
  }
};
