/* aiDashboard.js - Executive AI Insights Panel & Daily Action Center Widget */

import { Storage } from './storage.js';
import { AIEngine } from './aiEngine.js';
import { AIRecommendationsModule } from './aiRecommendations.js';

export const AIDashboardModule = {
  /**
   * Renders the Executive AI Insights Panel (Indicator Bullet Cards)
   * @param {string} containerId 
   * @param {object} appInstance 
   */
  renderExecutiveInsightsPanel(containerId, appInstance) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const projects = Storage.getProjects();
    const resources = Storage.getResources();
    const customers = Storage.getCustomers();

    let onScheduleCount = 0;
    let attentionCount = 0;
    const bulletInsights = [];

    projects.forEach(p => {
      const h = AIEngine.calculateProjectHealth(p);
      if (h.status === 'Excellent' || h.status === 'Healthy') {
        onScheduleCount++;
      } else if (h.status === 'Monitor') {
        attentionCount++;
      } else {
        const days = h.metrics.daysLeft;
        bulletInsights.push({
          type: 'danger',
          icon: '🟢',
          colorClass: 'text-danger',
          badgeBg: 'bg-danger-subtle text-danger border-danger-subtle',
          text: `Project '${p.name}' will likely miss delivery by ${days === 0 ? '5' : days} days due to remaining workload lag.`
        });
      }
    });

    if (onScheduleCount > 0) {
      bulletInsights.unshift({
        type: 'success',
        icon: '🟢',
        colorClass: 'text-success',
        badgeBg: 'bg-success-subtle text-success border-success-subtle',
        text: `${onScheduleCount} project(s) are operating strictly on schedule with optimal burn rate.`
      });
    }

    if (attentionCount > 0) {
      bulletInsights.push({
        type: 'warning',
        icon: '🟡',
        colorClass: 'text-warning',
        badgeBg: 'bg-warning-subtle text-warning border-warning-subtle',
        text: `${attentionCount} project(s) require attention this week to prevent schedule slip.`
      });
    }

    // Overloaded resource check
    resources.forEach(r => {
      if ((r.allocationPercentage || 100) > 100) {
        bulletInsights.push({
          type: 'danger',
          icon: '🔴',
          colorClass: 'text-danger',
          badgeBg: 'bg-danger-subtle text-danger border-danger-subtle',
          text: `Developer ${r.name} is allocated at ${r.allocationPercentage}%. Rebalance recommended.`
        });
      }
    });

    // Customer check
    customers.forEach(c => {
      if (c.escalationsCount > 0) {
        bulletInsights.push({
          type: 'warning',
          icon: '🟠',
          colorClass: 'text-warning',
          badgeBg: 'bg-warning-subtle text-warning border-warning-subtle',
          text: `Customer ${c.name} has ${c.escalationsCount} open escalation(s) and pending stories.`
        });
      }
    });

    // QA Capacity check
    const qaMembers = resources.filter(r => r.role && r.role.toLowerCase().includes('qa'));
    const avgQAAlloc = qaMembers.length > 0 ? Math.round(qaMembers.reduce((a, b) => a + (b.allocationPercentage || 100), 0) / qaMembers.length) : 80;
    if (avgQAAlloc < 85) {
      bulletInsights.push({
        type: 'success',
        icon: '🟢',
        colorClass: 'text-success',
        badgeBg: 'bg-success-subtle text-success border-success-subtle',
        text: `QA Team has available capacity next week (Average utilization: ${avgQAAlloc}%).`
      });
    }

    let html = `
      <div class="card border-0 shadow-sm mb-4" style="border-radius: 12px; background: linear-gradient(135deg, var(--card-bg), var(--body-bg-tertiary)); border-left: 4px solid var(--bs-primary) !important;">
        <div class="card-header bg-transparent border-bottom py-3 px-3.5 d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <i class="fa-solid fa-brain text-primary" style="font-size: 1.1rem;"></i>
            <h6 class="font-bold text-sm mb-0" style="color: var(--text-primary);">Executive AI Insights Panel</h6>
          </div>
          <span class="badge bg-primary-subtle text-primary border border-primary-subtle text-xxs font-mono">Real-Time Continuous Analysis</span>
        </div>

        <div class="card-body p-3.5">
          <div class="d-flex flex-column gap-2.5">
    `;

    bulletInsights.slice(0, 6).forEach(item => {
      html += `
        <div class="p-2.5 rounded-3 border bg-body d-flex align-items-center justify-content-between gap-3 shadow-2xs">
          <div class="d-flex align-items-center gap-2.5">
            <span style="font-size: 0.95rem;">${item.icon}</span>
            <span class="font-semibold text-xs" style="color: var(--text-primary);">${item.text}</span>
          </div>
          <span class="badge ${item.badgeBg} text-xxs font-bold uppercase">AI Analyzed</span>
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  /**
   * Renders Today's Priorities (Daily Action Center Widget)
   * @param {string} containerId 
   * @param {object} appInstance 
   */
  renderDailyActionCenterWidget(containerId, appInstance) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const priorities = [
      { id: 'p1', title: 'Finish HD-3421 Database Replication Hotfix', urgency: 'Critical', badge: 'bg-danger-subtle text-danger', due: 'Today 2:00 PM' },
      { id: 'p2', title: 'Approve SOW Contract for Customer Bosch', urgency: 'High', badge: 'bg-warning-subtle text-warning', due: 'Today 5:00 PM' },
      { id: 'p3', title: 'QA pending verification for Project Delta', urgency: 'High', badge: 'bg-warning-subtle text-warning', due: 'Tomorrow 10:00 AM' },
      { id: 'p4', title: 'Lead Developer on approved leave tomorrow', urgency: 'Medium', badge: 'bg-info-subtle text-info', due: 'Tomorrow' },
      { id: 'p5', title: 'Customer Steering Alignment Meeting at Risk', urgency: 'Medium', badge: 'bg-info-subtle text-info', due: 'In 2 days' }
    ];

    let html = `
      <div class="card border-0 shadow-sm mb-4" style="border-radius: 12px;">
        <div class="card-header bg-card border-bottom py-3 px-3.5 d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <i class="fa-solid fa-list-check text-warning"></i>
            <h6 class="font-bold text-sm mb-0" style="color: var(--text-primary);">Today's AI Priorities</h6>
          </div>
          <span class="badge bg-warning-subtle text-warning border border-warning-subtle font-mono text-xxs">Sorted by Urgency</span>
        </div>

        <div class="card-body p-3">
          <div class="list-group list-group-flush">
    `;

    priorities.forEach(p => {
      html += `
        <div class="list-group-item p-2.5 border-bottom d-flex align-items-center justify-content-between gap-2 bg-transparent">
          <div class="d-flex align-items-center gap-2.5">
            <input class="form-check-input" type="checkbox" id="${p.id}" style="cursor: pointer;" />
            <div>
              <label for="${p.id}" class="font-bold text-xs mb-0" style="cursor: pointer; color: var(--text-primary);">${p.title}</label>
              <div class="text-xxs text-secondary">Due: ${p.due}</div>
            </div>
          </div>
          <span class="badge ${p.badge} uppercase font-bold text-xxs">${p.urgency}</span>
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach checkbox complete handlers
    container.querySelectorAll('.form-check-input').forEach(chk => {
      chk.addEventListener('change', (e) => {
        if (e.target.checked) {
          appInstance.showToast('Priority task marked complete', 'success');
          e.target.closest('.list-group-item').style.opacity = '0.5';
        } else {
          e.target.closest('.list-group-item').style.opacity = '1';
        }
      });
    });
  }
};
