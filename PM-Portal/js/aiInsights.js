/* aiInsights.js - Detailed AI Project Health Timeline, Resource Optimizer & Sprint Analysis Widgets */

import { Storage } from './storage.js';
import { AIEngine } from './aiEngine.js';

export const AIInsightsModule = {
  /**
   * Renders Smart Project Health Meter & Interactive Timeline inside Project Details
   * @param {object} project 
   * @param {string} containerId 
   * @param {object} appInstance 
   */
  renderProjectHealthWidget(project, containerId, appInstance) {
    const container = document.getElementById(containerId);
    if (!container || !project) return;

    const health = AIEngine.calculateProjectHealth(project);
    const forecast = AIEngine.forecastProject(project);

    let html = `
      <div class="card border-0 shadow-sm mb-4" style="border-radius: 12px; overflow: hidden;">
        <div class="card-header bg-card border-bottom py-3 px-3.5 d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <i class="fa-solid fa-heart-pulse text-danger"></i>
            <h6 class="font-bold text-sm mb-0" style="color: var(--text-primary);">Smart AI Project Health Scorecard</h6>
          </div>
          <span class="badge ${health.badgeBg} font-bold uppercase text-xxs px-2.5 py-1">${health.status} (${health.score}/100)</span>
        </div>

        <div class="card-body p-3.5">
          
          <!-- Health Score Progress Gauge -->
          <div class="mb-3">
            <div class="d-flex justify-content-between text-xs mb-1">
              <span class="font-bold text-secondary">Overall Health Index</span>
              <span class="font-mono font-bold text-primary">${health.score} / 100</span>
            </div>
            <div class="progress" style="height: 10px; border-radius: 6px;">
              <div class="progress-bar ${health.score >= 80 ? 'bg-success' : health.score >= 60 ? 'bg-info' : health.score >= 40 ? 'bg-warning' : 'bg-danger'}" 
                   style="width: ${health.score}%;"></div>
            </div>
          </div>

          <!-- Factors List -->
          <div class="mb-3">
            <h6 class="font-bold text-xxs text-secondary uppercase tracking-wider mb-2">Evaluated Health Factors</h6>
            <div class="d-flex flex-column gap-1.5">
              ${health.factors.length > 0 ? health.factors.map(f => `
                <div class="p-2 rounded bg-body-tertiary border d-flex align-items-center gap-2 text-xs">
                  <i class="fa-solid ${f.type === 'danger' ? 'fa-circle-exclamation text-danger' : f.type === 'warning' ? 'fa-triangle-exclamation text-warning' : 'fa-circle-check text-success'}"></i>
                  <span>${f.text}</span>
                </div>
              `).join('') : `
                <div class="p-2 rounded bg-success-subtle text-success border border-success-subtle text-xs">
                  <i class="fa-solid fa-circle-check me-1"></i> All operational metrics performing within target ranges.
                </div>
              `}
            </div>
          </div>

          <!-- Interactive Health & Risk Trend Timeline -->
          <div>
            <h6 class="font-bold text-xxs text-secondary uppercase tracking-wider mb-2">AI Health & Risk Trend Timeline</h6>
            <div class="p-3 border rounded-3 bg-body-tertiary">
              <div class="d-flex justify-content-between align-items-center text-xxs font-mono mb-2 text-muted">
                <span>Sprint 1 (Kickoff)</span>
                <span>Sprint 2 (Dev)</span>
                <span>Sprint 3 (QA)</span>
                <span>Sprint 4 (Target Release)</span>
              </div>
              
              <!-- Timeline milestones bar -->
              <div class="position-relative d-flex align-items-center justify-content-between" style="height: 24px;">
                <div class="position-absolute w-100 bg-secondary-subtle" style="height: 3px; top: 10px; z-index: 1;"></div>
                
                <div class="rounded-circle bg-success text-white font-bold d-flex align-items-center justify-content-center" style="width: 22px; height: 22px; font-size: 0.65rem; z-index: 2;" title="Sprint 1 Health: 95/100">95</div>
                <div class="rounded-circle bg-success text-white font-bold d-flex align-items-center justify-content-center" style="width: 22px; height: 22px; font-size: 0.65rem; z-index: 2;" title="Sprint 2 Health: 88/100">88</div>
                <div class="rounded-circle ${health.score >= 60 ? 'bg-warning' : 'bg-danger'} text-white font-bold d-flex align-items-center justify-content-center" style="width: 22px; height: 22px; font-size: 0.65rem; z-index: 2;" title="Current Sprint Health: ${health.score}">${health.score}</div>
                <div class="rounded-circle bg-body border text-muted font-bold d-flex align-items-center justify-content-center" style="width: 22px; height: 22px; font-size: 0.65rem; z-index: 2;" title="Target Release">${forecast ? forecast.onTimeLikelihood + '%' : 'EST'}</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  /**
   * Renders AI Sprint Analysis Widget
   * @param {object} project 
   * @param {string} containerId 
   */
  renderSprintAnalysisWidget(project, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !project) return;

    const stories = Storage.getUserStories().filter(s => s.projectId === project.id);
    const completed = stories.filter(s => s.status === 'Done' || s.status === 'Completed');
    const remaining = stories.filter(s => s.status !== 'Done' && s.status !== 'Completed');

    const totalLogged = stories.reduce((a, b) => a + (b.loggedHours || 0), 0);
    const totalEstimated = stories.reduce((a, b) => a + (b.estimatedHours || 0), 0);
    const spillovers = remaining.filter(s => (s.loggedHours || 0) > (s.estimatedHours || 0));

    let html = `
      <div class="card border-0 shadow-sm mb-4" style="border-radius: 12px;">
        <div class="card-header bg-card border-bottom py-3 px-3.5 d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <i class="fa-solid fa-gauge-high text-primary"></i>
            <h6 class="font-bold text-sm mb-0" style="color: var(--text-primary);">AI Sprint Velocity & Burndown Analysis</h6>
          </div>
          <span class="badge bg-primary-subtle text-primary font-mono text-xxs">Sprint Health: ${spillovers.length === 0 ? 'Optimal' : 'Spillover Risk'}</span>
        </div>

        <div class="card-body p-3.5">
          <div class="row g-3 mb-3 text-center">
            <div class="col-4">
              <div class="p-2 border rounded bg-body-tertiary">
                <div class="text-xxs text-secondary uppercase font-semibold">Completed</div>
                <div class="font-bold text-base text-success">${completed.length} / ${stories.length}</div>
              </div>
            </div>
            <div class="col-4">
              <div class="p-2 border rounded bg-body-tertiary">
                <div class="text-xxs text-secondary uppercase font-semibold">Logged Effort</div>
                <div class="font-bold text-base text-primary">${totalLogged} / ${totalEstimated}h</div>
              </div>
            </div>
            <div class="col-4">
              <div class="p-2 border rounded bg-body-tertiary">
                <div class="text-xxs text-secondary uppercase font-semibold">Spillover Risk</div>
                <div class="font-bold text-base ${spillovers.length > 0 ? 'text-danger' : 'text-success'}">${spillovers.length} stories</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }
};
