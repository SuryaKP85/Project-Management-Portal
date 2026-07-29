/* resourcePlanner.js - Enterprise Resource Allocation Planner Module */

import { Storage } from './storage.js';
import { Filters } from './filters.js';

export const ResourcePlannerModule = {
  app: null,
  allocations: [],
  resources: [],
  leaves: [],
  projects: [],
  
  // Current planner states
  currentMonth: '2026-07', // YYYY-MM
  selectedDepartment: 'all',
  selectedRole: 'all',
  searchQuery: '',
  activeTab: 'heatmap', // 'heatmap', 'calendar', 'matrix'
  heatmapScope: 'daily', // 'daily', 'weekly', 'monthly'

  /**
   * Initializes the Resource Planner Module
   * @param {object} appInstance - Reference to the core EnterprisePortalApp instance
   */
  init(appInstance) {
    this.app = appInstance;
    
    // Set up standard resources list (cloned from app or loaded from storage)
    this.loadResources();
    
    // Load projects and leaves
    this.projects = this.app.projectsList || [];
    this.leaves = this.app.leavesList || [];
    
    // Load allocations
    this.loadAllocations();

    // Setup event listeners in the DOM
    this.setupEventListeners();

    // Populate dropdown selections
    this.populateDropdowns();

    // Initial render
    this.render();
  },

  /**
   * Loads resources and merges with app context
   */
  loadResources() {
    // Check if resources exist in local storage, otherwise use default
    let stored = Storage.get('resources');
    const ALLOWED_DEPTS = ['Dev', 'QA', 'BA', 'Product Manager'];
    const mapDept = (d) => {
      if (d === 'Engineering') return 'Dev';
      if (d === 'Design') return 'BA';
      if (d === 'QA / Test') return 'QA';
      if (d === 'Product') return 'Product Manager';
      if (ALLOWED_DEPTS.includes(d)) return d;
      return 'Dev';
    };

    if (stored && Array.isArray(stored) && stored.length > 0) {
      this.resources = stored.map(r => ({
        ...r,
        dept: mapDept(r.dept)
      }));
      Storage.set('resources', this.resources);
    } else {
      // Map initial ones with capacity information
      this.resources = (this.app.resourcesList || []).map(r => ({
        ...r,
        dept: mapDept(r.dept),
        baseWeeklyCapacity: 40, // standard hours
        baseDailyCapacity: 8, // hours per weekday
        loggedHours: r.id === 'RES201' ? 130 : r.id === 'RES202' ? 142 : r.id === 'RES203' ? 70 : r.id === 'RES205' ? 110 : 0,
        weekendHours: r.id === 'RES202' ? 6 : 0
      }));
      Storage.set('resources', this.resources);
    }
    // Keep app resources list synced
    this.app.resourcesList = this.resources;
  },

  /**
   * Loads allocations from storage or sets up high-fidelity default values
   */
  loadAllocations() {
    let stored = Storage.get('resource_allocations');
    if (stored && Array.isArray(stored) && stored.length > 0) {
      this.allocations = stored;
    } else {
      // High-fidelity default allocations for July & August 2026
      this.allocations = [
        {
          id: 'ALC001',
          resourceId: 'RES201', // Alice Smith
          projectId: 'PRJ001', // Ares Core
          projectName: 'Project Ares Core Upgrade',
          role: 'Lead Architect',
          startDate: '2026-07-01',
          endDate: '2026-08-31',
          hoursPerWeek: 30, // 30 hrs/week
          weekendHours: 0,
          notes: 'Architecting core system schemas and replication queues.'
        },
        {
          id: 'ALC002',
          resourceId: 'RES201', // Alice Smith
          projectId: 'PRJ002', // Zeus Shield
          projectName: 'Zeus Security Shield Framework',
          role: 'Security Advisor',
          startDate: '2026-07-15',
          endDate: '2026-08-15',
          hoursPerWeek: 15, // Total 45 hrs/week (Over-allocated!)
          weekendHours: 0,
          notes: 'Auditing secure gateway micro-endpoints.'
        },
        {
          id: 'ALC003',
          resourceId: 'RES202', // Bob Johnson
          projectId: 'PRJ001', // Ares Core
          projectName: 'Project Ares Core Upgrade',
          role: 'Fullstack Dev',
          startDate: '2026-07-01',
          endDate: '2026-07-31',
          hoursPerWeek: 40,
          weekendHours: 6, // 6 hrs weekend release
          notes: 'React UI scaffolding and integration workflows.'
        },
        {
          id: 'ALC004',
          resourceId: 'RES203', // Clara Oswald
          projectId: 'PRJ003', // Hermes API
          projectName: 'Hermes Logistic Router API',
          role: 'UX Designer',
          startDate: '2026-06-15',
          endDate: '2026-07-15',
          hoursPerWeek: 20,
          weekendHours: 0,
          notes: 'Interactive prototyping and figma handoff.'
        },
        {
          id: 'ALC005',
          resourceId: 'RES205', // Elena Rostova
          projectId: 'PRJ001', // Ares Core
          projectName: 'Project Ares Core Upgrade',
          role: 'Product Manager',
          startDate: '2026-07-01',
          endDate: '2026-09-30',
          hoursPerWeek: 32,
          weekendHours: 0,
          notes: 'Backlog pruning and stakeholder sync meetings.'
        }
      ];
      Storage.set('resource_allocations', this.allocations);
    }
  },

  /**
   * Registers Event Listeners for controls and triggers
   */
  setupEventListeners() {
    // 1. Department filter
    const deptSelect = document.getElementById('planner-dept-select');
    if (deptSelect) {
      deptSelect.addEventListener('change', (e) => {
        this.selectedDepartment = e.target.value;
        this.render();
      });
    }

    // 2. Role filter
    const roleSelect = document.getElementById('planner-role-select');
    if (roleSelect) {
      roleSelect.addEventListener('change', (e) => {
        this.selectedRole = e.target.value;
        this.render();
      });
    }

    // 3. Search query
    const searchInp = document.getElementById('planner-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.render();
      });
    }

    // 4. Month selection
    const monthSelect = document.getElementById('planner-month-select');
    if (monthSelect) {
      monthSelect.addEventListener('change', (e) => {
        this.currentMonth = e.target.value;
        this.render();
      });
    }

    // 5. Views Switch (Heatmap, Calendar, Matrix)
    const tabBtns = document.querySelectorAll('.btn-planner-tab');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.getAttribute('data-tab');
        
        // Show/hide view sub-containers
        document.getElementById('planner-heatmap-container').style.display = this.activeTab === 'heatmap' ? 'block' : 'none';
        document.getElementById('planner-calendar-container').style.display = this.activeTab === 'calendar' ? 'block' : 'none';
        document.getElementById('planner-matrix-container').style.display = this.activeTab === 'matrix' ? 'block' : 'none';
        
        this.render();
      });
    });

    // 6. Heatmap Scope Switch (Daily, Weekly, Monthly)
    const scopeBtns = document.querySelectorAll('.btn-heatmap-scope');
    scopeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        scopeBtns.forEach(b => b.classList.remove('active', 'btn-enterprise-primary'));
        scopeBtns.forEach(b => b.classList.add('btn-enterprise-secondary'));
        
        btn.classList.remove('btn-enterprise-secondary');
        btn.classList.add('active', 'btn-enterprise-primary');
        this.heatmapScope = btn.getAttribute('data-scope');
        this.render();
      });
    });

    // 7. Allocate Resource Modal Trigger
    const allocateBtn = document.getElementById('btn-allocate-resource');
    if (allocateBtn) {
      const newAllocateBtn = allocateBtn.cloneNode(true);
      allocateBtn.parentNode.replaceChild(newAllocateBtn, allocateBtn);
      newAllocateBtn.addEventListener('click', () => {
        this.openAllocateModal();
      });
    }

    // 8. Add Team Member Modal Trigger
    const addMemberBtn = document.getElementById('btn-add-team-member');
    if (addMemberBtn) {
      const newAddBtn = addMemberBtn.cloneNode(true);
      addMemberBtn.parentNode.replaceChild(newAddBtn, addMemberBtn);
      newAddBtn.addEventListener('click', () => {
        this.openResourceModal();
      });
    }
  },

  /**
   * Populates filter dropdown lists dynamically
   */
  populateDropdowns() {
    const deptSelect = document.getElementById('planner-dept-select');
    const roleSelect = document.getElementById('planner-role-select');

    if (deptSelect) {
      const depts = ['Dev', 'QA', 'BA', 'Product Manager'];
      deptSelect.innerHTML = '<option value="all">All Departments</option>';
      depts.forEach(d => {
        deptSelect.innerHTML += `<option value="${d}">${d}</option>`;
      });
    }

    if (roleSelect) {
      const roles = [...new Set(this.resources.map(r => r.role))];
      roleSelect.innerHTML = '<option value="all">All Professional Roles</option>';
      roles.forEach(r => {
        roleSelect.innerHTML += `<option value="${r}">${r}</option>`;
      });
    }
  },

  /**
   * Filters the resources based on user preferences
   */
  getFilteredResources() {
    return this.resources.filter(r => {
      const matchDept = this.selectedDepartment === 'all' || r.dept === this.selectedDepartment;
      const matchRole = this.selectedRole === 'all' || r.role === this.selectedRole;
      const matchSearch = !this.searchQuery || 
        r.name.toLowerCase().includes(this.searchQuery) || 
        r.role.toLowerCase().includes(this.searchQuery) || 
        r.id.toLowerCase().includes(this.searchQuery);
      return matchDept && matchRole && matchSearch;
    });
  },

  /**
   * Render everything in the module
   */
  render() {
    this.renderStats();
    this.renderWarnings();
    
    const filtered = this.getFilteredResources();
    
    if (this.activeTab === 'heatmap') {
      this.renderHeatmap(filtered);
    } else if (this.activeTab === 'calendar') {
      this.renderAllocationCalendar(filtered);
    } else if (this.activeTab === 'matrix') {
      this.renderAvailabilityMatrix(filtered);
    }
  },

  /**
   * Calculates overall resource capacities and utilization indices
   */
  renderStats() {
    const [year, month] = this.currentMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    let totalCapacityHours = 0;
    let totalAssignedHours = 0;
    let totalLoggedHours = 0;
    let totalLeaveHours = 0;
    let totalWeekendHours = 0;

    const activeResources = this.getFilteredResources();

    activeResources.forEach(res => {
      // Standard base capacity for this month: approx 4 weeks (160 hours)
      // For precision, count actual weekdays in this month
      let weekdays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dayOfWeek = new Date(year, month - 1, d).getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) weekdays++;
      }
      
      const resBaseCapacity = weekdays * res.baseDailyCapacity;
      totalCapacityHours += resBaseCapacity;

      // Logged hours
      totalLoggedHours += (res.loggedHours || 0);
      
      // Weekend hours
      totalWeekendHours += (res.weekendHours || 0);

      // Leaves within this month
      const resLeaves = this.leaves.filter(l => l.name === res.name && l.status === 'approved');
      resLeaves.forEach(l => {
        // Find overlap with current month
        const leaveStart = new Date(l.start);
        const leaveEnd = new Date(l.end);
        
        let overlappingDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${this.currentMonth}-${String(d).padStart(2, '0')}`;
          const currentDay = new Date(dateStr);
          if (currentDay >= leaveStart && currentDay <= leaveEnd) {
            const dayOfWeek = currentDay.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              overlappingDays++;
            }
          }
        }
        totalLeaveHours += (overlappingDays * res.baseDailyCapacity);
      });

      // Allocations within this month
      const resAllocations = this.allocations.filter(a => a.resourceId === res.id);
      resAllocations.forEach(a => {
        const allocStart = new Date(a.startDate);
        const allocEnd = new Date(a.endDate);
        
        // Calculate overlapping weekdays
        let overlappingWeekdays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${this.currentMonth}-${String(d).padStart(2, '0')}`;
          const currentDay = new Date(dateStr);
          if (currentDay >= allocStart && currentDay <= allocEnd) {
            const dayOfWeek = currentDay.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              overlappingWeekdays++;
            }
          }
        }
        
        // Derive assigned hours for this overlapping portion
        // Standard formula: hoursPerWeek / 5 * overlappingWeekdays
        const dailyAllocation = (a.hoursPerWeek || 40) / 5;
        totalAssignedHours += (overlappingWeekdays * dailyAllocation);
      });
    });

    // Compute remaining capacity and utilization
    const netCapacity = totalCapacityHours - totalLeaveHours;
    const remainingCapacity = Math.max(0, netCapacity - totalAssignedHours);
    const avgUtilization = netCapacity > 0 ? Math.round((totalAssignedHours / netCapacity) * 100) : 0;

    // Render stats into HTML cards
    const cardCap = document.getElementById('kpi-planner-capacity');
    const cardUtil = document.getElementById('kpi-planner-utilization');
    const cardLeave = document.getElementById('kpi-planner-leave');
    const cardWeekend = document.getElementById('kpi-planner-weekend');

    if (cardCap) {
      cardCap.innerHTML = `
        <div class="d-flex align-items-baseline gap-2">
          <h3 class="kpi-value mb-0">${totalAssignedHours.toFixed(0)}h</h3>
          <span class="text-muted text-xs">/ ${netCapacity.toFixed(0)}h cap</span>
        </div>
        <div class="text-xs text-secondary mt-1">Remaining: <strong>${remainingCapacity.toFixed(0)}h</strong></div>
      `;
    }

    if (cardUtil) {
      let badgeClass = 'bg-success-subtle text-success';
      if (avgUtilization > 100) badgeClass = 'bg-danger-subtle text-danger';
      else if (avgUtilization > 85) badgeClass = 'bg-warning-subtle text-warning';
      else if (avgUtilization < 50) badgeClass = 'bg-info-subtle text-info';

      cardUtil.innerHTML = `
        <h3 class="kpi-value mb-0">${avgUtilization}%</h3>
        <div class="mt-1 d-flex align-items-center gap-1">
          <span class="badge ${badgeClass} text-xs font-semibold py-1">
            ${avgUtilization > 100 ? 'Overload Risk' : avgUtilization > 85 ? 'Near Limit' : avgUtilization < 50 ? 'Under-utilized' : 'Optimal Load'}
          </span>
        </div>
      `;
    }

    if (cardLeave) {
      cardLeave.innerHTML = `
        <h3 class="kpi-value mb-0">${totalLeaveHours.toFixed(0)}h</h3>
        <div class="text-xs text-secondary mt-1">Registered Time-Off</div>
      `;
    }

    if (cardWeekend) {
      cardWeekend.innerHTML = `
        <h3 class="kpi-value mb-0">${totalWeekendHours.toFixed(0)}h</h3>
        <div class="text-xs text-secondary mt-1">Extra Weekend Logging</div>
      `;
    }
  },

  /**
   * Evaluates capacity alerts and renders warnings
   */
  renderWarnings() {
    const listBody = document.getElementById('planner-warnings-list');
    if (!listBody) return;

    listBody.innerHTML = '';
    const warnings = [];

    const [year, month] = this.currentMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    this.resources.forEach(res => {
      // Calculate overlapping weekdays and assigned hours for this resource
      let weekdays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dayOfWeek = new Date(year, month - 1, d).getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) weekdays++;
      }
      
      const capacity = weekdays * res.baseDailyCapacity;

      // Overlapping leaves
      let leaveHours = 0;
      const resLeaves = this.leaves.filter(l => l.name === res.name && l.status === 'approved');
      resLeaves.forEach(l => {
        const leaveStart = new Date(l.start);
        const leaveEnd = new Date(l.end);
        let overlappingDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${this.currentMonth}-${String(d).padStart(2, '0')}`;
          const currentDay = new Date(dateStr);
          if (currentDay >= leaveStart && currentDay <= leaveEnd) {
            const dayOfWeek = currentDay.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) overlappingDays++;
          }
        }
        leaveHours += (overlappingDays * res.baseDailyCapacity);
      });

      const netCapacity = capacity - leaveHours;

      // Overlapping allocations
      let assignedHours = 0;
      const resAllocations = this.allocations.filter(a => a.resourceId === res.id);
      resAllocations.forEach(a => {
        const allocStart = new Date(a.startDate);
        const allocEnd = new Date(a.endDate);
        let overlappingWeekdays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${this.currentMonth}-${String(d).padStart(2, '0')}`;
          const currentDay = new Date(dateStr);
          if (currentDay >= allocStart && currentDay <= allocEnd) {
            const dayOfWeek = currentDay.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) overlappingWeekdays++;
          }
        }
        const dailyAllocation = (a.hoursPerWeek || 40) / 5;
        assignedHours += (overlappingWeekdays * dailyAllocation);
      });

      const utilization = netCapacity > 0 ? (assignedHours / netCapacity) * 100 : 0;

      if (netCapacity > 0) {
        if (utilization > 100) {
          warnings.push({
            type: 'critical',
            message: `<strong>${res.name}</strong> (${res.role}) is over-allocated at <strong>${utilization.toFixed(0)}%</strong> (${assignedHours.toFixed(0)}h / ${netCapacity.toFixed(0)}h net capacity) in ${this.getMonthName(month)}.`,
            solution: `Reduce weekly hours on active allocations or extend deadlines.`
          });
        } else if (utilization < 25 && res.status !== 'pending') {
          warnings.push({
            type: 'warning',
            message: `<strong>${res.name}</strong> is under-utilized at <strong>${utilization.toFixed(0)}%</strong>. High bench-risk profile.`,
            solution: `Assign outstanding backlogs or initiate cross-training programs.`
          });
        }
      }

      // Check for allocation overlapping with approved leaves
      resAllocations.forEach(a => {
        const allocStart = new Date(a.startDate);
        const allocEnd = new Date(a.endDate);
        
        resLeaves.forEach(l => {
          const leaveStart = new Date(l.start);
          const leaveEnd = new Date(l.end);
          
          if (allocStart <= leaveEnd && allocEnd >= leaveStart) {
            warnings.push({
              type: 'info',
              message: `Allocation overlap: <strong>${res.name}</strong> is scheduled on <strong>${a.projectName}</strong> while on <strong>${l.type}</strong> (${l.start} to ${l.end}).`,
              solution: `Delegate task coverage during this period.`
            });
          }
        });
      });

      // Check for heavy weekend work logs
      if (res.weekendHours > 8) {
        warnings.push({
          type: 'warning',
          message: `<strong>${res.name}</strong> logged <strong>${res.weekendHours} hours</strong> of weekend work. Burnout risk detected.`,
          solution: `Schedule compensatory time-off and audit release dependencies.`
        });
      }
    });

    if (warnings.length === 0) {
      listBody.innerHTML = `
        <div class="p-3 text-center text-muted" style="font-size: 0.85rem;">
          <i class="fa-solid fa-circle-check text-success me-1"></i> No critical over-allocation or bench-risk threats detected.
        </div>
      `;
      return;
    }

    warnings.forEach((w, idx) => {
      let icon = 'fa-circle-exclamation text-warning';
      let borderCol = 'border-warning';
      let bgCol = 'bg-warning-subtle';
      
      if (w.type === 'critical') {
        icon = 'fa-triangle-exclamation text-danger';
        borderCol = 'border-danger';
        bgCol = 'bg-danger-subtle';
      } else if (w.type === 'info') {
        icon = 'fa-circle-info text-info';
        borderCol = 'border-info';
        bgCol = 'bg-info-subtle';
      }

      const div = document.createElement('div');
      div.className = `alert-card p-3 mb-2 border-start border-4 rounded ${borderCol} ${bgCol} d-flex align-items-start gap-3`;
      div.style = 'font-size: 0.85rem; border: 1px solid var(--border-color); border-left-width: 4px !important;';
      div.innerHTML = `
        <div style="font-size: 1.1rem; padding-top: 2px;"><i class="fa-solid ${icon}"></i></div>
        <div class="flex-grow-1">
          <div class="font-semibold text-primary" style="margin-bottom: 2px;">${w.type.toUpperCase()}: Resourcing Hazard</div>
          <div style="color: var(--text-secondary); line-height: 1.4;">${w.message}</div>
          <div class="text-muted text-xs mt-1">💡 <strong>Remediation:</strong> ${w.solution}</div>
        </div>
        <button class="btn btn-sm text-secondary border-0 p-1" style="opacity: 0.7; cursor: pointer;" onclick="this.closest('.alert-card').remove();">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;
      listBody.appendChild(div);
    });
  },

  /**
   * Renders the heat map grid
   */
  renderHeatmap(filteredResources) {
    const heatmapEl = document.getElementById('planner-heatmap-container');
    if (!heatmapEl) return;

    const [year, month] = this.currentMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    let columnsHtml = '';
    let rowsHtml = '';

    if (this.heatmapScope === 'daily') {
      // Headers for each day
      columnsHtml += `<th class="sticky-col text-start" style="left: 0; min-width: 180px; z-index: 10; background: var(--bg-card);">Employee</th>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${this.currentMonth}-${String(d).padStart(2, '0')}`;
        const dayOfWeek = new Date(dateStr).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dayName = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dayOfWeek];
        
        columnsHtml += `
          <th class="text-center ${isWeekend ? 'bg-light text-muted' : ''}" style="min-width: 38px; font-size: 0.75rem; padding: 8px 4px;">
            <div>${d}</div>
            <div style="font-size: 0.65rem; opacity: 0.7;">${dayName}</div>
          </th>
        `;
      }

      // Rows for each employee
      filteredResources.forEach(res => {
        let cellsHtml = `
          <td class="sticky-col text-start font-semibold align-middle" style="left: 0; min-width: 180px; z-index: 9; background: var(--bg-card); border-right: 2px solid var(--border-color);">
            <div class="text-primary-custom" style="font-size: 0.9rem;">${res.name}</div>
            <div class="text-muted font-normal text-xs">${res.role}</div>
          </td>
        `;

        const resAllocations = this.allocations.filter(a => a.resourceId === res.id);
        const resLeaves = this.leaves.filter(l => l.name === res.name && l.status === 'approved');

        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${this.currentMonth}-${String(d).padStart(2, '0')}`;
          const currentDay = new Date(dateStr);
          const dayOfWeek = currentDay.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          // Check if employee is on leave
          let isOnLeave = false;
          let leaveType = '';
          resLeaves.forEach(l => {
            const start = new Date(l.start);
            const end = new Date(l.end);
            if (currentDay >= start && currentDay <= end) {
              isOnLeave = true;
              leaveType = l.type;
            }
          });

          // Calculate daily assigned hours
          let dailyAssigned = 0;
          let notes = [];
          resAllocations.forEach(a => {
            const start = new Date(a.startDate);
            const end = new Date(a.endDate);
            if (currentDay >= start && currentDay <= end) {
              if (!isWeekend) {
                const standardDailyHours = (a.hoursPerWeek || 40) / 5;
                dailyAssigned += standardDailyHours;
                notes.push(`${a.projectName}: ${standardDailyHours}h`);
              } else if (a.weekendHours > 0) {
                // If weekend and weekend hours exists, distribute or show standard logging
                // For simplified display, show allocations of weekend logs
                const weAlloc = a.weekendHours / 2; // split on sat & sun
                dailyAssigned += weAlloc;
                notes.push(`${a.projectName} (WE): ${weAlloc}h`);
              }
            }
          });

          // Render appropriate color cell
          let cellBg = 'background-color: var(--bg-card);';
          let textColor = 'color: var(--text-primary);';
          let content = dailyAssigned > 0 ? `${dailyAssigned.toFixed(0)}h` : '';
          let cellTooltip = `Employee: ${res.name}&#10;Date: ${dateStr}&#10;`;

          if (isOnLeave) {
            cellBg = 'background-color: rgba(147, 51, 234, 0.15);'; // Light Purple
            textColor = 'color: rgb(147, 51, 234);';
            content = '<i class="fa-solid fa-umbrella-beach"></i>';
            cellTooltip += `Status: On Leave (${leaveType})`;
          } else if (isWeekend) {
            if (dailyAssigned > 0) {
              cellBg = 'background-color: rgba(249, 115, 22, 0.2);'; // Light Orange
              textColor = 'color: rgb(249, 115, 22);';
              cellTooltip += `Status: Weekend Assignment&#10;Total Hours: ${dailyAssigned}h&#10;${notes.join(', ')}`;
            } else {
              cellBg = 'background-color: var(--bg-light); opacity: 0.4;';
              textColor = 'color: var(--text-secondary);';
              content = '';
              cellTooltip += 'Status: Non-working Weekend';
            }
          } else {
            // Weekday utilization color codes
            const utilization = (dailyAssigned / res.baseDailyCapacity) * 100;
            if (utilization === 0) {
              cellBg = 'background-color: rgba(226, 232, 240, 0.25);'; // Neutral greyish
              textColor = 'color: var(--text-muted);';
              content = '-';
              cellTooltip += `Status: Idle (0% allocated)`;
            } else if (utilization <= 50) {
              cellBg = 'background-color: rgba(14, 165, 233, 0.12);'; // Light Blue/cyan (available)
              textColor = 'color: rgb(2, 132, 199);';
              cellTooltip += `Status: Partial Load (${utilization.toFixed(0)}%)&#10;Hours: ${dailyAssigned}h&#10;${notes.join(', ')}`;
            } else if (utilization <= 100) {
              cellBg = 'background-color: rgba(34, 197, 94, 0.15);'; // Healthy Green
              textColor = 'color: rgb(21, 128, 61);';
              cellTooltip += `Status: Optimal Load (${utilization.toFixed(0)}%)&#10;Hours: ${dailyAssigned}h&#10;${notes.join(', ')}`;
            } else {
              cellBg = 'background-color: rgba(239, 68, 68, 0.18);'; // Alert Red
              textColor = 'color: rgb(185, 28, 28); font-weight: bold;';
              cellTooltip += `Status: OVER-ALLOCATION RISK (${utilization.toFixed(0)}%)&#10;Hours: ${dailyAssigned}h&#10;${notes.join(', ')}`;
            }
          }

          cellsHtml += `
            <td class="text-center align-middle" style="padding: 10px 4px; ${cellBg} ${textColor}; font-size: 0.8rem; cursor: pointer; border: 1px solid var(--border-color);" title="${cellTooltip}">
              ${content}
            </td>
          `;
        }

        rowsHtml += `<tr>${cellsHtml}</tr>`;
      });

    } else if (this.heatmapScope === 'weekly') {
      // 5-week breakdown
      columnsHtml += `<th class="sticky-col text-start" style="left: 0; min-width: 180px; z-index: 10; background: var(--bg-card);">Employee</th>`;
      for (let w = 1; w <= 5; w++) {
        columnsHtml += `<th class="text-center" style="min-width: 80px; font-size: 0.8rem; padding: 10px;">Week ${w}</th>`;
      }

      filteredResources.forEach(res => {
        let cellsHtml = `
          <td class="sticky-col text-start font-semibold align-middle" style="left: 0; min-width: 180px; z-index: 9; background: var(--bg-card); border-right: 2px solid var(--border-color);">
            <div class="text-primary-custom" style="font-size: 0.9rem;">${res.name}</div>
            <div class="text-muted font-normal text-xs">${res.role}</div>
          </td>
        `;

        const resAllocations = this.allocations.filter(a => a.resourceId === res.id);
        const resLeaves = this.leaves.filter(l => l.name === res.name && l.status === 'approved');

        // Mappings for weekly chunks
        const weekRanges = [
          { start: 1, end: 7 },
          { start: 8, end: 14 },
          { start: 15, end: 21 },
          { start: 22, end: 28 },
          { start: 29, end: daysInMonth }
        ];

        weekRanges.forEach((range, idx) => {
          let weekCapacity = 0;
          let weekAssigned = 0;
          let leavesCount = 0;

          for (let d = range.start; d <= range.end; d++) {
            const dateStr = `${this.currentMonth}-${String(d).padStart(2, '0')}`;
            const currentDay = new Date(dateStr);
            const dayOfWeek = currentDay.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            let onLeave = false;
            resLeaves.forEach(l => {
              if (currentDay >= new Date(l.start) && currentDay <= new Date(l.end)) {
                onLeave = true;
              }
            });

            if (onLeave) {
              leavesCount++;
            } else if (!isWeekend) {
              weekCapacity += res.baseDailyCapacity;
            }

            resAllocations.forEach(a => {
              if (currentDay >= new Date(a.startDate) && currentDay <= new Date(a.endDate)) {
                if (!isWeekend) {
                  weekAssigned += (a.hoursPerWeek || 40) / 5;
                } else if (a.weekendHours > 0) {
                  weekAssigned += a.weekendHours / 2;
                }
              }
            });
          }

          // Compute utilization for this week
          const util = weekCapacity > 0 ? (weekAssigned / weekCapacity) * 100 : 0;
          
          let cellBg = 'background-color: var(--bg-card);';
          let textColor = 'color: var(--text-primary);';
          let text = `${util.toFixed(0)}%`;

          if (leavesCount >= (range.end - range.start + 1) - 2) { // mostly on leave
            cellBg = 'background-color: rgba(147, 51, 234, 0.15);';
            textColor = 'color: rgb(147, 51, 234);';
            text = 'Leave';
          } else if (util === 0) {
            cellBg = 'background-color: rgba(226, 232, 240, 0.25);';
            textColor = 'color: var(--text-muted);';
            text = '0%';
          } else if (util <= 50) {
            cellBg = 'background-color: rgba(14, 165, 233, 0.12);';
            textColor = 'color: rgb(2, 132, 199);';
          } else if (util <= 100) {
            cellBg = 'background-color: rgba(34, 197, 94, 0.15);';
            textColor = 'color: rgb(21, 128, 61);';
          } else {
            cellBg = 'background-color: rgba(239, 68, 68, 0.18);';
            textColor = 'color: rgb(185, 28, 28); font-weight: bold;';
          }

          cellsHtml += `
            <td class="text-center align-middle" style="padding: 12px; ${cellBg} ${textColor}; font-size: 0.85rem; border: 1px solid var(--border-color);" title="Assigned: ${weekAssigned.toFixed(0)}h / Cap: ${weekCapacity.toFixed(0)}h">
              ${text}
            </td>
          `;
        });

        rowsHtml += `<tr>${cellsHtml}</tr>`;
      });

    } else if (this.heatmapScope === 'monthly') {
      // 3-month overview
      columnsHtml += `<th class="sticky-col text-start" style="left: 0; min-width: 180px; z-index: 10; background: var(--bg-card);">Employee</th>`;
      const months = ['2026-07', '2026-08', '2026-09'];
      months.forEach(m => {
        const [, mNum] = m.split('-').map(Number);
        columnsHtml += `<th class="text-center" style="min-width: 100px; font-size: 0.8rem; padding: 10px;">${this.getMonthName(mNum)} 2026</th>`;
      });

      filteredResources.forEach(res => {
        let cellsHtml = `
          <td class="sticky-col text-start font-semibold align-middle" style="left: 0; min-width: 180px; z-index: 9; background: var(--bg-card); border-right: 2px solid var(--border-color);">
            <div class="text-primary-custom" style="font-size: 0.9rem;">${res.name}</div>
            <div class="text-muted font-normal text-xs">${res.role}</div>
          </td>
        `;

        months.forEach(m => {
          const [year, month] = m.split('-').map(Number);
          const daysInM = new Date(year, month, 0).getDate();
          
          let mCapacity = 0;
          let mAssigned = 0;
          let mLeave = 0;

          // Leaves & allocations
          const resAllocations = this.allocations.filter(a => a.resourceId === res.id);
          const resLeaves = this.leaves.filter(l => l.name === res.name && l.status === 'approved');

          for (let d = 1; d <= daysInM; d++) {
            const dateStr = `${m}-${String(d).padStart(2, '0')}`;
            const currentDay = new Date(dateStr);
            const dayOfWeek = currentDay.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            let onLeave = false;
            resLeaves.forEach(l => {
              if (currentDay >= new Date(l.start) && currentDay <= new Date(l.end)) {
                onLeave = true;
              }
            });

            if (onLeave) {
              if (!isWeekend) mLeave += res.baseDailyCapacity;
            } else if (!isWeekend) {
              mCapacity += res.baseDailyCapacity;
            }

            resAllocations.forEach(a => {
              if (currentDay >= new Date(a.startDate) && currentDay <= new Date(a.endDate)) {
                if (!isWeekend) {
                  mAssigned += (a.hoursPerWeek || 40) / 5;
                } else if (a.weekendHours > 0) {
                  mAssigned += a.weekendHours / 2;
                }
              }
            });
          }

          const netCap = mCapacity;
          const util = netCap > 0 ? (mAssigned / netCap) * 100 : 0;

          let cellBg = 'background-color: var(--bg-card);';
          let textColor = 'color: var(--text-primary);';

          if (util === 0) {
            cellBg = 'background-color: rgba(226, 232, 240, 0.25);';
            textColor = 'color: var(--text-muted);';
          } else if (util <= 50) {
            cellBg = 'background-color: rgba(14, 165, 233, 0.12);';
            textColor = 'color: rgb(2, 132, 199);';
          } else if (util <= 100) {
            cellBg = 'background-color: rgba(34, 197, 94, 0.15);';
            textColor = 'color: rgb(21, 128, 61);';
          } else {
            cellBg = 'background-color: rgba(239, 68, 68, 0.18);';
            textColor = 'color: rgb(185, 28, 28); font-weight: bold;';
          }

          cellsHtml += `
            <td class="text-center align-middle" style="padding: 12px; ${cellBg} ${textColor}; font-size: 0.85rem; border: 1px solid var(--border-color);" title="Assigned: ${mAssigned.toFixed(0)}h / Net Cap: ${netCap.toFixed(0)}h">
              ${util.toFixed(0)}%
            </td>
          `;
        });

        rowsHtml += `<tr>${cellsHtml}</tr>`;
      });
    }

    heatmapEl.innerHTML = `
      <div class="table-responsive" style="max-height: 520px; overflow: auto; border: 1px solid var(--border-color); border-radius: 8px;">
        <table class="table table-enterprise m-0" style="min-width: 100%; border-collapse: separate; border-spacing: 0;">
          <thead>
            <tr style="background: var(--bg-card); position: sticky; top: 0; z-index: 11; border-bottom: 2px solid var(--border-color);">
              ${columnsHtml}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      
      <!-- Legend -->
      <div class="d-flex flex-wrap gap-4 mt-3 justify-content-center border rounded p-3" style="font-size: 0.8rem; background-color: var(--bg-light);">
        <div class="d-flex align-items-center gap-1"><span style="width: 16px; height: 16px; border-radius: 3px; display: inline-block; background-color: rgba(226, 232, 240, 0.5);"></span> Idle (0%)</div>
        <div class="d-flex align-items-center gap-1"><span style="width: 16px; height: 16px; border-radius: 3px; display: inline-block; background-color: rgba(14, 165, 233, 0.2);"></span> Partial Load (<50%)</div>
        <div class="d-flex align-items-center gap-1"><span style="width: 16px; height: 16px; border-radius: 3px; display: inline-block; background-color: rgba(34, 197, 94, 0.25);"></span> Healthy Load (51-100%)</div>
        <div class="d-flex align-items-center gap-1"><span style="width: 16px; height: 16px; border-radius: 3px; display: inline-block; background-color: rgba(239, 68, 68, 0.25);"></span> Over-allocated (>100%)</div>
        <div class="d-flex align-items-center gap-1"><span style="width: 16px; height: 16px; border-radius: 3px; display: inline-block; background-color: rgba(147, 51, 234, 0.25);"></span> Approved Leave</div>
        <div class="d-flex align-items-center gap-1"><span style="width: 16px; height: 16px; border-radius: 3px; display: inline-block; background-color: rgba(249, 115, 22, 0.25);"></span> Weekend Allocation</div>
      </div>
    `;
  },

  /**
   * Renders the Allocation Calendar timeline
   */
  renderAllocationCalendar(filteredResources) {
    const calendarEl = document.getElementById('planner-calendar-container');
    if (!calendarEl) return;

    const [year, month] = this.currentMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    let listHtml = '';

    filteredResources.forEach(res => {
      const resAllocations = this.allocations.filter(a => a.resourceId === res.id);
      
      let allocBlocksHtml = '';
      if (resAllocations.length === 0) {
        allocBlocksHtml = `
          <div class="p-3 text-muted border border-dashed rounded text-center text-xs" style="background-color: var(--bg-light);">
            No pipeline projects assigned for this resource.
          </div>
        `;
      } else {
        resAllocations.forEach(a => {
          // Calculate start/end dates for positioning
          const start = new Date(a.startDate);
          const end = new Date(a.endDate);
          
          const monthStart = new Date(`${this.currentMonth}-01`);
          const monthEnd = new Date(`${this.currentMonth}-${daysInMonth}`);
          
          // Clamp to current month boundaries for visual timeline width
          const visualStart = start < monthStart ? monthStart : start;
          const visualEnd = end > monthEnd ? monthEnd : end;

          if (visualStart <= monthEnd && visualEnd >= monthStart) {
            // Overlaps current month, render block
            const startDay = visualStart.getDate();
            const endDay = visualEnd.getDate();
            
            const leftPercent = ((startDay - 1) / daysInMonth) * 100;
            const widthPercent = ((endDay - startDay + 1) / daysInMonth) * 100;

            let colorClass = 'bg-primary-subtle border-primary text-primary';
            if (a.hoursPerWeek >= 40) colorClass = 'bg-success-subtle border-success text-success';
            else if (a.hoursPerWeek < 20) colorClass = 'bg-info-subtle border-info text-info';

            allocBlocksHtml += `
              <div class="position-relative mb-2" style="height: 44px;">
                <div class="allocation-bar position-absolute rounded px-3 py-1 border d-flex align-items-center justify-content-between cursor-pointer" 
                     style="left: ${leftPercent}%; width: ${widthPercent}%; min-width: 80px; height: 100%; font-size: 0.75rem; z-index: 5; transition: all 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                     title="${a.projectName}&#10;Role: ${a.role}&#10;Timeline: ${a.startDate} to ${a.endDate}&#10;Allocated Load: ${a.hoursPerWeek}h/week&#10;Click to edit allocation"
                     onclick="window.portalPlannerInstance.openAllocateModal('${res.id}', '${a.id}')">
                  <div style="overflow: hidden; text-overflow: ellipsis; max-width: 70%;">
                    <strong class="text-primary-custom" style="display: block; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis;">${a.projectName}</strong>
                    <span class="text-muted text-xs" style="font-size: 0.7rem;">${a.role}</span>
                  </div>
                  <div class="text-end">
                    <span class="badge bg-light text-dark font-mono font-bold">${a.hoursPerWeek}h/w</span>
                    ${a.weekendHours > 0 ? `<span class="badge bg-warning text-dark font-mono font-bold font-xs">+${a.weekendHours}h WE</span>` : ''}
                  </div>
                </div>
              </div>
            `;
          }
        });
      }

      listHtml += `
        <div class="row g-0 align-items-stretch border-bottom py-3 hover-row">
          <div class="col-md-3 border-end pe-3 d-flex flex-column justify-content-center">
            <div class="d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center gap-2">
                <div class="avatar-circle font-bold d-flex align-items-center justify-content-center" style="width: 34px; height: 34px; border-radius: 50%; background-color: var(--brand-primary); color: white; font-size: 0.8rem; flex-shrink: 0;">
                  ${res.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h6 class="mb-0 font-bold text-primary" style="font-size: 0.9rem;">${res.name}</h6>
                  <span class="text-xs text-secondary-custom">${res.role} • <strong>${res.dept}</strong></span>
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <button class="btn btn-sm btn-outline-primary py-0 px-1.5" onclick="window.portalPlannerInstance.openResourceModal('${res.id}')" title="Edit Resource Details">
                  <i class="fa-solid fa-pen-to-square" style="font-size: 0.75rem;"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger py-0 px-1.5" onclick="window.portalPlannerInstance.deleteResource('${res.id}')" title="Delete Resource">
                  <i class="fa-solid fa-trash-can" style="font-size: 0.75rem;"></i>
                </button>
              </div>
            </div>
          </div>
          <div class="col-md-9 ps-3 position-relative d-flex flex-column justify-content-center" style="background-color: var(--bg-card); min-height: 70px;">
            <!-- Subtle column guidelines behind -->
            <div class="d-none d-md-flex position-absolute w-100 h-100 top-0 left-0 justify-content-between align-items-stretch" style="pointer-events: none; opacity: 0.05;">
              <span class="border-end h-100" style="width: 0%;"></span>
              <span class="border-end h-100" style="width: 25%;"></span>
              <span class="border-end h-100" style="width: 50%;"></span>
              <span class="border-end h-100" style="width: 75%;"></span>
              <span class="border-end h-100" style="width: 100%;"></span>
            </div>
            
            <div class="w-100">
              ${allocBlocksHtml}
            </div>
          </div>
        </div>
      `;
    });

    calendarEl.innerHTML = `
      <div class="calendar-header-timeline d-none d-md-flex row g-0 border-bottom pb-2 font-semibold text-secondary text-xs" style="background-color: var(--bg-light); padding: 8px;">
        <div class="col-md-3">Resource Employee</div>
        <div class="col-md-9 ps-3 d-flex justify-content-between">
          <span>Start of Month</span>
          <span>Week 1</span>
          <span>Mid-Month (15th)</span>
          <span>Week 3</span>
          <span>End of Month</span>
        </div>
      </div>
      <div class="calendar-rows-container">
        ${listHtml}
      </div>
    `;
    
    // Publish window instance reference so inline handlers can resolve
    window.portalPlannerInstance = this;
  },

  /**
   * Renders the Availability Matrix directory
   */
  renderAvailabilityMatrix(filteredResources) {
    const matrixEl = document.getElementById('planner-matrix-container');
    if (!matrixEl) return;

    let rowsHtml = '';

    filteredResources.forEach(res => {
      const resAllocations = this.allocations.filter(a => a.resourceId === res.id);
      
      const [year, month] = this.currentMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();

      // Calculating totals
      let weekdays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dayOfWeek = new Date(year, month - 1, d).getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) weekdays++;
      }
      
      const baseCap = weekdays * res.baseDailyCapacity;

      let leaveHours = 0;
      const resLeaves = this.leaves.filter(l => l.name === res.name && l.status === 'approved');
      resLeaves.forEach(l => {
        const leaveStart = new Date(l.start);
        const leaveEnd = new Date(l.end);
        let overlappingDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${this.currentMonth}-${String(d).padStart(2, '0')}`;
          const currentDay = new Date(dateStr);
          if (currentDay >= leaveStart && currentDay <= leaveEnd) {
            const dayOfWeek = currentDay.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) overlappingDays++;
          }
        }
        leaveHours += (overlappingDays * res.baseDailyCapacity);
      });

      const netCapacity = baseCap - leaveHours;

      let assignedHours = 0;
      resAllocations.forEach(a => {
        const allocStart = new Date(a.startDate);
        const allocEnd = new Date(a.endDate);
        let overlappingWeekdays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${this.currentMonth}-${String(d).padStart(2, '0')}`;
          const currentDay = new Date(dateStr);
          if (currentDay >= allocStart && currentDay <= allocEnd) {
            const dayOfWeek = currentDay.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) overlappingWeekdays++;
          }
        }
        const dailyAllocation = (a.hoursPerWeek || 40) / 5;
        assignedHours += (overlappingWeekdays * dailyAllocation);
      });

      const remainingCap = Math.max(0, netCapacity - assignedHours);
      const utilization = netCapacity > 0 ? (assignedHours / netCapacity) * 100 : 0;

      let utilBadgeClass = 'bg-success';
      if (utilization > 100) utilBadgeClass = 'bg-danger';
      else if (utilization > 85) utilBadgeClass = 'bg-warning text-dark';
      else if (utilization < 25) utilBadgeClass = 'bg-info';

      let allocationsText = resAllocations.map(a => `${a.projectName} (${a.hoursPerWeek}h/w)`).join('<br>') || '<span class="text-muted italic text-xs">No active pipelines</span>';

      rowsHtml += `
        <tr>
          <td>
            <div class="font-semibold text-primary" style="font-size: 0.9rem;">${res.name}</div>
            <div class="text-xs text-muted">${res.role}</div>
          </td>
          <td><span class="badge bg-light text-dark font-semibold">${res.dept}</span></td>
          <td class="font-mono text-center font-bold text-xs" style="color: var(--text-primary);">${netCapacity.toFixed(0)}h</td>
          <td class="font-mono text-center font-semibold text-xs text-success" style="color: var(--brand-success);">${assignedHours.toFixed(0)}h</td>
          <td class="font-mono text-center text-xs text-muted" style="color: var(--text-muted);">${res.loggedHours || 0}h</td>
          <td class="font-mono text-center text-xs text-secondary-custom">${leaveHours > 0 ? `${leaveHours}h` : '-'}</td>
          <td class="font-mono text-center text-xs text-warning" style="color: var(--brand-warning);">${res.weekendHours > 0 ? `${res.weekendHours}h` : '-'}</td>
          <td class="font-mono text-center font-bold text-xs" style="color: var(--text-primary);">${remainingCap.toFixed(0)}h</td>
          <td class="text-center align-middle">
            <span class="badge ${utilBadgeClass} font-mono px-3 py-1 font-semibold" style="font-size: 0.8rem;">${utilization.toFixed(0)}%</span>
          </td>
          <td style="font-size: 0.8rem; line-height: 1.3;">${allocationsText}</td>
          <td class="text-center align-middle">
            <div class="d-flex justify-content-center gap-1">
              <button class="btn btn-sm btn-outline-primary py-0 px-1.5" onclick="window.portalPlannerInstance.openResourceModal('${res.id}')" title="Edit Team Member">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="btn btn-sm btn-outline-success py-0 px-1.5" onclick="window.portalPlannerInstance.openAllocateModal('${res.id}')" title="Allocate Project">
                <i class="fa-solid fa-plus"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger py-0 px-1.5" onclick="window.portalPlannerInstance.deleteResource('${res.id}')" title="Delete Team Member">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    window.portalPlannerInstance = this;

    matrixEl.innerHTML = `
      <div class="table-responsive" style="border: 1px solid var(--border-color); border-radius: 8px;">
        <table class="table table-enterprise m-0 align-middle">
          <thead>
            <tr style="background-color: var(--bg-light); font-size: 0.8rem; text-align: center;">
              <th class="text-start" style="width: 180px;">Employee & Designation</th>
              <th style="width: 110px;">Department</th>
              <th style="width: 80px;">Net Cap</th>
              <th style="width: 80px;">Assigned</th>
              <th style="width: 80px;">Logged</th>
              <th style="width: 80px;">Leave</th>
              <th style="width: 80px;">Weekend</th>
              <th style="width: 90px;">Remaining</th>
              <th style="width: 100px;">Utilization</th>
              <th>Pipeline Projects Allocations</th>
              <th style="width: 110px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  },

  /**
   * Delete team member and associated allocations
   */
  deleteResource(resourceId) {
    const canDelete = !this.app.currentUser || this.app.currentUser.role === 'admin';
    if (!canDelete) {
      this.app.showToast('Delete permission restricted to Administrators.', 'danger');
      return;
    }

    const res = this.resources.find(r => r.id === resourceId);
    if (!res) return;

    const executeDelete = () => {
      this.resources = this.resources.filter(r => r.id !== resourceId);
      this.allocations = this.allocations.filter(a => a.resourceId !== resourceId);
      
      Storage.set('resources', this.resources);
      Storage.set('resource_allocations', this.allocations);
      this.app.resourcesList = this.resources;

      this.app.showToast(`Team member '${res.name}' deleted successfully`, 'info');
      this.populateDropdowns();
      this.render();
    };

    if (this.app && typeof this.app.confirmModal === 'function') {
      this.app.confirmModal({
        title: 'Delete Team Member',
        bodyHtml: `
          <div class="p-2">
            <p class="mb-2 font-semibold text-danger" style="font-size: 0.95rem;">Are you sure you want to delete team member <strong>${res.name}</strong>?</p>
            <p class="text-secondary text-xs mb-0">All project allocations, capacity logs, and scheduling entries for this resource will also be released.</p>
          </div>
        `,
        confirmText: 'Delete Resource',
        confirmClass: 'btn-enterprise-danger',
        onConfirm: executeDelete
      });
    } else {
      executeDelete();
    }
  },

  /**
   * Add or Edit Team Member Modal
   */
  openResourceModal(resourceId = null) {
    const target = resourceId ? this.resources.find(r => r.id === resourceId) : null;
    const isEdit = !!target;
    const title = isEdit ? 'Edit Team Member Details' : 'Add New Team Member to Resource Planner';

    const depts = ['Dev', 'QA', 'BA', 'Product Manager'];
    let deptOptions = '';
    depts.forEach(d => {
      const sel = (target && target.dept === d) ? 'selected' : '';
      deptOptions += `<option value="${d}" ${sel}>${d}</option>`;
    });

    const bodyHtml = `
      <form id="resource-edit-form" class="row g-3">
        <div class="col-md-12">
          <label class="form-label font-semibold">Full Name *</label>
          <input type="text" class="form-control select-enterprise w-100" id="res-name" value="${target ? target.name : ''}" required placeholder="E.g. Sarah Connor" />
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Department *</label>
          <select class="form-select select-enterprise w-100" id="res-dept" required>
            ${deptOptions}
          </select>
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Designation / Role *</label>
          <input type="text" class="form-control select-enterprise w-100" id="res-role" value="${target ? target.role : ''}" required placeholder="E.g. Senior Security Engineer" />
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Base Weekly Capacity (Hours)</label>
          <input type="number" class="form-control select-enterprise w-100" id="res-weekly-cap" value="${target ? (target.baseWeeklyCapacity || 40) : 40}" min="10" max="80" required />
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Base Daily Capacity (Hours)</label>
          <input type="number" class="form-control select-enterprise w-100" id="res-daily-cap" value="${target ? (target.baseDailyCapacity || 8) : 8}" min="1" max="16" required />
        </div>

        ${isEdit ? `
          <div class="col-12 mt-3 pt-3 border-top d-flex justify-content-between">
            <button type="button" class="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" id="btn-delete-resource-modal">
              <i class="fa-solid fa-trash-can"></i> Delete Team Member
            </button>
            <span class="text-muted small align-self-center">Resource ID: ${target.id}</span>
          </div>
        ` : ''}
      </form>
    `;

    this.app.openModal(title, bodyHtml, (overlay) => {
      const delBtn = overlay.querySelector('#btn-delete-resource-modal');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          overlay.classList.remove('show');
          this.deleteResource(target.id);
        });
      }

      const name = overlay.querySelector('#res-name').value.trim();
      const dept = overlay.querySelector('#res-dept').value;
      const role = overlay.querySelector('#res-role').value.trim();
      const weeklyCap = parseInt(overlay.querySelector('#res-weekly-cap').value, 10) || 40;
      const dailyCap = parseInt(overlay.querySelector('#res-daily-cap').value, 10) || 8;

      if (!name || !role) {
        this.app.showToast('Please enter full name and role designation', 'warning');
        return false;
      }

      if (isEdit) {
        const idx = this.resources.findIndex(r => r.id === target.id);
        if (idx !== -1) {
          this.resources[idx] = {
            ...this.resources[idx],
            name,
            dept,
            role,
            baseWeeklyCapacity: weeklyCap,
            baseDailyCapacity: dailyCap
          };
        }
        this.app.showToast(`Updated details for ${name}`, 'success');
      } else {
        const newId = `RES20${this.resources.length + 1}`;
        const newRes = {
          id: newId,
          name,
          dept,
          role,
          baseWeeklyCapacity: weeklyCap,
          baseDailyCapacity: dailyCap,
          allocation: 0,
          status: 'pending',
          loggedHours: 0,
          weekendHours: 0
        };
        this.resources.push(newRes);
        this.app.showToast(`Added team member ${name} under ${dept}`, 'success');
      }

      Storage.set('resources', this.resources);
      this.app.resourcesList = this.resources;
      this.populateDropdowns();
      this.render();
      return true;
    });
  },

  /**
   * Opens the custom popup Modal for allocating/modifying resource pipeline assignments
   */
  openAllocateModal(resourceId = null, allocationId = null) {
    let targetAlloc = null;
    if (allocationId) {
      targetAlloc = this.allocations.find(a => a.id === allocationId);
    }

    // Prepare dropdown options for resources and projects
    let resourceOptions = '';
    this.resources.forEach(res => {
      const selected = (resourceId === res.id || (targetAlloc && targetAlloc.resourceId === res.id)) ? 'selected' : '';
      resourceOptions += `<option value="${res.id}" ${selected}>${res.name} (${res.role})</option>`;
    });

    let projectOptions = '';
    this.projects.forEach(p => {
      const selected = (targetAlloc && targetAlloc.projectId === p.id) ? 'selected' : '';
      projectOptions += `<option value="${p.id}" ${selected}>[${p.id}] ${p.name}</option>`;
    });

    const isEdit = !!targetAlloc;
    const title = isEdit ? 'Modify Project Allocation Schedule' : 'Allocate Resource to Enterprise Pipeline';
    
    const bodyHtml = `
      <form id="allocate-resource-form" class="row g-3">
        <input type="hidden" id="alloc-id" value="${targetAlloc ? targetAlloc.id : ''}" />
        
        <div class="col-md-12">
          <label class="form-label font-semibold">Select Employee / Professional Resource</label>
          <select class="form-select select-enterprise w-100" id="alloc-resource-id" required ${isEdit ? 'disabled' : ''}>
            ${resourceOptions}
          </select>
        </div>
        
        <div class="col-md-12">
          <label class="form-label font-semibold">Pipeline Project</label>
          <select class="form-select select-enterprise w-100" id="alloc-project-id" required>
            ${projectOptions}
          </select>
        </div>

        <div class="col-md-12">
          <label class="form-label font-semibold">Allocated Role / Function on Project</label>
          <input type="text" class="form-control select-enterprise w-100" id="alloc-role" 
                 value="${targetAlloc ? targetAlloc.role : ''}" 
                 placeholder="E.g. Principal UI Architect, Security Auditor" required />
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Allocation Start Date</label>
          <input type="date" class="form-control select-enterprise w-100" id="alloc-start" 
                 value="${targetAlloc ? targetAlloc.startDate : '2026-07-01'}" required />
        </div>
        
        <div class="col-md-6">
          <label class="form-label font-semibold">Allocation End Date</label>
          <input type="date" class="form-control select-enterprise w-100" id="alloc-end" 
                 value="${targetAlloc ? targetAlloc.endDate : '2026-07-31'}" required />
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Standard Weekly Allocation (Hours)</label>
          <input type="number" class="form-control select-enterprise w-100" id="alloc-hours-week" min="1" max="80"
                 value="${targetAlloc ? targetAlloc.hoursPerWeek : '40'}" placeholder="E.g. 40" required />
          <div class="text-muted text-xs mt-1">Standard full-time is 40h/week.</div>
        </div>

        <div class="col-md-6">
          <label class="form-label font-semibold">Allocated Weekend Hours (Monthly Limit)</label>
          <input type="number" class="form-control select-enterprise w-100" id="alloc-hours-weekend" min="0" max="40"
                 value="${targetAlloc ? targetAlloc.weekendHours : '0'}" placeholder="E.g. 0" />
          <div class="text-muted text-xs mt-1">Leave 0 if weekends are standard closures.</div>
        </div>

        <div class="col-md-12">
          <label class="form-label font-semibold">Detailed Operational Notes / Deliverable Milestones</label>
          <textarea class="form-control select-enterprise w-100" id="alloc-notes" rows="2" 
                    placeholder="Describe specific task coverage or deliverables...">${targetAlloc ? targetAlloc.notes : ''}</textarea>
        </div>

        ${isEdit ? `
          <div class="col-12 mt-3 pt-3 border-top d-flex justify-content-between">
            <button type="button" class="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" id="btn-delete-allocation-modal">
              <i class="fa-solid fa-trash-can"></i> Release Resource From Project
            </button>
            <span class="text-muted small align-self-center">ID: ${targetAlloc.id}</span>
          </div>
        ` : ''}
      </form>
    `;

    this.app.openModal(title, bodyHtml, (overlay) => {
      // Inline listener to handle deleting/releasing from edit modal
      const delBtn = overlay.querySelector('#btn-delete-allocation-modal');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          if (confirm('Are you absolutely sure you want to release this resource from this project allocation?')) {
            this.allocations = this.allocations.filter(a => a.id !== targetAlloc.id);
            Storage.set('resource_allocations', this.allocations);
            this.app.showToast('Resource released successfully from project', 'info');
            this.render();
            // Close the modal
            overlay.classList.remove('show');
          }
        });
      }

      const resId = overlay.querySelector('#alloc-resource-id').value;
      const projId = overlay.querySelector('#alloc-project-id').value;
      const role = overlay.querySelector('#alloc-role').value;
      const start = overlay.querySelector('#alloc-start').value;
      const end = overlay.querySelector('#alloc-end').value;
      const weeklyHours = parseInt(overlay.querySelector('#alloc-hours-week').value, 10);
      const weekendHours = parseInt(overlay.querySelector('#alloc-hours-weekend').value, 10) || 0;
      const notes = overlay.querySelector('#alloc-notes').value;

      if (!resId || !projId || !role || !start || !end || isNaN(weeklyHours) || weeklyHours <= 0) {
        this.app.showToast('Please complete all required fields with positive hours values.', 'warning');
        return false;
      }

      if (new Date(start) > new Date(end)) {
        this.app.showToast('Start date cannot fall after End date.', 'warning');
        return false;
      }

      const proj = this.projects.find(p => p.id === projId);
      const projName = proj ? proj.name : 'Pipeline Project';

      if (isEdit) {
        // Edit existing
        const idx = this.allocations.findIndex(a => a.id === targetAlloc.id);
        if (idx !== -1) {
          this.allocations[idx] = {
            ...this.allocations[idx],
            projectId: projId,
            projectName: projName,
            role,
            startDate: start,
            endDate: end,
            hoursPerWeek: weeklyHours,
            weekendHours,
            notes
          };
          this.app.showToast(`Allocation schedule updated successfully`, 'success');
        }
      } else {
        // Generate new ID
        const newId = `ALC00${this.allocations.length + 1}`;
        const newAlloc = {
          id: newId,
          resourceId: resId,
          projectId: projId,
          projectName: projName,
          role,
          startDate: start,
          endDate: end,
          hoursPerWeek: weeklyHours,
          weekendHours,
          notes
        };
        this.allocations.push(newAlloc);
        this.app.showToast(`Allocated resource to ${projName} successfully`, 'success');
      }

      // Save allocations
      Storage.set('resource_allocations', this.allocations);

      // Sync allocation percentage back to resources list load index
      const resIdx = this.resources.findIndex(r => r.id === resId);
      if (resIdx !== -1) {
        const resAllocs = this.allocations.filter(a => a.resourceId === resId);
        // Sum weekly allocation hours
        const totalWAlloc = resAllocs.reduce((sum, a) => sum + (a.hoursPerWeek || 0), 0);
        const allocationPercent = Math.min(150, Math.round((totalWAlloc / this.resources[resIdx].baseWeeklyCapacity) * 100));
        
        this.resources[resIdx].allocation = allocationPercent;
        this.resources[resIdx].status = allocationPercent > 0 ? 'allocated' : 'pending';
        Storage.set('resources', this.resources);
        this.app.resourcesList = this.resources;
      }

      // Re-render
      this.render();
      return true;
    });
  },

  /**
   * Simple month index translation
   */
  getMonthName(index) {
    return [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ][index - 1] || 'Month';
  }
};
