/* aiForecast.js - Predictive AI Project Completion & Cost Estimation Module */

import { Storage } from './storage.js';
import { AIEngine } from './aiEngine.js';

export const AIForecastModule = {
  /**
   * Generates predictive forecast across entire project portfolio
   * @returns {object} Aggregate portfolio forecast stats
   */
  getPortfolioForecast() {
    const projects = Storage.getProjects();
    const projectForecasts = projects.map(p => AIEngine.forecastProject(p)).filter(Boolean);

    let totalRemainingHours = 0;
    let totalProjectedOverrunCost = 0;
    let totalEstimatedCostRemaining = 0;
    let totalDelayDays = 0;

    projectForecasts.forEach(f => {
      totalRemainingHours += f.hoursRemaining;
      totalProjectedOverrunCost += f.expectedCostOverrun;
      totalEstimatedCostRemaining += f.estimatedCostRemaining;
      totalDelayDays += f.estimatedDelayDays;
    });

    const avgOnTimeLikelihood = projectForecasts.length > 0 
      ? Math.round(projectForecasts.reduce((acc, f) => acc + f.onTimeLikelihood, 0) / projectForecasts.length)
      : 100;

    return {
      projectCount: projects.length,
      totalRemainingHours,
      totalEstimatedCostRemaining,
      totalProjectedOverrunCost,
      totalDelayDays,
      avgOnTimeLikelihood,
      projectForecasts
    };
  },

  /**
   * Renders AI Predictive Forecast Panel
   * @param {string} containerId 
   * @param {object} appInstance 
   */
  renderForecastPanel(containerId, appInstance) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const summary = this.getPortfolioForecast();

    let html = `
      <div class="card border-0 shadow-sm mb-4" style="border-radius: 12px; overflow: hidden;">
        <div class="card-header bg-card border-bottom py-3 px-3.5 d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center gap-2">
            <i class="fa-solid fa-chart-line text-info"></i>
            <h6 class="font-bold text-sm mb-0" style="color: var(--text-primary);">AI Predictive Forecast & Cost Overrun Engine</h6>
          </div>
          <span class="badge bg-info-subtle text-info border border-info-subtle font-mono text-xxs">Monte Carlo Simulation</span>
        </div>

        <div class="card-body p-3.5">
          
          <!-- Key Metric Cards -->
          <div class="row g-3 mb-4">
            <div class="col-md-3">
              <div class="p-3 border rounded-3 bg-body-tertiary">
                <div class="text-xxs text-secondary uppercase font-semibold mb-1">Portfolio On-Time Index</div>
                <div class="d-flex align-items-baseline gap-2">
                  <span class="font-bold text-xl ${summary.avgOnTimeLikelihood >= 80 ? 'text-success' : summary.avgOnTimeLikelihood >= 60 ? 'text-warning' : 'text-danger'}">
                    ${summary.avgOnTimeLikelihood}%
                  </span>
                  <span class="text-xxs text-muted">likelihood</span>
                </div>
              </div>
            </div>

            <div class="col-md-3">
              <div class="p-3 border rounded-3 bg-body-tertiary">
                <div class="text-xxs text-secondary uppercase font-semibold mb-1">Total Schedule Variance</div>
                <div class="d-flex align-items-baseline gap-2">
                  <span class="font-bold text-xl ${summary.totalDelayDays === 0 ? 'text-success' : 'text-danger'}">
                    ${summary.totalDelayDays > 0 ? `+${summary.totalDelayDays} Days` : 'On Schedule'}
                  </span>
                  <span class="text-xxs text-muted">cum. delay</span>
                </div>
              </div>
            </div>

            <div class="col-md-3">
              <div class="p-3 border rounded-3 bg-body-tertiary">
                <div class="text-xxs text-secondary uppercase font-semibold mb-1">Est. Cost Remaining</div>
                <div class="d-flex align-items-baseline gap-2">
                  <span class="font-bold text-xl text-primary">$${summary.totalEstimatedCostRemaining.toLocaleString()}</span>
                  <span class="text-xxs text-muted">@ $85/hr</span>
                </div>
              </div>
            </div>

            <div class="col-md-3">
              <div class="p-3 border rounded-3 bg-body-tertiary">
                <div class="text-xxs text-secondary uppercase font-semibold mb-1">Potential Cost Overrun</div>
                <div class="d-flex align-items-baseline gap-2">
                  <span class="font-bold text-xl ${summary.totalProjectedOverrunCost > 0 ? 'text-danger' : 'text-success'}">
                    $${summary.totalProjectedOverrunCost.toLocaleString()}
                  </span>
                  <span class="text-xxs text-muted">variance</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Project Forecast Breakdown Table -->
          <h6 class="font-bold text-xs mb-2.5 text-secondary uppercase tracking-wider">Project-by-Project Forecast Matrix</h6>
          <div class="table-responsive">
            <table class="table table-hover align-middle text-xs m-0">
              <thead class="table-light">
                <tr>
                  <th>Project Name</th>
                  <th>Hours Left</th>
                  <th>Req. Burn Rate</th>
                  <th>Projected Completion</th>
                  <th>Schedule Variance</th>
                  <th>On-Time %</th>
                  <th>Cost Overrun Est.</th>
                </tr>
              </thead>
              <tbody>
    `;

    summary.projectForecasts.forEach(f => {
      html += `
        <tr>
          <td class="font-bold text-primary">${f.projectName}</td>
          <td>${f.hoursRemaining} hrs</td>
          <td><span class="badge bg-body-secondary text-secondary font-mono">${f.burnRateHoursPerDay}h/day</span></td>
          <td>${f.projectedEndDate}</td>
          <td>
            <span class="badge ${f.estimatedDelayDays > 0 ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}">
              ${f.scheduleVarianceDays}
            </span>
          </td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="progress flex-grow-1" style="height: 6px; width: 60px;">
                <div class="progress-bar ${f.onTimeLikelihood >= 80 ? 'bg-success' : f.onTimeLikelihood >= 50 ? 'bg-warning' : 'bg-danger'}" style="width: ${f.onTimeLikelihood}%"></div>
              </div>
              <span class="font-mono text-xxs font-bold">${f.onTimeLikelihood}%</span>
            </div>
          </td>
          <td class="font-bold ${f.expectedCostOverrun > 0 ? 'text-danger' : 'text-success'}">
            $${f.expectedCostOverrun.toLocaleString()}
          </td>
        </tr>
      `;
    });

    html += `
              </tbody>
            </table>
          </div>

        </div>
      </div>
    `;

    container.innerHTML = html;
  }
};
