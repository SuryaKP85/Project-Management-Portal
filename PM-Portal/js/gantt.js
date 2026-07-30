/* gantt.js - Advanced Interactive Gantt Chart Engine with Real-Time Sidebar Controls, Dependency Mapping, Critical Path Highlighting, Custom Milestones, and Zoom/Export Engines */

import { Storage } from './storage.js';

export const GanttModule = {
  app: null,
  projects: [],
  zoom: 'month', // 'month' | 'quarter' | 'year'
  
  filters: {
    customer: 'all',
    resource: 'all',
    project: 'all'
  },
  
  layers: {
    estimated: true,
    actual: true,
    progress: true,
    dependencies: true,
    milestones: true,
    today: true,
    critical: true
  },
  
  showTaskInputs: true,
  todayDate: new Date('2026-07-28'), // Fixed Today Anchor matching system metadata

  /**
   * Initializes the Gantt Module
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;
    this.loadAndPrepareProjects();
    this.setupEventListeners();
    this.populateFilterOptions();
    this.render();
  },

  /**
   * Loads projects and ensures they are enriched with required Gantt parameters
   */
  loadAndPrepareProjects() {
    let stored = Storage.get('projects');
    if (!stored || !Array.isArray(stored) || stored.length === 0) {
      stored = this.app.projectsList || [];
    }
    
    // Enrich with dependencies and milestones if missing
    let modified = false;
    this.projects = stored.map((p, index) => {
      let changed = false;
      
      // Default dependencies to show some linkages immediately
      if (p.dependency === undefined) {
        const mockDeps = ['None', 'PRJ001', 'None', 'PRJ002', 'PRJ003'];
        p.dependency = mockDeps[index % mockDeps.length];
        changed = true;
      }
      
      // Ensure we have estimated dates
      if (!p.estimatedStart || !p.estimatedEnd) {
        const mockDates = [
          { start: '2026-07-01', end: '2026-07-15' },
          { start: '2026-07-10', end: '2026-08-05' },
          { start: '2026-06-15', end: '2026-07-10' },
          { start: '2026-07-20', end: '2026-08-20' },
          { start: '2026-05-10', end: '2026-06-15' }
        ];
        const dateConf = mockDates[index % mockDates.length];
        p.estimatedStart = p.estimatedStart || dateConf.start;
        p.estimatedEnd = p.estimatedEnd || dateConf.end;
        changed = true;
      }

      // Add actual starts/ends for completed or high-progress projects
      if (!p.actualStart && p.progress > 0) {
        // Derive actual start matching estimated start +/- 2 days
        const startD = new Date(p.estimatedStart);
        startD.setDate(startD.getDate() - 1);
        p.actualStart = startD.toISOString().split('T')[0];
        
        if (p.progress === 100 && !p.actualEnd) {
          const endD = new Date(p.estimatedEnd);
          endD.setDate(endD.getDate() + 1);
          p.actualEnd = endD.toISOString().split('T')[0];
        }
        changed = true;
      }

      if (changed) {
        modified = true;
      }
      return p;
    });

    if (modified) {
      Storage.set('projects', this.projects);
      this.app.projectsList = this.projects;
    }
  },

  /**
   * Save and sync projects back to storage and app
   */
  saveAndSync() {
    Storage.set('projects', this.projects);
    if (this.app) {
      this.app.projectsList = this.projects;
    }
  },

  /**
   * Populate Filter Select Inputs dynamically
   */
  populateFilterOptions() {
    const custSelect = document.getElementById('gantt-filter-customer');
    const resSelect = document.getElementById('gantt-filter-resource');
    const prjSelect = document.getElementById('gantt-filter-project');
    
    if (!custSelect || !resSelect || !prjSelect) return;

    // Reset keeping first "All" option
    custSelect.innerHTML = '<option value="all">All Customers</option>';
    resSelect.innerHTML = '<option value="all">All Developers</option>';
    prjSelect.innerHTML = '<option value="all">All Active Projects</option>';

    // Customers
    const registeredCusts = (Storage.getCustomers() || []).map(c => c.name).filter(Boolean);
    const projCusts = (this.projects || []).map(p => p.client).filter(Boolean);
    const customers = [...new Set([...registeredCusts, ...projCusts])].filter(Boolean).sort();
    customers.forEach(c => {
      custSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });

    // Developers (specifically)
    const developers = new Set();
    this.projects.forEach(p => {
      if (p.developer) developers.add(p.developer);
    });
    
    [...developers].sort().forEach(d => {
      resSelect.innerHTML += `<option value="${d}">${d}</option>`;
    });

    // Projects
    this.projects.forEach(p => {
      prjSelect.innerHTML += `<option value="${p.id}">${p.id} - ${p.name}</option>`;
    });

    // Set value back to 'all' or selected
    custSelect.value = this.filters.customer;
    resSelect.value = this.filters.resource;
    prjSelect.value = this.filters.project;
  },

  /**
   * Setup Event Listeners for filters, buttons, layers
   */
  setupEventListeners() {
    // Dropdown Filters
    const custSelect = document.getElementById('gantt-filter-customer');
    if (custSelect) {
      custSelect.addEventListener('change', (e) => {
        this.filters.customer = e.target.value;
        this.render();
      });
    }

    const resSelect = document.getElementById('gantt-filter-resource');
    if (resSelect) {
      resSelect.addEventListener('change', (e) => {
        this.filters.resource = e.target.value;
        this.render();
      });
    }

    const prjSelect = document.getElementById('gantt-filter-project');
    if (prjSelect) {
      prjSelect.addEventListener('change', (e) => {
        this.filters.project = e.target.value;
        this.render();
      });
    }

    // Layer switches
    const layerIds = ['estimated', 'actual', 'progress', 'dependencies', 'milestones', 'today', 'critical'];
    layerIds.forEach(id => {
      const toggle = document.getElementById(`gantt-layer-${id}`);
      if (toggle) {
        toggle.checked = this.layers[id];
        toggle.addEventListener('change', (e) => {
          this.layers[id] = e.target.checked;
          this.render();
        });
      }
    });

    // Zoom Buttons
    const zoomBtns = document.querySelectorAll('#gantt-zoom-controls .btn-gantt-zoom');
    zoomBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        zoomBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.zoom = btn.getAttribute('data-zoom');
        this.render();
      });
    });

    // Toggle Inputs Sidebar Button
    const toggleInputsBtn = document.getElementById('gantt-btn-toggle-inputs');
    if (toggleInputsBtn) {
      toggleInputsBtn.addEventListener('click', () => {
        this.showTaskInputs = !this.showTaskInputs;
        const sidebar = document.getElementById('gantt-task-sidebar');
        if (sidebar) {
          if (this.showTaskInputs) {
            sidebar.classList.remove('collapsed');
          } else {
            sidebar.classList.add('collapsed');
          }
        }
        // Small delay to allow sidebar width transition before drawing SVG arrows
        setTimeout(() => this.renderTimelineOnly(), 260);
      });
    }

    // Add Task Project Button
    const addProjectBtn = document.getElementById('gantt-btn-add-project');
    if (addProjectBtn) {
      addProjectBtn.addEventListener('click', () => {
        this.addDummyProject();
      });
    }

    // Export Button
    const exportBtn = document.getElementById('gantt-btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportGanttAsImage();
      });
    }
  },

  /**
   * Dynamically adds a new project so the user can see realtime creations
   */
  addDummyProject() {
    const codeNum = this.projects.length + 1;
    const newId = `PRJ${String(codeNum).padStart(3, '0')}`;
    const newProject = {
      id: newId,
      name: `New Project Task ${codeNum}`,
      client: 'AeroSpace Inc.',
      manager: 'John Doe',
      developer: 'Bob Johnson',
      qa: 'David Miller',
      ba: 'Sarah Connor',
      progress: 30,
      budget: 85000,
      status: 'in-progress',
      estimatedStart: '2026-07-15',
      estimatedEnd: '2026-08-10',
      actualStart: '2026-07-16',
      actualEnd: '',
      remarks: 'Injected via Interactive Gantt Workspace',
      dependency: 'None',
      sprint: 'Sprint 43',
      risk: 'Medium'
    };

    this.projects.push(newProject);
    this.saveAndSync();
    this.populateFilterOptions();
    this.app.showToast(`Injected task ${newId} into Interactive Gantt!`, 'success');
    this.render();
  },

  /**
   * Filters the projects based on the current dropdown filters
   */
  getFilteredProjects() {
    return this.projects.filter(p => {
      // Customer Filter
      if (this.filters.customer !== 'all' && p.client !== this.filters.customer) {
        return false;
      }
      
      // Developer Filter
      if (this.filters.resource !== 'all') {
        if (p.developer !== this.filters.resource) return false;
      }

      // Project Filter
      if (this.filters.project !== 'all' && p.id !== this.filters.project) {
        return false;
      }

      // Skip archived
      if (p.status === 'archived') {
        return false;
      }

      return true;
    });
  },

  /**
   * Calculates Critical Path projects.
   * Defined as projects with high risks, delayed timelines, or chained dependencies.
   */
  calculateCriticalPath() {
    const criticalSet = new Set();
    
    // 1. Identify delayed projects (start/end in past but progress < 100) or High Risk
    this.projects.forEach(p => {
      const endD = new Date(p.estimatedEnd);
      if (p.risk === 'Critical' || p.risk === 'High') {
        criticalSet.add(p.id);
      }
      if (p.progress < 100 && endD < this.todayDate) {
        criticalSet.add(p.id);
      }
    });

    // 2. Identify dependency chain root and nodes
    const adjList = {};
    const inDegree = {};
    
    this.projects.forEach(p => {
      adjList[p.id] = [];
      inDegree[p.id] = 0;
    });

    this.projects.forEach(p => {
      if (p.dependency && p.dependency !== 'None' && adjList[p.dependency]) {
        adjList[p.dependency].push(p.id);
        inDegree[p.id]++;
      }
    });

    // Calculate maximum depth path of dependencies
    const memoDurations = {};
    
    const getDuration = (id) => {
      const p = this.projects.find(proj => proj.id === id);
      if (!p) return 0;
      const start = new Date(p.estimatedStart);
      const end = new Date(p.estimatedEnd);
      return Math.max(1, Math.ceil((end - start) / (1000 * 3600 * 24)));
    };

    const findLongestPath = (u) => {
      if (memoDurations[u] !== undefined) return memoDurations[u];
      
      let maxSubPath = 0;
      let bestNext = null;
      
      adjList[u].forEach(v => {
        const d = findLongestPath(v);
        if (d > maxSubPath) {
          maxSubPath = d;
          bestNext = v;
        }
      });
      
      const selfDur = getDuration(u);
      memoDurations[u] = selfDur + maxSubPath;
      return memoDurations[u];
    };

    // Find overall longest chain roots
    let maxPathValue = 0;
    let criticalChain = [];

    this.projects.forEach(p => {
      if (inDegree[p.id] === 0) {
        const chainVal = findLongestPath(p.id);
        if (chainVal > maxPathValue) {
          maxPathValue = chainVal;
        }
      }
    });

    // Traverse to build critical chain
    this.projects.forEach(p => {
      if (inDegree[p.id] === 0) {
        const val = findLongestPath(p.id);
        if (val === maxPathValue && maxPathValue > 5) { // If it's a significant chain
          let curr = p.id;
          while (curr) {
            criticalChain.push(curr);
            let bestNext = null;
            let maxSub = -1;
            (adjList[curr] || []).forEach(v => {
              if (memoDurations[v] > maxSub) {
                maxSub = memoDurations[v];
                bestNext = v;
              }
            });
            curr = bestNext;
          }
        }
      }
    });

    criticalChain.forEach(id => criticalSet.add(id));

    return criticalSet;
  },

  /**
   * Main Render Coordinator
   */
  render() {
    const visibleProjects = this.getFilteredProjects();
    this.renderLeftSidebar(visibleProjects);
    this.renderTimelineOnly(visibleProjects);
  },

  /**
   * Renders the left task grid panel with inline inputs
   */
  renderLeftSidebar(visibleProjects) {
    const listContainer = document.getElementById('gantt-sidebar-tasks-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const criticalPathSet = this.calculateCriticalPath();

    if (visibleProjects.length === 0) {
      listContainer.innerHTML = `
        <div class="p-4 text-center text-muted text-xs font-semibold">
          No projects match the current filter selection layers.
        </div>
      `;
      return;
    }

    // Render each item
    visibleProjects.forEach((p) => {
      const isCritical = criticalPathSet.has(p.id);
      const itemDiv = document.createElement('div');
      itemDiv.className = `gantt-sidebar-item ${isCritical ? 'critical-item' : 'normal-item'}`;
      
      // Generate dependency options list
      const depOptions = this.projects
        .filter(proj => proj.id !== p.id && proj.status !== 'archived')
        .map(proj => `<option value="${proj.id}" ${p.dependency === proj.id ? 'selected' : ''}>${proj.id} (${proj.name.substring(0, 12)}...)</option>`)
        .join('');

      itemDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-1.5">
          <div>
            <span class="badge ${isCritical ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary'} font-bold me-1 text-xs">${p.id}</span>
            <span class="font-bold text-xs" style="color: var(--text-primary);">${p.name}</span>
          </div>
          <span class="text-muted text-xxs font-bold" style="font-size: 0.65rem;">${p.client}</span>
        </div>
        
        <div class="row g-1.5 align-items-center mt-1">
          <!-- Dates Row -->
          <div class="col-6">
            <span class="d-block text-xxs text-secondary uppercase font-semibold">Est. Start</span>
            <input type="date" class="form-control gantt-sidebar-input w-100" data-field="estimatedStart" data-id="${p.id}" value="${p.estimatedStart || ''}">
          </div>
          <div class="col-6">
            <span class="d-block text-xxs text-secondary uppercase font-semibold">Est. End</span>
            <input type="date" class="form-control gantt-sidebar-input w-100" data-field="estimatedEnd" data-id="${p.id}" value="${p.estimatedEnd || ''}">
          </div>

          <!-- Dependency and progress slider -->
          <div class="col-6 mt-1.5">
            <span class="d-block text-xxs text-secondary uppercase font-semibold">Dependency</span>
            <select class="form-select gantt-sidebar-input w-100" data-field="dependency" data-id="${p.id}">
              <option value="None" ${p.dependency === 'None' ? 'selected' : ''}>None (No block)</option>
              ${depOptions}
            </select>
          </div>
          <div class="col-6 mt-1.5">
            <div class="d-flex justify-content-between align-items-center mb-0.5">
              <span class="text-xxs text-secondary uppercase font-semibold">Progress</span>
              <span class="font-bold text-xxs text-primary" id="gantt-prog-label-${p.id}">${p.progress}%</span>
            </div>
            <input type="range" class="form-range w-100" data-id="${p.id}" style="height: 14px;" min="0" max="100" value="${p.progress}">
          </div>
        </div>
      `;

      listContainer.appendChild(itemDiv);
    });

    // Attach listeners on inputs inside left sidebar
    const dateInputs = listContainer.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const field = e.target.getAttribute('data-field');
        const projId = e.target.getAttribute('data-id');
        const val = e.target.value;
        this.updateProjectField(projId, field, val);
      });
    });

    const depSelects = listContainer.querySelectorAll('select[data-field="dependency"]');
    depSelects.forEach(select => {
      select.addEventListener('change', (e) => {
        const projId = e.target.getAttribute('data-id');
        const val = e.target.value;
        this.updateProjectField(projId, 'dependency', val);
      });
    });

    const sliders = listContainer.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const projId = e.target.getAttribute('data-id');
        const val = parseInt(e.target.value, 10);
        document.getElementById(`gantt-prog-label-${projId}`).textContent = `${val}%`;
      });

      slider.addEventListener('change', (e) => {
        const projId = e.target.getAttribute('data-id');
        const val = parseInt(e.target.value, 10);
        this.updateProjectField(projId, 'progress', val);
      });
    });
  },

  /**
   * Updates a single project field, saves, and re-renders
   */
  updateProjectField(id, field, value) {
    const proj = this.projects.find(p => p.id === id);
    if (!proj) return;
    
    proj[field] = value;
    
    // Auto-update months/quarters/years if estimatedStart changed
    if (field === 'estimatedStart' && value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        proj.month = d.toLocaleString('default', { month: 'long' });
        const m = d.getMonth();
        let q = 'Q1';
        if (m >= 3 && m <= 5) q = 'Q2';
        else if (m >= 6 && m <= 8) q = 'Q3';
        else if (m >= 9 && m <= 11) q = 'Q4';
        proj.quarter = q;
        proj.year = String(d.getFullYear());
      }
    }

    this.saveAndSync();
    
    // Quick render timeline only to feel snappy
    this.renderTimelineOnly();
  },

  /**
   * Renders the horizontal time-axis grid, bars, milestones, overlay SVG, and vertical today lines
   */
  renderTimelineOnly(visibleProjects) {
    if (!visibleProjects) {
      visibleProjects = this.getFilteredProjects();
    }
    
    const canvasContainer = document.getElementById('gantt-canvas-container');
    const pane = document.getElementById('gantt-timeline-pane');
    if (!canvasContainer || !pane) return;

    // Clear previous timeline structures
    canvasContainer.innerHTML = '';

    if (visibleProjects.length === 0) {
      canvasContainer.style.height = '150px';
      canvasContainer.innerHTML = `
        <div class="h-100 d-flex justify-content-center align-items-center text-muted font-bold text-xs">
          Select filters to visualize.
        </div>
      `;
      return;
    }

    // 1. Calculate the dynamic date range bounds
    let minDate = new Date(this.todayDate);
    minDate.setDate(minDate.getDate() - 30); // Default paddings
    let maxDate = new Date(this.todayDate);
    maxDate.setDate(maxDate.getDate() + 45);

    // Scan projects dates to encompass all visible timelines
    let projectsDatesList = [];
    visibleProjects.forEach(p => {
      if (p.estimatedStart) projectsDatesList.push(new Date(p.estimatedStart));
      if (p.estimatedEnd) projectsDatesList.push(new Date(p.estimatedEnd));
      if (p.actualStart) projectsDatesList.push(new Date(p.actualStart));
      if (p.actualEnd) projectsDatesList.push(new Date(p.actualEnd));
    });

    if (projectsDatesList.length > 0) {
      const sortedDates = projectsDatesList.sort((a,b) => a - b);
      minDate = new Date(sortedDates[0]);
      minDate.setDate(minDate.getDate() - 10); // Buffer of 10 days before earliest project
      
      maxDate = new Date(sortedDates[sortedDates.length - 1]);
      maxDate.setDate(maxDate.getDate() + 15); // Buffer of 15 days after latest project
    }

    // Adjust borders for zoom types
    if (this.zoom === 'year') {
      const year = minDate.getFullYear();
      minDate = new Date(`${year}-01-01`);
      maxDate = new Date(`${year}-12-31`);
    } else if (this.zoom === 'quarter') {
      // Show 6 months spanning the center of projects
      const mid = new Date((minDate.getTime() + maxDate.getTime()) / 2);
      const startMonth = Math.max(0, mid.getMonth() - 3);
      minDate = new Date(mid.getFullYear(), startMonth, 1);
      maxDate = new Date(mid.getFullYear(), startMonth + 6, 0);
    } else {
      // Month Zoom: force exactly 2 months starting from earliest start
      const startM = minDate.getMonth();
      const startY = minDate.getFullYear();
      minDate = new Date(startY, startM, 1);
      maxDate = new Date(startY, startM + 2, 0);
    }

    const dayDiff = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 3600 * 24)));
    
    // Determine px per day based on Zoom level
    let pxPerDay = 24; // Month
    if (this.zoom === 'quarter') pxPerDay = 10;
    if (this.zoom === 'year') pxPerDay = 3.8;

    const totalWidth = dayDiff * pxPerDay;
    canvasContainer.style.width = `${totalWidth}px`;
    
    // Dynamic height matching row counts: Header (55px) + visibleProjects.length * RowHeight (90px)
    const rowHeight = 90;
    const headerHeight = 55;
    const totalHeight = headerHeight + (visibleProjects.length * rowHeight);
    canvasContainer.style.height = `${totalHeight}px`;

    // 2. Build the grid headers
    const headerBlock = document.createElement('div');
    headerBlock.className = 'gantt-timeline-header-block';
    headerBlock.style.width = `${totalWidth}px`;
    headerBlock.style.height = `${headerHeight}px`;

    // Draw header columns depending on zoom
    if (this.zoom === 'month') {
      // Column per day
      let curr = new Date(minDate);
      while (curr <= maxDate) {
        const cell = document.createElement('div');
        cell.className = 'gantt-header-cell';
        cell.style.width = `${pxPerDay}px`;
        
        const dayNum = curr.getDate();
        const isWeekend = curr.getDay() === 0 || curr.getDay() === 6;
        
        if (dayNum === 1 || curr.getTime() === minDate.getTime()) {
          // Add month label on top
          const monthName = curr.toLocaleString('default', { month: 'short' });
          cell.innerHTML = `
            <span class="gantt-header-cell-top font-bold text-primary">${monthName}</span>
            <span class="gantt-header-cell-sub text-xxs font-semibold ${isWeekend ? 'text-danger' : ''}">${dayNum}</span>
          `;
        } else {
          cell.innerHTML = `
            <span class="gantt-header-cell-top font-bold">${dayNum}</span>
            <span class="gantt-header-cell-sub text-xxs font-semibold ${isWeekend ? 'text-danger' : ''}">${curr.toLocaleString('default', { weekday: 'narrow' })}</span>
          `;
        }

        if (isWeekend) {
          cell.style.backgroundColor = 'var(--bg-main)';
        }

        headerBlock.appendChild(cell);
        curr.setDate(curr.getDate() + 1);
      }
    } else if (this.zoom === 'quarter') {
      // Column per week (7 days)
      let curr = new Date(minDate);
      while (curr <= maxDate) {
        const cell = document.createElement('div');
        cell.className = 'gantt-header-cell';
        cell.style.width = `${pxPerDay * 7}px`;
        
        // Find week sequence of the year
        const jan1 = new Date(curr.getFullYear(), 0, 1);
        const wkNum = Math.ceil((((curr - jan1) / 86400000) + jan1.getDay() + 1) / 7);
        const monthName = curr.toLocaleString('default', { month: 'short' });

        cell.innerHTML = `
          <span class="gantt-header-cell-top font-bold">${monthName}</span>
          <span class="gantt-header-cell-sub text-xxs font-semibold">W${wkNum} (${curr.getDate()})</span>
        `;
        headerBlock.appendChild(cell);
        curr.setDate(curr.getDate() + 7);
      }
    } else {
      // Year Zoom: Column per month
      let curr = new Date(minDate);
      while (curr <= maxDate) {
        const cell = document.createElement('div');
        cell.className = 'gantt-header-cell';
        
        // Find next month's span
        const nextMonth = new Date(curr.getFullYear(), curr.getMonth() + 1, 1);
        const spanDays = Math.ceil((nextMonth - curr) / 86400000);
        cell.style.width = `${pxPerDay * spanDays}px`;
        
        const monthName = curr.toLocaleString('default', { month: 'long' });

        cell.innerHTML = `
          <span class="gantt-header-cell-top font-bold text-primary-custom" style="font-size: 0.8rem;">${monthName}</span>
          <span class="gantt-header-cell-sub font-semibold">${curr.getFullYear()}</span>
        `;
        headerBlock.appendChild(cell);
        curr = nextMonth;
      }
    }

    canvasContainer.appendChild(headerBlock);

    // 3. Render vertical column grids & rows
    const criticalPathSet = this.calculateCriticalPath();
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'position-relative';
    rowsContainer.style.width = `${totalWidth}px`;
    rowsContainer.style.height = `${visibleProjects.length * rowHeight}px`;

    // Map to store horizontal bounds of bars for SVG connector arrows mapping
    const barCoordinatesMap = {};

    visibleProjects.forEach((p, idx) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'gantt-timeline-row';
      rowDiv.style.width = `${totalWidth}px`;
      rowDiv.style.height = `${rowHeight}px`;

      // Draw background vertical column slices
      if (this.zoom === 'month') {
        let curr = new Date(minDate);
        while (curr <= maxDate) {
          const gridCol = document.createElement('div');
          gridCol.className = 'gantt-grid-col';
          gridCol.style.width = `${pxPerDay}px`;
          
          const isWeekend = curr.getDay() === 0 || curr.getDay() === 6;
          if (isWeekend) {
            gridCol.style.backgroundColor = 'var(--bg-main)';
            gridCol.style.opacity = '0.4';
          }
          rowDiv.appendChild(gridCol);
          curr.setDate(curr.getDate() + 1);
        }
      } else if (this.zoom === 'quarter') {
        let curr = new Date(minDate);
        while (curr <= maxDate) {
          const gridCol = document.createElement('div');
          gridCol.className = 'gantt-grid-col';
          gridCol.style.width = `${pxPerDay * 7}px`;
          rowDiv.appendChild(gridCol);
          curr.setDate(curr.getDate() + 7);
        }
      } else {
        let curr = new Date(minDate);
        while (curr <= maxDate) {
          const nextMonth = new Date(curr.getFullYear(), curr.getMonth() + 1, 1);
          const spanDays = Math.ceil((nextMonth - curr) / 86400000);
          const gridCol = document.createElement('div');
          gridCol.className = 'gantt-grid-col';
          gridCol.style.width = `${pxPerDay * spanDays}px`;
          rowDiv.appendChild(gridCol);
          curr = nextMonth;
        }
      }

      // Plottings
      const isCritical = criticalPathSet.has(p.id);
      let coord = { id: p.id, estStart: null, estEnd: null, rowY: idx * rowHeight + headerHeight };

      // LAYER: Estimated Bar Plottings
      if (this.layers.estimated && p.estimatedStart && p.estimatedEnd) {
        const estStartD = new Date(p.estimatedStart);
        const estEndD = new Date(p.estimatedEnd);

        if (estEndD >= minDate && estStartD <= maxDate) {
          const startPx = Math.max(0, ((estStartD - minDate) / 86400000) * pxPerDay);
          const endPx = Math.min(totalWidth, ((estEndD - minDate) / 86400000) * pxPerDay);
          const barW = Math.max(8, endPx - startPx);

          coord.estStart = startPx;
          coord.estEnd = endPx;

          const barEst = document.createElement('div');
          barEst.className = `gantt-bar-est ${isCritical && this.layers.critical ? 'gantt-bar-critical' : ''}`;
          barEst.style.left = `${startPx}px`;
          barEst.style.width = `${barW}px`;
          
          // Inject progress fill in Estimated Bar if selected
          if (this.layers.progress && p.progress !== undefined) {
            const fill = document.createElement('div');
            fill.className = 'gantt-bar-progress-fill';
            fill.style.width = `${p.progress}%`;
            barEst.appendChild(fill);
          }

          barEst.innerHTML += `<span>${p.id}: ${p.name} (${p.progress}%)</span>`;
          
          // Tooltip mapping
          this.attachTooltip(barEst, p, 'Estimated Timeline');

          rowDiv.appendChild(barEst);
        }
      }

      // LAYER: Actual Bar Plottings
      if (this.layers.actual && p.actualStart) {
        const actStartD = new Date(p.actualStart);
        const actEndD = p.actualEnd ? new Date(p.actualEnd) : new Date(this.todayDate);

        if (actEndD >= minDate && actStartD <= maxDate) {
          const startPx = Math.max(0, ((actStartD - minDate) / 86400000) * pxPerDay);
          const endPx = Math.min(totalWidth, ((actEndD - minDate) / 86400000) * pxPerDay);
          const barW = Math.max(8, endPx - startPx);

          const barAct = document.createElement('div');
          barAct.className = 'gantt-bar-act';
          barAct.style.left = `${startPx}px`;
          barAct.style.width = `${barW}px`;

          if (this.layers.progress && p.progress !== undefined) {
            const fill = document.createElement('div');
            fill.className = 'gantt-bar-progress-fill';
            fill.style.width = `${p.progress}%`;
            barAct.appendChild(fill);
          }

          const labelEnd = p.actualEnd ? `Delivered` : `Active`;
          barAct.innerHTML += `<span style="font-style: italic;"><i class="fa-solid fa-circle-play text-success font-xxs"></i> Actuals (${labelEnd})</span>`;

          this.attachTooltip(barAct, p, 'Actual Delivery Range');

          rowDiv.appendChild(barAct);
        }
      }

      // LAYER: Milestones (Diamonds plotting at the estimated end marker date)
      if (this.layers.milestones && p.estimatedEnd) {
        const mDate = new Date(p.estimatedEnd);
        if (mDate >= minDate && mDate <= maxDate) {
          const mPx = ((mDate - minDate) / 86400000) * pxPerDay;
          const diamond = document.createElement('div');
          diamond.className = 'gantt-milestone-indicator';
          diamond.style.left = `${mPx - 7}px`; // center diamond on pixel offset
          
          this.attachMilestoneTooltip(diamond, p);
          rowDiv.appendChild(diamond);
        }
      }

      barCoordinatesMap[p.id] = coord;
      rowsContainer.appendChild(rowDiv);
    });

    canvasContainer.appendChild(rowsContainer);

    // LAYER: Today vertical red line plotting
    if (this.layers.today && this.todayDate >= minDate && this.todayDate <= maxDate) {
      const todayPx = ((this.todayDate - minDate) / 86400000) * pxPerDay;
      
      const line = document.createElement('div');
      line.className = 'gantt-today-line';
      line.style.left = `${todayPx}px`;
      canvasContainer.appendChild(line);

      const badge = document.createElement('div');
      badge.className = 'gantt-today-badge';
      badge.style.left = `${todayPx}px`;
      badge.textContent = 'TODAY (JUL 28, 2026)';
      canvasContainer.appendChild(badge);
    }

    // LAYER: SVG Connector Arcs drawing
    if (this.layers.dependencies) {
      this.drawDependencyLines(canvasContainer, visibleProjects, barCoordinatesMap, criticalPathSet);
    }

    // Auto-scroll timeline to focus near the Today line for standard Month zoom
    if (this.zoom === 'month' && this.todayDate >= minDate && this.todayDate <= maxDate) {
      const todayPx = ((this.todayDate - minDate) / 86400000) * pxPerDay;
      pane.scrollLeft = todayPx - 300;
    }
  },

  /**
   * Draws right-angled SVG line paths connecting dependencies
   */
  drawDependencyLines(container, visibleProjects, coordsMap, criticalSet) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'gantt-svg-overlay');
    svg.style.width = container.style.width;
    svg.style.height = container.style.height;

    // Define Arrow markers
    svg.innerHTML = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" class="gantt-dependency-arrow" />
        </marker>
        <marker id="critical-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" class="gantt-dependency-arrow critical-arrow" />
        </marker>
      </defs>
    `;

    visibleProjects.forEach((p) => {
      if (p.dependency && p.dependency !== 'None') {
        const parentCoord = coordsMap[p.dependency];
        const childCoord = coordsMap[p.id];

        // Draw line only if both parent and child rows are visible and estimated bars are mapped
        if (parentCoord && childCoord && parentCoord.estEnd !== null && childCoord.estStart !== null) {
          const isCritChain = criticalSet.has(p.id) && criticalSet.has(p.dependency);
          
          // Coordinates mapping
          // Parent ends on rowY + 27px, Child starts on rowY + 27px
          const x1 = parentCoord.estEnd;
          const y1 = parentCoord.rowY + 27;
          const x2 = childCoord.estStart;
          const y2 = childCoord.rowY + 27;

          // Compute right-angled path d coordinates
          // Offset outwards slightly to avoid overlaying direct cells
          const midX = x1 + (x2 - x1) / 2;
          
          let dPath = '';
          if (x2 > x1) {
            // Rightwards normal dependency gap step path
            dPath = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
          } else {
            // Overlapping backwards link route detour path
            const detourY = y1 + (y2 - y1) / 2 + 10;
            dPath = `M ${x1} ${y1} L ${x1 + 15} ${y1} L ${x1 + 15} ${detourY} L ${x2 - 15} ${detourY} L ${x2 - 15} ${y2} L ${x2} ${y2}`;
          }

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', dPath);
          path.setAttribute('class', `gantt-dependency-line ${isCritChain ? 'critical-dep' : ''}`);
          path.setAttribute('marker-end', isCritChain ? 'url(#critical-arrow)' : 'url(#arrow)');
          
          svg.appendChild(path);
        }
      }
    });

    container.appendChild(svg);
  },

  /**
   * Attaches details hover tooltip for project bars
   */
  attachTooltip(element, proj, layerName) {
    element.addEventListener('mouseenter', (e) => {
      const tooltip = document.createElement('div');
      tooltip.className = 'gantt-tooltip';
      
      const riskBadge = proj.risk === 'High' || proj.risk === 'Critical' 
        ? `<span class="badge bg-danger text-white ml-2">${proj.risk}</span>` 
        : `<span class="badge bg-secondary text-white ml-2">${proj.risk}</span>`;

      tooltip.innerHTML = `
        <div class="border-bottom pb-1.5 mb-1.5">
          <strong style="font-size: 0.8rem; color: #38bdf8;">${proj.id}: ${proj.name}</strong>
        </div>
        <div class="mb-1"><strong>Client:</strong> ${proj.client}</div>
        <div class="mb-1"><strong>PM:</strong> ${proj.manager} | <strong>Dev:</strong> ${proj.developer}</div>
        <div class="mb-1"><strong>Est. Range:</strong> ${proj.estimatedStart} to ${proj.estimatedEnd}</div>
        <div class="mb-1"><strong>Progress:</strong> ${proj.progress}% ${riskBadge}</div>
        <div class="mb-1"><strong>Dependency:</strong> ${proj.dependency || 'None'}</div>
        <div class="text-xxs text-info font-bold mt-1.5 border-top pt-1 text-uppercase">${layerName} Layer</div>
      `;

      document.body.appendChild(tooltip);
      element._tooltip = tooltip;
      
      // Initial positioning
      this.positionTooltip(e, tooltip);
    });

    element.addEventListener('mousemove', (e) => {
      if (element._tooltip) {
        this.positionTooltip(e, element._tooltip);
      }
    });

    element.addEventListener('mouseleave', () => {
      if (element._tooltip) {
        element._tooltip.remove();
        element._tooltip = null;
      }
    });
  },

  /**
   * Attaches specific Orange Milestone hover details tooltip
   */
  attachMilestoneTooltip(element, proj) {
    element.addEventListener('mouseenter', (e) => {
      const tooltip = document.createElement('div');
      tooltip.className = 'gantt-tooltip';
      tooltip.innerHTML = `
        <div class="border-bottom pb-1 mb-1 font-bold text-warning">
          <i class="fa-solid fa-diamond text-warning me-1"></i> Client Delivery Milestone
        </div>
        <div><strong>Project:</strong> ${proj.id} - ${proj.name}</div>
        <div><strong>Milestone Target:</strong> ${proj.estimatedEnd}</div>
        <div class="text-xxs text-secondary font-semibold mt-1">Acceptance criteria audit, deployment checklist, and final PM client wrapup approval.</div>
      `;
      document.body.appendChild(tooltip);
      element._tooltip = tooltip;
      this.positionTooltip(e, tooltip);
    });

    element.addEventListener('mousemove', (e) => {
      if (element._tooltip) {
        this.positionTooltip(e, element._tooltip);
      }
    });

    element.addEventListener('mouseleave', () => {
      if (element._tooltip) {
        element._tooltip.remove();
        element._tooltip = null;
      }
    });
  },

  /**
   * Handles tooltip positioning offset
   */
  positionTooltip(e, tooltip) {
    const offset = 15;
    let x = e.clientX + offset;
    let y = e.clientY + offset;

    // Boundary protection so tooltip stays on screen
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) {
      x = e.clientX - rect.width - offset;
    }
    if (y + rect.height > window.innerHeight) {
      y = e.clientY - rect.height - offset;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  },

  /**
   * Generates and downloads the Gantt Chart as an SVG vector or triggers a styled preview print layout
   */
  exportGanttAsImage() {
    const pane = document.getElementById('gantt-canvas-container');
    if (!pane) return;

    // Read timeline dimensions
    const width = pane.offsetWidth;
    const height = pane.offsetHeight;
    
    // Construct inline CSS styles for high-fidelity SVG exports
    const svgStyles = `
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
      .gantt-bar-est { fill: rgba(59, 130, 246, 0.15); stroke: rgba(59, 130, 246, 0.7); stroke-width: 1px; rx: 4px; }
      .gantt-bar-act { fill: rgba(16, 185, 129, 0.15); stroke: rgba(16, 185, 129, 0.7); stroke-width: 1px; rx: 4px; }
      .gantt-bar-critical { stroke: #ef4444; stroke-width: 2px; stroke-dasharray: 4 2; }
      .gantt-bar-progress-fill { fill: rgba(59, 130, 246, 0.35); }
      .gantt-bar-act-fill { fill: rgba(16, 185, 129, 0.35); }
      .gantt-milestone-indicator { fill: #f59e0b; stroke: #ffffff; stroke-width: 2px; }
      .gantt-dependency-line { fill: none; stroke: #64748b; stroke-width: 1.5px; stroke-dasharray: 4 2; opacity: 0.6; }
      .gantt-dependency-line.critical-dep { stroke: #ef4444; stroke-width: 2px; stroke-dasharray: none; opacity: 0.95; }
      .grid-line { stroke: #e2e8f0; stroke-width: 1px; }
      .grid-line-weekend { stroke: #f1f5f9; stroke-width: 1px; }
      .today-line { stroke: #ef4444; stroke-width: 2px; stroke-dasharray: 4 4; }
      .row-divider { stroke: #cbd5e1; stroke-width: 1px; }
    `;

    // Clone overlay elements inside an elegant download wrapper SVG
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    svgContent += `<style>${svgStyles}</style>`;
    
    // Draw background sheet
    svgContent += `<rect width="100%" height="100%" fill="#ffffff" />`;

    // Copy row dividers and grid slices
    const rowCount = this.getFilteredProjects().length;
    const rowHeight = 90;
    const headerHeight = 55;

    // Draw header background
    svgContent += `<rect width="${width}" height="${headerHeight}" fill="#f8fafc" />`;
    svgContent += `<line x1="0" y1="${headerHeight}" x2="${width}" y2="${headerHeight}" stroke="#cbd5e1" stroke-width="2" />`;

    // Draw grid headers text
    const headerCells = document.querySelectorAll('.gantt-header-cell');
    let accumulatedX = 0;
    headerCells.forEach(cell => {
      const cellW = parseFloat(cell.style.width);
      const cellTop = cell.querySelector('.gantt-header-cell-top')?.textContent || '';
      const cellSub = cell.querySelector('.gantt-header-cell-sub')?.textContent || '';

      svgContent += `<text x="${accumulatedX + cellW/2}" y="24" font-size="10" font-weight="bold" fill="#0f172a" text-anchor="middle">${cellTop}</text>`;
      svgContent += `<text x="${accumulatedX + cellW/2}" y="42" font-size="9" fill="#64748b" text-anchor="middle">${cellSub}</text>`;
      svgContent += `<line x1="${accumulatedX + cellW}" y1="0" x2="${accumulatedX + cellW}" y2="${headerHeight}" stroke="#e2e8f0" stroke-width="1" />`;
      accumulatedX += cellW;
    });

    // Draw rows elements
    for (let i = 0; i < rowCount; i++) {
      const y = headerHeight + i * rowHeight;
      svgContent += `<line x1="0" y1="${y + rowHeight}" x2="${width}" y2="${y + rowHeight}" class="row-divider" />`;
    }

    // Capture bars
    const barsEst = pane.querySelectorAll('.gantt-bar-est');
    barsEst.forEach(bar => {
      const x = parseFloat(bar.style.left);
      const w = parseFloat(bar.style.width);
      const label = bar.querySelector('span')?.textContent || '';
      const y = bar.closest('.gantt-timeline-row') 
        ? parseFloat(bar.closest('.gantt-timeline-row').style.height || '90') * 0.15 
        : 15;
      
      const parentRow = bar.closest('.gantt-timeline-row');
      const rows = Array.from(pane.querySelectorAll('.gantt-timeline-row'));
      const rowIdx = rows.indexOf(parentRow);
      const finalY = headerHeight + (rowIdx * rowHeight) + 15;

      const isCrit = bar.classList.contains('gantt-bar-critical');
      const progressFill = bar.querySelector('.gantt-bar-progress-fill');
      const progressW = progressFill ? parseFloat(progressFill.style.width) / 100 * w : 0;

      // Estimated bar fill + outline
      svgContent += `<rect x="${x}" y="${finalY}" width="${w}" height="24" class="gantt-bar-est ${isCrit ? 'gantt-bar-critical' : ''}" />`;
      if (progressW > 0) {
        svgContent += `<rect x="${x}" y="${finalY}" width="${progressW}" height="24" class="gantt-bar-progress-fill" />`;
      }
      svgContent += `<text x="${x + 8}" y="${finalY + 16}" font-size="10" font-weight="bold" fill="#1e3a8a">${label}</text>`;
    });

    const barsAct = pane.querySelectorAll('.gantt-bar-act');
    barsAct.forEach(bar => {
      const x = parseFloat(bar.style.left);
      const w = parseFloat(bar.style.width);
      const parentRow = bar.closest('.gantt-timeline-row');
      const rows = Array.from(pane.querySelectorAll('.gantt-timeline-row'));
      const rowIdx = rows.indexOf(parentRow);
      const finalY = headerHeight + (rowIdx * rowHeight) + 45;

      const progressFill = bar.querySelector('.gantt-bar-progress-fill');
      const progressW = progressFill ? parseFloat(progressFill.style.width) / 100 * w : 0;

      svgContent += `<rect x="${x}" y="${finalY}" width="${w}" height="24" class="gantt-bar-act" />`;
      if (progressW > 0) {
        svgContent += `<rect x="${x}" y="${finalY}" width="${progressW}" height="24" class="gantt-bar-act-fill" />`;
      }
      svgContent += `<text x="${x + 8}" y="${finalY + 16}" font-size="10" font-style="italic" fill="#065f46">Actual timeline duration</text>`;
    });

    // Milestones orange diamonds
    const milestones = pane.querySelectorAll('.gantt-milestone-indicator');
    milestones.forEach(m => {
      const x = parseFloat(m.style.left) + 7; // Center point
      const parentRow = m.closest('.gantt-timeline-row');
      const rows = Array.from(pane.querySelectorAll('.gantt-timeline-row'));
      const rowIdx = rows.indexOf(parentRow);
      const finalY = headerHeight + (rowIdx * rowHeight) + 27; // center row Y

      svgContent += `<polygon points="${x},${finalY - 7} ${x + 7},${finalY} ${x},${finalY + 7} ${x - 7},${finalY}" class="gantt-milestone-indicator" />`;
    });

    // Today marker
    const todayLine = pane.querySelector('.gantt-today-line');
    if (todayLine) {
      const x = parseFloat(todayLine.style.left);
      svgContent += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" class="today-line" />`;
      svgContent += `<rect x="${x - 55}" y="57" width="110" height="18" fill="#ef4444" rx="3" />`;
      svgContent += `<text x="${x}" y="70" font-size="8" font-weight="bold" fill="#ffffff" text-anchor="middle">TODAY (JUL 28, 2026)</text>`;
    }

    // Dependencies lines
    const svgOverlay = pane.querySelector('.gantt-svg-overlay');
    if (svgOverlay) {
      const paths = svgOverlay.querySelectorAll('path');
      paths.forEach(p => {
        const d = p.getAttribute('d');
        const isCrit = p.classList.contains('critical-dep');
        svgContent += `<path d="${d}" class="gantt-dependency-line ${isCrit ? 'critical-dep' : ''}" />`;
      });
    }

    svgContent += `</svg>`;

    // Download file logic
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `Enterprise_Interactive_Gantt_Chart.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    this.app.showToast('Downloaded High-Fidelity Vector Gantt (SVG) successfully', 'success');
  }
};
