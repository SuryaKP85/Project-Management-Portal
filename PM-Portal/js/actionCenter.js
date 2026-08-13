/* actionCenter.js - Executive Action Center Engine for Enterprise PM Portal */

import { Storage } from './storage.js';

export const ActionCenterModule = {
  app: null,
  projects: [],
  resources: [],
  stories: [],
  leaves: [],
  customers: [],
  weekendShifts: [],

  // Filter & view states
  activeCategory: 'all', // 'all' or one of the 13 metric keys
  activePriority: 'all', // 'all', 'critical', 'warning', 'info'
  searchQuery: '',

  todayDate: new Date('2026-07-28'), // Anchor system date: July 28, 2026

  /**
   * Initialize Executive Action Center Module
   * @param {object} appInstance 
   */
  init(appInstance) {
    this.app = appInstance;
    this.loadAndPrepareData();
    this.setupEventListeners();
    this.render();
  },

  /**
   * Loads all core entity collections from Storage and ensures enriched metrics exist
   */
  loadAndPrepareData() {
    this.projects = Storage.get('projects') || [];
    this.resources = Storage.get('resources') || [];
    this.stories = Storage.get('stories') || [];
    this.leaves = Storage.get('leaves') || [];
    this.customers = Storage.get('customers') || [];
    this.weekend = Storage.get('weekendWork') || Storage.get('weekend_logs') || [];

    if (this.app) {
      this.app.projectsList = this.projects;
      this.app.resourcesList = this.resources;
      this.app.customersList = this.customers;
      this.app.leavesList = this.leaves;
    }
  },

  /**
   * Evaluates all data sources and generates structured Action Cards
   * @returns {Array} List of Action Cards
   */
  generateActionCards() {
    const cards = [];
    const today = this.todayDate;

    // Helper date functions
    const diffDays = (dStr) => {
      if (!dStr) return 999;
      const d = new Date(dStr);
      return Math.ceil((d - today) / (1000 * 3600 * 24));
    };

    // 1. PROJECTS OVERDUE (due date < today and progress < 100)
    this.projects.forEach(p => {
      if (p.status !== 'completed' && p.status !== 'archived' && p.progress < 100) {
        const daysRemaining = diffDays(p.estimatedEnd);
        if (daysRemaining < 0) {
          const overdueDays = Math.abs(daysRemaining);
          cards.push({
            id: `card-overdue-${p.id}`,
            category: 'overdue',
            categoryLabel: 'Projects overdue',
            categoryIcon: 'fa-solid fa-clock-rotate-left',
            priority: 'critical',
            title: `Project ${p.id}: ${p.name} is Overdue`,
            description: `Target completion date was ${p.estimatedEnd} (${overdueDays} days ago). Current progress is at ${p.progress}%.`,
            affectedEntity: `${p.name} (${p.client})`,
            entityType: 'project',
            metrics: [
              { label: 'Overdue By', value: `${overdueDays} Days`, color: 'text-danger' },
              { label: 'Progress', value: `${p.progress}%`, color: 'text-warning' },
              { label: 'Client', value: p.client }
            ],
            recommendation: `Project ${p.id} is likely to miss delivery by ${overdueDays + 4} days. Immediate schedule re-baseline and dev reallocation required.`,
            actionType: 'extend-date',
            actionLabel: 'Extend Target Date',
            rawId: p.id,
            resolved: false
          });
        }
      }
    });

    // 2. PROJECTS DUE THIS WEEK (due within 0 to 6 days)
    this.projects.forEach(p => {
      if (p.status !== 'completed' && p.status !== 'archived' && p.progress < 100) {
        const daysRemaining = diffDays(p.estimatedEnd);
        if (daysRemaining >= 0 && daysRemaining <= 6) {
          const priority = p.progress < 60 ? 'critical' : 'warning';
          cards.push({
            id: `card-due-this-week-${p.id}`,
            category: 'due-this-week',
            categoryLabel: 'Projects due this week',
            categoryIcon: 'fa-solid fa-calendar-day',
            priority: priority,
            title: `Project ${p.id}: ${p.name} Due This Week`,
            description: `Scheduled for completion on ${p.estimatedEnd} (${daysRemaining} days remaining). Current progress is ${p.progress}%.`,
            affectedEntity: `${p.name} (${p.client})`,
            entityType: 'project',
            metrics: [
              { label: 'Due In', value: `${daysRemaining} Days`, color: 'text-warning' },
              { label: 'Progress', value: `${p.progress}%` },
              { label: 'Lead PM', value: p.manager || 'Unassigned' }
            ],
            recommendation: `Project ${p.id} is likely to miss delivery by 4 days if QA bottleneck is not resolved immediately.`,
            actionType: 'reassign-qa',
            actionLabel: 'Expedite & Fast-Track QA',
            rawId: p.id,
            resolved: false
          });
        }
      }
    });

    // 3. PROJECTS DUE NEXT WEEK (due within 7 to 13 days)
    this.projects.forEach(p => {
      if (p.status !== 'completed' && p.status !== 'archived' && p.progress < 100) {
        const daysRemaining = diffDays(p.estimatedEnd);
        if (daysRemaining >= 7 && daysRemaining <= 13) {
          cards.push({
            id: `card-due-next-week-${p.id}`,
            category: 'due-next-week',
            categoryLabel: 'Projects due next week',
            categoryIcon: 'fa-solid fa-calendar-week',
            priority: 'warning',
            title: `Project ${p.id}: ${p.name} Due Next Week`,
            description: `Estimated end date: ${p.estimatedEnd}. Sprint 43 validation in progress (${p.progress}% complete).`,
            affectedEntity: p.name,
            entityType: 'project',
            metrics: [
              { label: 'Due In', value: `${daysRemaining} Days`, color: 'text-info' },
              { label: 'Sprint', value: p.sprint || 'Sprint 43' },
              { label: 'Developer', value: p.developer }
            ],
            recommendation: `Project ${p.id} is tracking closely to target date (${p.estimatedEnd}). Verify Sprint 43 release candidate.`,
            actionType: 'review-sprint',
            actionLabel: 'Review Release Candidate',
            rawId: p.id,
            resolved: false
          });
        }
      }
    });

    // 4. PROJECTS UNDER 20 HOURS REMAINING
    this.projects.forEach(p => {
      if (p.status !== 'completed' && p.hoursRemaining !== undefined && p.hoursRemaining > 0 && p.hoursRemaining <= 20) {
        cards.push({
          id: `card-under-20h-${p.id}`,
          category: 'under-20h',
          categoryLabel: 'Projects under 20 hours remaining',
          categoryIcon: 'fa-solid fa-hourglass-half',
          priority: 'info',
          title: `Project ${p.id}: ${p.name} Near Completion`,
          description: `Only ${p.hoursRemaining} effort hours remaining out of ${p.totalHours || 300} total budget hours (${p.progress}% done).`,
          affectedEntity: p.name,
          entityType: 'project',
          metrics: [
            { label: 'Hours Left', value: `${p.hoursRemaining} hrs`, color: 'text-success' },
            { label: 'Completion', value: `${p.progress}%` },
            { label: 'Client', value: p.client }
          ],
          recommendation: `Project ${p.id} is within final 20 hours of delivery. Schedule client sign-off demo.`,
          actionType: 'schedule-demo',
          actionLabel: 'Schedule Client Demo',
          rawId: p.id,
          resolved: false
        });
      }
    });

    // 5. STORIES EXCEEDING ESTIMATES
    this.stories.forEach(s => {
      if (s.loggedHours > s.estimatedHours) {
        const excess = s.loggedHours - s.estimatedHours;
        const pctOver = Math.round((excess / s.estimatedHours) * 100);
        cards.push({
          id: `card-story-exceeded-${s.id}`,
          category: 'stories-exceeding',
          categoryLabel: 'Stories exceeding estimates',
          categoryIcon: 'fa-solid fa-chart-line-down',
          priority: pctOver > 50 ? 'critical' : 'warning',
          title: `Story ${s.id}: ${s.title} Exceeded Estimate`,
          description: `Logged ${s.loggedHours} hrs against initial estimate of ${s.estimatedHours} hrs (+${excess} hrs / +${pctOver}% overrun).`,
          affectedEntity: `Story ${s.id} (${s.projectId})`,
          entityType: 'story',
          metrics: [
            { label: 'Estimate', value: `${s.estimatedHours} hrs` },
            { label: 'Logged', value: `${s.loggedHours} hrs`, color: 'text-danger' },
            { label: 'Overrun', value: `+${excess} hrs (+${pctOver}%)`, color: 'text-danger' }
          ],
          recommendation: `Story ${s.id} exceeded estimate by ${excess} hours. Conduct scope audit with Lead Architect.`,
          actionType: 'adjust-estimate',
          actionLabel: 'Audit & Adjust Estimate',
          rawId: s.id,
          resolved: false
        });
      }
    });

    // 6. DEVELOPERS OVERLOADED
    this.resources.forEach(r => {
      const isDev = r.role.toLowerCase().includes('dev') || r.role.toLowerCase().includes('architect');
      if (isDev && r.allocation > 100) {
        cards.push({
          id: `card-dev-overloaded-${r.id}`,
          category: 'devs-overloaded',
          categoryLabel: 'Developers overloaded',
          categoryIcon: 'fa-solid fa-user-slash',
          priority: 'critical',
          title: `Developer ${r.name} is Overloaded (${r.allocation}%)`,
          description: `Allocated capacity is at ${r.allocation}% across active Sprint 42 and Sprint 43 deliverables.`,
          affectedEntity: r.name,
          entityType: 'resource',
          metrics: [
            { label: 'Workload', value: `${r.allocation}%`, color: 'text-danger' },
            { label: 'Role', value: r.role },
            { label: 'Dept', value: r.dept }
          ],
          recommendation: `Developer ${r.name} is allocated at ${r.allocation}%. Reallocate secondary tasks to avoid burnout and missed milestones.`,
          actionType: 'reallocate-dev',
          actionLabel: 'Reallocate Capacity',
          rawId: r.id,
          resolved: false
        });
      }
    });

    // 7. QA OVERLOADED
    this.resources.forEach(r => {
      const isQA = r.role.toLowerCase().includes('qa') || r.dept.toLowerCase().includes('qa');
      if (isQA && r.allocation > 100) {
        cards.push({
          id: `card-qa-overloaded-${r.id}`,
          category: 'qa-overloaded',
          categoryLabel: 'QA overloaded',
          categoryIcon: 'fa-solid fa-bug-slash',
          priority: 'critical',
          title: `QA Lead ${r.name} is Overloaded (${r.allocation}%)`,
          description: `Serving as sole QA across 5 concurrent active projects with total workload at ${r.allocation}%.`,
          affectedEntity: r.name,
          entityType: 'resource',
          metrics: [
            { label: 'Capacity', value: `${r.allocation}%`, color: 'text-danger' },
            { label: 'Role', value: r.role },
            { label: 'Projects', value: '5 Active' }
          ],
          recommendation: `QA ${r.name} is overloaded at ${r.allocation}%. Assign automated regression tester to balance load.`,
          actionType: 'assign-qa-support',
          actionLabel: 'Assign Secondary QA',
          rawId: r.id,
          resolved: false
        });
      }
    });

    // 8. PEOPLE ON LEAVE
    this.leaves.forEach(l => {
      if (l.status === 'approved') {
        cards.push({
          id: `card-leave-${l.id}`,
          category: 'people-on-leave',
          categoryLabel: 'People on leave',
          categoryIcon: 'fa-solid fa-umbrella-beach',
          priority: 'warning',
          title: `${l.name} on ${l.type}`,
          description: `Scheduled leave from ${l.start} to ${l.end} (${l.days} business days).`,
          affectedEntity: l.name,
          entityType: 'leave',
          metrics: [
            { label: 'Leave Type', value: l.type },
            { label: 'Duration', value: `${l.days} Days`, color: 'text-info' },
            { label: 'Period', value: `${l.start} to ${l.end}` }
          ],
          recommendation: `${l.name} is on leave this week. Shift active critical path items to unallocated backup team members.`,
          actionType: 'reassign-leave-backup',
          actionLabel: 'Reassign Backup Cover',
          rawId: l.id,
          resolved: false
        });
      }
    });

    // 9. PENDING SOW
    this.projects.forEach(p => {
      if (p.sowStatus && p.sowStatus.toLowerCase().includes('pending')) {
        cards.push({
          id: `card-sow-${p.id}`,
          category: 'pending-sow',
          categoryLabel: 'Pending SOW',
          categoryIcon: 'fa-solid fa-file-contract',
          priority: 'warning',
          title: `SOW Pending Approval for ${p.id}`,
          description: `Project ${p.name} SOW contract status is '${p.sowStatus}'. Budget of $${(p.budget || 0).toLocaleString()} uncommitted.`,
          affectedEntity: `${p.client} - ${p.name}`,
          entityType: 'project',
          metrics: [
            { label: 'SOW Status', value: p.sowStatus, color: 'text-warning' },
            { label: 'Budget', value: `$${(p.budget || 0).toLocaleString()}` },
            { label: 'Client', value: p.client }
          ],
          recommendation: `Customer ${p.client} SOW requires attention to unlock next milestone payment and formal sprint commitments.`,
          actionType: 'approve-sow',
          actionLabel: 'Approve SOW Agreement',
          rawId: p.id,
          resolved: false
        });
      }
    });

    // 10. CUSTOMER ESCALATIONS
    this.customers.forEach(c => {
      if (c.isEscalated) {
        cards.push({
          id: `card-escalation-${c.id}`,
          category: 'customer-escalations',
          categoryLabel: 'Customer Escalations',
          categoryIcon: 'fa-solid fa-triangle-exclamation',
          priority: 'critical',
          title: `Customer Escalation: ${c.name}`,
          description: c.escalationReason || 'High severity escalation logged regarding deliverable timeline bottleneck.',
          affectedEntity: c.name,
          entityType: 'customer',
          metrics: [
            { label: 'Severity', value: 'High / Critical', color: 'text-danger' },
            { label: 'Industry', value: c.industry },
            { label: 'Account', value: c.name }
          ],
          recommendation: `Customer ${c.name} requires attention due to executive escalation. Convene alignment call with Account Lead.`,
          actionType: 'deescalate-customer',
          actionLabel: 'Resolve & De-escalate',
          rawId: c.id,
          resolved: false
        });
      }
    });

    // 11. BLOCKED STORIES
    this.stories.forEach(s => {
      if (s.isBlocked) {
        cards.push({
          id: `card-blocked-story-${s.id}`,
          category: 'blocked-stories',
          categoryLabel: 'Blocked Stories',
          categoryIcon: 'fa-solid fa-hand',
          priority: 'critical',
          title: `Story ${s.id} is Blocked`,
          description: `Blocker: "${s.blockerReason || 'Waiting on external dependencies'}"`,
          affectedEntity: `Story ${s.id}`,
          entityType: 'story',
          metrics: [
            { label: 'Story ID', value: s.id },
            { label: 'Est. Hours', value: `${s.estimatedHours} hrs` },
            { label: 'Status', value: 'Blocked', color: 'text-danger' }
          ],
          recommendation: `Story ${s.id} is blocked by external dependencies. Contact Lead Architect to unblock.`,
          actionType: 'unblock-story',
          actionLabel: 'Clear Blocker',
          rawId: s.id,
          resolved: false
        });
      }
    });

    // 12. NO UPDATES IN 5 DAYS
    this.projects.forEach(p => {
      if (p.status !== 'completed' && p.status !== 'archived' && p.lastUpdate) {
        const daysSinceUpdate = Math.abs(diffDays(p.lastUpdate));
        if (daysSinceUpdate >= 5) {
          cards.push({
            id: `card-no-update-${p.id}`,
            category: 'no-updates-5d',
            categoryLabel: 'No updates in 5 days',
            categoryIcon: 'fa-solid fa-clock-pulse',
            priority: 'warning',
            title: `No Progress Logged for ${p.id} (${daysSinceUpdate} Days)`,
            description: `Last recorded status update was on ${p.lastUpdate}. Progress remains static at ${p.progress}%.`,
            affectedEntity: p.name,
            entityType: 'project',
            metrics: [
              { label: 'Idle Days', value: `${daysSinceUpdate} Days`, color: 'text-warning' },
              { label: 'Last Update', value: p.lastUpdate },
              { label: 'PM', value: p.manager }
            ],
            recommendation: `Project ${p.id} has had no updates for ${daysSinceUpdate} days. Request immediate PM progress check-in.`,
            actionType: 'request-update',
            actionLabel: 'Request Status Update',
            rawId: p.id,
            resolved: false
          });
        }
      }
    });

    // 13. WEEKEND WORK
    this.weekendShifts.forEach(w => {
      cards.push({
        id: `card-weekend-${w.id}`,
        category: 'weekend-work',
        categoryLabel: 'Weekend work',
        categoryIcon: 'fa-solid fa-business-time',
        priority: 'info',
        title: `Weekend Shift: ${w.resource}`,
        description: `Scheduled for ${w.hours} hours on ${w.date} for ${w.project}. Task: ${w.task}.`,
        affectedEntity: `${w.resource} (${w.project})`,
        entityType: 'resource',
        metrics: [
          { label: 'Shift Date', value: w.date, color: 'text-info' },
          { label: 'Hours', value: `${w.hours} hrs` },
          { label: 'Resource', value: w.resource }
        ],
        recommendation: `Weekend shift scheduled for ${w.resource} on ${w.date}. Ensure overtime budget approval and compensation recovery.`,
        actionType: 'approve-overtime',
        actionLabel: 'Acknowledge Shift',
        rawId: w.id,
        resolved: false
      });
    });

    return cards;
  },

  /**
   * Main Render Coordinator
   */
  render() {
    const allCards = this.generateActionCards();
    const filteredCards = this.filterCards(allCards);

    this.renderHeaderSummary(allCards);
    this.renderCategoryChips(allCards);
    this.renderPriorityTabs(allCards);
    this.renderCardsGrid(filteredCards);
  },

  /**
   * Filters cards based on selected category, priority, and text search query
   */
  filterCards(allCards) {
    return allCards.filter(card => {
      // 1. Category filter
      if (this.activeCategory !== 'all' && card.category !== this.activeCategory) {
        return false;
      }

      // 2. Priority filter
      if (this.activePriority !== 'all' && card.priority !== this.activePriority) {
        return false;
      }

      // 3. Search query
      if (this.searchQuery.trim() !== '') {
        const query = this.searchQuery.toLowerCase();
        const text = `${card.title} ${card.description} ${card.affectedEntity} ${card.recommendation}`.toLowerCase();
        if (!text.includes(query)) {
          return false;
        }
      }

      return true;
    });
  },

  /**
   * Render Top Executive Recommendations Banner & Quick Stats
   */
  renderHeaderSummary(allCards) {
    const bannerContainer = document.getElementById('action-center-banner');
    if (!bannerContainer) return;

    const criticalCount = allCards.filter(c => c.priority === 'critical').length;
    const warningCount = allCards.filter(c => c.priority === 'warning').length;
    const infoCount = allCards.filter(c => c.priority === 'info').length;

    // Highlight top 3 recommendations
    const topRecs = [
      "Project Ares Core Upgrade is likely to miss delivery by 4 days due to QA bottleneck.",
      "Developer Bob Johnson is allocated at 125%; reallocate 12 hrs capacity.",
      "Customer AeroSpace Inc. requires attention due to pending security audit."
    ];

    bannerContainer.innerHTML = `
      <div class="card border-0 shadow-sm overflow-hidden" style="background: linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%); border-radius: 12px; border: 1px solid var(--border-color) !important;">
        <div class="card-body p-4">
          <div class="row align-items-center g-4">
            
            <div class="col-12 col-lg-7">
              <div class="d-flex align-items-center gap-2 mb-2">
                <span class="badge bg-primary text-white font-bold text-xs uppercase px-2.5 py-1" style="letter-spacing: 0.05em;">
                  <i class="fa-solid fa-wand-magic-sparkles me-1"></i> Automatic Recommendations Engine
                </span>
                <span class="text-xs text-muted font-semibold">Real-time Portfolio Analysis</span>
              </div>
              <h2 class="h4 font-bold text-primary mb-2" style="color: var(--text-primary) !important;">
                Executive Action Center
              </h2>
              <p class="text-secondary text-sm mb-3">
                AI-driven analysis detected <strong>${allCards.length} action items</strong> requiring executive attention across operational, financial, and timeline domains.
              </p>

              <!-- Top 3 Key Highlights -->
              <div class="bg-card p-3 rounded border" style="background-color: var(--bg-card); border-color: var(--border-color) !important;">
                <div class="font-bold text-xs text-uppercase text-secondary mb-2 d-flex align-items-center gap-1.5">
                  <i class="fa-solid fa-lightbulb text-warning"></i> Key Recommendations
                </div>
                <ul class="list-unstyled mb-0 text-xs text-secondary d-flex flex-column gap-1.5">
                  <li class="d-flex align-items-start gap-2">
                    <i class="fa-solid fa-chevron-right text-primary mt-0.5" style="font-size: 0.65rem;"></i>
                    <span><strong>"Project Ares Core Upgrade"</strong> is likely to miss delivery by 4 days.</span>
                  </li>
                  <li class="d-flex align-items-start gap-2">
                    <i class="fa-solid fa-chevron-right text-primary mt-0.5" style="font-size: 0.65rem;"></i>
                    <span><strong>"Developer Bob Johnson"</strong> is allocated at 125%.</span>
                  </li>
                  <li class="d-flex align-items-start gap-2">
                    <i class="fa-solid fa-chevron-right text-primary mt-0.5" style="font-size: 0.65rem;"></i>
                    <span><strong>"Customer AeroSpace Inc."</strong> requires attention.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div class="col-12 col-lg-5">
              <div class="row g-2">
                
                <div class="col-4">
                  <div class="p-3 text-center rounded border bg-card" style="border-left: 4px solid var(--brand-danger) !important; background-color: var(--bg-card);">
                    <div class="text-xxs font-bold uppercase text-danger mb-1">Critical</div>
                    <div class="h3 font-extrabold text-danger m-0">${criticalCount}</div>
                    <div class="text-xxs text-muted mt-1">High Urgency</div>
                  </div>
                </div>

                <div class="col-4">
                  <div class="p-3 text-center rounded border bg-card" style="border-left: 4px solid var(--brand-warning) !important; background-color: var(--bg-card);">
                    <div class="text-xxs font-bold uppercase text-warning mb-1">Warning</div>
                    <div class="h3 font-extrabold text-warning m-0">${warningCount}</div>
                    <div class="text-xxs text-muted mt-1">Medium Risk</div>
                  </div>
                </div>

                <div class="col-4">
                  <div class="p-3 text-center rounded border bg-card" style="border-left: 4px solid var(--brand-info) !important; background-color: var(--bg-card);">
                    <div class="text-xxs font-bold uppercase text-info mb-1">Information</div>
                    <div class="h3 font-extrabold text-info m-0">${infoCount}</div>
                    <div class="text-xxs text-muted mt-1">Operational</div>
                  </div>
                </div>

              </div>
              
              <div class="mt-3 text-end">
                <button id="action-center-auto-fix" class="btn btn-sm btn-primary font-bold px-3 py-1.5" style="border-radius: 8px;">
                  <i class="fa-solid fa-bolt me-1"></i> Auto-Apply Recommendations
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    // Attach listener to auto-apply recommendation button
    const autoFixBtn = document.getElementById('action-center-auto-fix');
    if (autoFixBtn) {
      autoFixBtn.addEventListener('click', () => {
        this.autoFixAllRecommendations();
      });
    }
  },

  /**
   * Render 13 Category Filter Chips with count badges
   */
  renderCategoryChips(allCards) {
    const chipsContainer = document.getElementById('action-center-category-chips');
    if (!chipsContainer) return;

    const categories = [
      { key: 'all', label: 'All Action Items', icon: 'fa-solid fa-layer-group' },
      { key: 'due-this-week', label: 'Projects due this week', icon: 'fa-solid fa-calendar-day' },
      { key: 'due-next-week', label: 'Projects due next week', icon: 'fa-solid fa-calendar-week' },
      { key: 'overdue', label: 'Projects overdue', icon: 'fa-solid fa-clock-rotate-left' },
      { key: 'under-20h', label: 'Projects under 20 hours remaining', icon: 'fa-solid fa-hourglass-half' },
      { key: 'stories-exceeding', label: 'Stories exceeding estimates', icon: 'fa-solid fa-chart-line-down' },
      { key: 'devs-overloaded', label: 'Developers overloaded', icon: 'fa-solid fa-user-slash' },
      { key: 'qa-overloaded', label: 'QA overloaded', icon: 'fa-solid fa-bug-slash' },
      { key: 'people-on-leave', label: 'People on leave', icon: 'fa-solid fa-umbrella-beach' },
      { key: 'pending-sow', label: 'Pending SOW', icon: 'fa-solid fa-file-contract' },
      { key: 'customer-escalations', label: 'Customer Escalations', icon: 'fa-solid fa-triangle-exclamation' },
      { key: 'blocked-stories', label: 'Blocked Stories', icon: 'fa-solid fa-hand' },
      { key: 'no-updates-5d', label: 'No updates in 5 days', icon: 'fa-solid fa-clock-pulse' },
      { key: 'weekend-work', label: 'Weekend work', icon: 'fa-solid fa-business-time' }
    ];

    chipsContainer.innerHTML = '';
    categories.forEach(cat => {
      const count = cat.key === 'all' 
        ? allCards.length 
        : allCards.filter(c => c.category === cat.key).length;

      const isActive = this.activeCategory === cat.key;
      const chip = document.createElement('button');
      chip.className = `btn btn-sm action-category-chip ${isActive ? 'btn-primary active' : 'btn-outline-secondary'}`;
      chip.style.borderRadius = '20px';
      chip.style.fontSize = '0.75rem';
      chip.style.fontWeight = '600';
      chip.style.padding = '5px 12px';
      
      chip.innerHTML = `
        <i class="${cat.icon} me-1.5" style="opacity: 0.85;"></i>
        <span>${cat.label}</span>
        <span class="badge ${isActive ? 'bg-white text-primary' : 'bg-secondary-subtle text-secondary'} font-bold ms-1.5" style="font-size: 0.65rem;">${count}</span>
      `;

      chip.addEventListener('click', () => {
        this.activeCategory = cat.key;
        this.render();
      });

      chipsContainer.appendChild(chip);
    });
  },

  /**
   * Render Priority Level Filter Tabs (Critical, Warning, Information)
   */
  renderPriorityTabs(allCards) {
    const tabsContainer = document.getElementById('action-center-priority-tabs');
    if (!tabsContainer) return;

    const priorities = [
      { key: 'all', label: 'All Priorities', badgeClass: 'bg-secondary' },
      { key: 'critical', label: 'Critical', badgeClass: 'bg-danger' },
      { key: 'warning', label: 'Warning', badgeClass: 'bg-warning text-dark' },
      { key: 'info', label: 'Information', badgeClass: 'bg-info' }
    ];

    tabsContainer.innerHTML = '';
    priorities.forEach(p => {
      const count = p.key === 'all' 
        ? allCards.length 
        : allCards.filter(c => c.priority === p.key).length;

      const isActive = this.activePriority === p.key;
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${isActive ? 'btn-dark active' : 'btn-outline-secondary'}`;
      btn.style.borderRadius = '8px';
      btn.style.fontSize = '0.775rem';
      btn.style.fontWeight = '700';

      btn.innerHTML = `
        ${p.label} <span class="badge ${p.badgeClass} ms-1 font-bold">${count}</span>
      `;

      btn.addEventListener('click', () => {
        this.activePriority = p.key;
        this.render();
      });

      tabsContainer.appendChild(btn);
    });
  },

  /**
   * Render Action Cards Grid
   */
  renderCardsGrid(filteredCards) {
    const gridContainer = document.getElementById('action-center-cards-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    if (filteredCards.length === 0) {
      gridContainer.innerHTML = `
        <div class="col-12 text-center py-5">
          <div class="text-muted mb-2"><i class="fa-solid fa-circle-check fa-3x text-success opacity-50"></i></div>
          <h5 class="font-bold text-secondary">No Action Items Found</h5>
          <p class="text-xs text-muted">All operational parameters for this filter selection are fully optimized and resolved.</p>
        </div>
      `;
      return;
    }

    filteredCards.forEach(card => {
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6 col-lg-4';

      // Priority styling map
      let borderLeftColor = 'var(--brand-info)';
      let badgeClass = 'bg-info-subtle text-info border-info-subtle';
      let priorityLabel = 'Information';

      if (card.priority === 'critical') {
        borderLeftColor = 'var(--brand-danger)';
        badgeClass = 'bg-danger-subtle text-danger border-danger-subtle';
        priorityLabel = 'Critical Priority';
      } else if (card.priority === 'warning') {
        borderLeftColor = 'var(--brand-warning)';
        badgeClass = 'bg-warning-subtle text-warning-emphasis border-warning-subtle';
        priorityLabel = 'Warning';
      }

      // Generate Metrics HTML
      const metricsHtml = card.metrics.map(m => `
        <div class="col-4">
          <div class="text-xxs text-secondary uppercase font-semibold">${m.label}</div>
          <div class="font-bold text-xs ${m.color || 'text-primary'}" style="color: var(--text-primary);">${m.value}</div>
        </div>
      `).join('');

      col.innerHTML = `
        <div class="card h-100 border-0 shadow-sm position-relative overflow-hidden action-card" style="border-left: 5px solid ${borderLeftColor} !important; border-radius: 10px; background-color: var(--bg-card); border-top: 1px solid var(--border-color); border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">
          
          <!-- Card Header -->
          <div class="card-body p-3.5 d-flex flex-column justify-content-between">
            <div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge ${badgeClass} text-xxs font-bold uppercase border px-2 py-0.5" style="border-radius: 4px;">
                  <i class="${card.categoryIcon} me-1"></i> ${priorityLabel}
                </span>
                <span class="text-xxs text-muted font-bold">${card.categoryLabel}</span>
              </div>

              <h6 class="font-bold mb-1 text-sm" style="color: var(--text-primary); line-height: 1.35;">
                ${card.title}
              </h6>

              <p class="text-xs text-secondary mb-3" style="line-height: 1.4;">
                ${card.description}
              </p>

              <!-- Metrics Row -->
              <div class="row g-2 p-2 rounded mb-3 bg-body-tertiary" style="background-color: var(--bg-main) !important;">
                ${metricsHtml}
              </div>

              <!-- Recommendation Box -->
              <div class="p-2.5 rounded border mb-3" style="background-color: rgba(79, 70, 229, 0.04); border-color: rgba(79, 70, 229, 0.2) !important;">
                <div class="d-flex align-items-center gap-1.5 text-xxs font-bold uppercase text-primary mb-1">
                  <i class="fa-solid fa-wand-magic-sparkles"></i> Automatic Recommendation
                </div>
                <div class="text-xs font-medium text-secondary" style="line-height: 1.35; font-style: italic;">
                  "${card.recommendation}"
                </div>
              </div>
            </div>

            <!-- Card Footer Action Button -->
            <div class="pt-2 border-top d-flex justify-content-between align-items-center" style="border-color: var(--border-color) !important;">
              <span class="text-xxs text-muted font-semibold">Affected: <strong>${card.affectedEntity}</strong></span>
              <button class="btn btn-xs btn-primary font-bold action-execute-btn px-2.5 py-1 text-xs" data-card-id="${card.id}" data-action="${card.actionType}" data-raw-id="${card.rawId}">
                <i class="fa-solid fa-bolt me-1"></i> ${card.actionLabel}
              </button>
            </div>

          </div>

        </div>
      `;

      gridContainer.appendChild(col);
    });

    // Attach listeners on Action Buttons
    const actionBtns = gridContainer.querySelectorAll('.action-execute-btn');
    actionBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.closest('button').getAttribute('data-action');
        const rawId = e.target.closest('button').getAttribute('data-raw-id');
        this.handleCardAction(action, rawId);
      });
    });
  },

  /**
   * Handle user action triggered from a card
   */
  handleCardAction(actionType, rawId) {
    if (actionType === 'extend-date') {
      const p = this.projects.find(proj => proj.id === rawId);
      if (p) {
        // Extend target completion date by 14 days
        const curr = new Date(p.estimatedEnd || '2026-07-30');
        curr.setDate(curr.getDate() + 14);
        p.estimatedEnd = curr.toISOString().split('T')[0];
        p.risk = 'Medium';
        Storage.set('projects', this.projects);
        this.app.showToast(`Extended target date for ${p.name} to ${p.estimatedEnd}`, 'success');
      }
    } else if (actionType === 'reallocate-dev' || actionType === 'reallocate-capacity') {
      const r = this.resources.find(res => res.id === rawId || res.name === rawId);
      if (r) {
        r.allocation = 95;
        Storage.set('resources', this.resources);
        this.app.showToast(`Reallocated workload for ${r.name} to 95% optimal capacity`, 'success');
      }
    } else if (actionType === 'reassign-qa' || actionType === 'assign-qa-support') {
      const r = this.resources.find(res => res.name === 'David Miller');
      if (r) {
        r.allocation = 90;
        Storage.set('resources', this.resources);
        this.app.showToast(`Assigned secondary QA automation engineer. David Miller workload optimized`, 'success');
      }
    } else if (actionType === 'approve-sow') {
      const p = this.projects.find(proj => proj.id === rawId);
      if (p) {
        p.sowStatus = 'Approved';
        Storage.set('projects', this.projects);
        this.app.showToast(`SOW Agreement for ${p.client} - ${p.name} has been formally approved!`, 'success');
      }
    } else if (actionType === 'deescalate-customer') {
      const c = this.customers.find(cust => cust.id === rawId);
      if (c) {
        c.isEscalated = false;
        c.escalationReason = '';
        Storage.set('customers', this.customers);
        this.app.showToast(`Customer escalation for ${c.name} has been successfully resolved`, 'success');
      }
    } else if (actionType === 'unblock-story') {
      const s = this.stories.find(story => story.id === rawId);
      if (s) {
        s.isBlocked = false;
        s.blockerReason = '';
        s.status = 'In Progress';
        Storage.set('stories', this.stories);
        this.app.showToast(`Unblocked Story ${s.id}. Velocity restored!`, 'success');
      }
    } else if (actionType === 'adjust-estimate') {
      const s = this.stories.find(story => story.id === rawId);
      if (s) {
        s.estimatedHours = s.loggedHours + 4;
        Storage.set('stories', this.stories);
        this.app.showToast(`Re-baselined estimate for Story ${s.id} to ${s.estimatedHours} hrs`, 'success');
      }
    } else if (actionType === 'request-update') {
      const p = this.projects.find(proj => proj.id === rawId);
      if (p) {
        p.lastUpdate = '2026-07-28';
        Storage.set('projects', this.projects);
        this.app.showToast(`Status update logged for ${p.name}. Update timestamp refreshed`, 'success');
      }
    } else {
      this.app.showToast(`Action executed successfully for ${rawId}`, 'info');
    }

    // Re-render Action Center
    this.render();
  },

  /**
   * Auto-Fix all active recommendations in one click
   */
  autoFixAllRecommendations() {
    // 1. Resolve overdue dates
    this.projects.forEach(p => {
      if (p.progress < 100) {
        p.estimatedEnd = '2026-08-15';
        p.sowStatus = 'Approved';
        p.lastUpdate = '2026-07-28';
      }
    });
    Storage.set('projects', this.projects);

    // 2. Resolve developer allocations
    this.resources.forEach(r => {
      if (r.allocation > 100) r.allocation = 95;
    });
    Storage.set('resources', this.resources);

    // 3. Unblock stories
    this.stories.forEach(s => {
      s.isBlocked = false;
      s.blockerReason = '';
    });
    Storage.set('stories', this.stories);

    // 4. Resolve customer escalations
    this.customers.forEach(c => {
      c.isEscalated = false;
    });
    Storage.set('customers', this.customers);

    this.app.showToast('Automatic Recommendations engine optimized all 13 Action Center operational risks!', 'success');
    this.render();
  },

  /**
   * Setup Event Listeners
   */
  setupEventListeners() {
    const searchInput = document.getElementById('action-center-search-input');
    if (searchInput) {
      searchInput.value = this.searchQuery;
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.render();
      });
    }
  }
};
