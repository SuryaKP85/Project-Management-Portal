/* aiRecommendations.js - AI Actionable Recommendation Engine & Auto-Fix Handlers */

import { Storage } from './storage.js';
import { AIEngine } from './aiEngine.js';

export const AIRecommendationsModule = {
  /**
   * Generates a complete list of real-time actionable AI recommendations
   * @returns {Array<object>} List of recommendation objects
   */
  generateAllRecommendations() {
    const projects = Storage.getProjects();
    const resources = Storage.getResources();
    const customers = Storage.getCustomers();
    const userStories = Storage.getUserStories();

    const recommendations = [];

    // 1. PROJECT SCHEDULE & OVERDUE RECOMMENDATIONS
    projects.forEach(project => {
      const health = AIEngine.calculateProjectHealth(project);
      
      if (health.status === 'Critical' || health.status === 'At Risk') {
        const daysLeft = health.metrics.daysLeft;
        const hoursLeft = health.metrics.hoursLeft;

        if (daysLeft === 0 && hoursLeft > 0) {
          recommendations.push({
            id: `rec-proj-overdue-${project.id}`,
            priority: 'Critical',
            badgeBg: 'bg-danger-subtle text-danger border-danger-subtle',
            category: 'Project Health',
            title: `Re-baseline Schedule for Overdue Project '${project.name}'`,
            description: `Project '${project.name}' has reached deadline with ${hoursLeft} hours remaining. Recommend extending deadline by 7 business days and assigning secondary QA automation support.`,
            confidencePercent: 96,
            impactLabel: 'Restores schedule baseline & mitigates client penalty',
            actionLabel: 'Extend Baseline 7 Days',
            execute: (app) => {
              const currentEnd = new Date(project.estimatedEnd || new Date());
              currentEnd.setDate(currentEnd.getDate() + 7);
              project.estimatedEnd = currentEnd.toISOString().split('T')[0];
              project.status = 'in-progress';
              Storage.saveProjects(projects);
              app.showToast(`Extended ${project.name} target deadline by 7 days`, 'success');
              app.refreshCurrentPage();
            }
          });
        } else if (health.metrics.requiredDailyBurn > 10) {
          recommendations.push({
            id: `rec-proj-burn-${project.id}`,
            priority: 'High',
            badgeBg: 'bg-warning-subtle text-warning border-warning-subtle',
            category: 'Resource Optimization',
            title: `Add Weekend Shift or Secondary Dev for '${project.name}'`,
            description: `Daily required burn rate is ${health.metrics.requiredDailyBurn}h/day. Add a weekend delivery shift or secondary developer to prevent delivery delay.`,
            confidencePercent: 91,
            impactLabel: 'Reduces risk of delivery delay by 75%',
            actionLabel: 'Schedule Weekend Shift',
            execute: (app) => {
              app.switchPage('weekend-planner');
            }
          });
        }
      }

      // Blocked User Stories
      const blockedStories = userStories.filter(s => s.projectId === project.id && s.isBlocked);
      if (blockedStories.length > 0) {
        recommendations.push({
          id: `rec-proj-blocked-${project.id}`,
          priority: 'High',
          badgeBg: 'bg-warning-subtle text-warning border-warning-subtle',
          category: 'Task Unblocking',
          title: `Clear ${blockedStories.length} Blocked Story Ticket(s) in '${project.name}'`,
          description: `Blocked stories are stalling sprint velocity. Review blocker reasons and reassign technical dependencies.`,
          confidencePercent: 94,
          impactLabel: 'Unblocks sprint delivery velocity',
          actionLabel: 'Clear Blockers',
          execute: (app) => {
            blockedStories.forEach(s => {
              s.isBlocked = false;
              s.blockerReason = '';
            });
            Storage.saveUserStories(userStories);
            app.showToast(`Cleared blockers on ${blockedStories.length} stories`, 'success');
            app.refreshCurrentPage();
          }
        });
      }

      // SOW Approval Escalation
      if (project.sowStatus && project.sowStatus !== 'Approved') {
        recommendations.push({
          id: `rec-proj-sow-${project.id}`,
          priority: 'Medium',
          badgeBg: 'bg-info-subtle text-info border-info-subtle',
          category: 'SOW & Governance',
          title: `Escalate SOW Contract Sign-off for '${project.name}'`,
          description: `Current SOW status is '${project.sowStatus}'. Send automated escalation email to customer executive sponsor.`,
          confidencePercent: 88,
          impactLabel: 'Accelerates revenue & milestone recognition',
          actionLabel: 'Generate SOW Escalation Email',
          execute: (app) => {
            if (window.openEmailModal) {
              window.openEmailModal('sow_approval', { projectName: project.name, clientName: project.clientName || 'Client' });
            } else {
              app.showToast('Email Generator modal ready', 'info');
            }
          }
        });
      }
    });

    // 2. RESOURCE OVERLOAD RECOMMENDATIONS
    const resAnalysis = AIEngine.analyzeResources();
    resAnalysis.recommendations.forEach((rec, idx) => {
      recommendations.push({
        id: `rec-res-${idx}`,
        priority: rec.priority === 'High' ? 'High' : 'Medium',
        badgeBg: rec.priority === 'High' ? 'bg-danger-subtle text-danger border-danger-subtle' : 'bg-warning-subtle text-warning border-warning-subtle',
        category: 'Resource Optimization',
        title: `Rebalance Capacity for ${rec.targetResource}`,
        description: rec.message,
        confidencePercent: 92,
        impactLabel: 'Prevents team burnout & quality degradation',
        actionLabel: rec.actionLabel,
        execute: (app) => rec.execute(app)
      });
    });

    // 3. CUSTOMER HEALTH RECOMMENDATIONS
    customers.forEach(customer => {
      const custHealth = AIEngine.calculateCustomerHealth(customer);
      if (custHealth.status === 'Critical' || custHealth.status === 'Needs Attention') {
        recommendations.push({
          id: `rec-cust-${customer.id}`,
          priority: custHealth.status === 'Critical' ? 'High' : 'Medium',
          badgeBg: custHealth.status === 'Critical' ? 'bg-danger-subtle text-danger border-danger-subtle' : 'bg-warning-subtle text-warning border-warning-subtle',
          category: 'Customer Escalation',
          title: `Schedule Executive Alignment Call with ${customer.name}`,
          description: `Customer Health is '${custHealth.status}' (Score: ${custHealth.score}/100) due to active escalations and pending milestone deliverables.`,
          confidencePercent: 95,
          impactLabel: 'Mitigates customer churn & restores alignment',
          actionLabel: 'Generate Status Email',
          execute: (app) => {
            if (window.openEmailModal) {
              window.openEmailModal('customer_update', { clientName: customer.name });
            } else {
              app.showToast('Email Generator opened', 'info');
            }
          }
        });
      }
    });

    // Sort by priority (Critical > High > Medium > Low)
    const priorityWeight = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
    recommendations.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));

    return recommendations;
  },

  /**
   * Renders AI Recommendations Widget inside container
   * @param {string} containerId 
   * @param {object} appInstance 
   */
  renderRecommendationsWidget(containerId, appInstance) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const recommendations = this.generateAllRecommendations();

    if (recommendations.length === 0) {
      container.innerHTML = `
        <div class="card p-4 text-center">
          <i class="fa-solid fa-circle-check fa-3x text-success mb-2 opacity-75"></i>
          <h6 class="font-bold text-sm text-primary">Portfolio Completely Optimized</h6>
          <p class="text-xs text-secondary m-0">No active AI risks or resource imbalances detected.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div class="card border-0 shadow-sm" style="border-radius: 12px; overflow: hidden;">
        <div class="card-header bg-card border-bottom py-3 px-3.5 d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <i class="fa-solid fa-wand-magic-sparkles text-primary"></i>
            <h6 class="font-bold text-sm mb-0" style="color: var(--text-primary);">Actionable AI Recommendations</h6>
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill font-mono text-xxs">${recommendations.length} Active</span>
          </div>
          <button id="refresh-ai-recs-btn" class="btn btn-sm btn-outline-secondary py-1 px-2 text-xxs">
            <i class="fa-solid fa-rotate me-1"></i> Re-evaluate
          </button>
        </div>
        <div class="card-body p-3" style="max-height: 480px; overflow-y: auto;">
          <div class="d-flex flex-column gap-3">
    `;

    recommendations.forEach(rec => {
      html += `
        <div class="p-3 border rounded-3 bg-body-tertiary shadow-2xs hover:shadow-xs transition-all" id="${rec.id}">
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
            <div class="d-flex align-items-center gap-2">
              <span class="badge ${rec.badgeBg} uppercase font-bold text-xxs px-2 py-0.5 rounded">${rec.priority}</span>
              <span class="text-xxs font-semibold text-secondary uppercase tracking-wider">${rec.category}</span>
            </div>
            <span class="badge bg-body border text-secondary font-mono text-xxs px-2 py-0.5" title="AI Confidence Rating">
              <i class="fa-solid fa-microchip text-primary me-1"></i> ${rec.confidencePercent}% Confidence
            </span>
          </div>

          <h6 class="font-bold text-xs mb-1" style="color: var(--text-primary);">${rec.title}</h6>
          <p class="text-xs text-secondary mb-2" style="line-height: 1.45;">${rec.description}</p>

          <div class="d-flex flex-wrap justify-content-between align-items-center pt-2 border-top border-dashed gap-2">
            <span class="text-xxs text-success font-medium">
              <i class="fa-solid fa-bolt me-1"></i> ${rec.impactLabel}
            </span>
            <button class="btn btn-sm btn-primary py-1 px-2.5 text-xxs font-semibold rec-action-btn" data-rec-id="${rec.id}">
              ${rec.actionLabel}
            </button>
          </div>
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach event handlers
    const refreshBtn = container.querySelector('#refresh-ai-recs-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        appInstance.showToast('AI Model re-evaluated portfolio state', 'info');
        this.renderRecommendationsWidget(containerId, appInstance);
      });
    }

    container.querySelectorAll('.rec-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const recId = e.target.getAttribute('data-rec-id');
        const rec = recommendations.find(r => r.id === recId);
        if (rec && rec.execute) {
          rec.execute(appInstance);
        }
      });
    });
  }
};
