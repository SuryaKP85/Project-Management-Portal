/**
 * Agile Metrics Module (Burndown & Velocity Charts)
 * Powered by Chart.js for Enterprise Project Management Portal
 */

export const AgileMetrics = {
  burndownChartInstance: null,
  velocityChartInstance: null,

  /**
   * Renders the interactive Sprint Burndown chart
   * @param {string} canvasId
   * @param {Object} burndownData - Output from /sprints/:id/burndown
   * @param {'points' | 'hours'} metric
   */
  renderBurndownChart(canvasId, burndownData, metric = 'points') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;

    if (this.burndownChartInstance) {
      this.burndownChartInstance.destroy();
      this.burndownChartInstance = null;
    }

    const days = burndownData?.days || [];
    const labels = days.map((d) => d.label || d.date);

    const isPoints = metric === 'points';
    const idealData = days.map((d) => (isPoints ? d.idealRemainingPoints : d.idealRemainingHours));
    const actualData = days.map((d) => (isPoints ? d.actualRemainingPoints : d.actualRemainingHours));

    const ctx = canvas.getContext('2d');
    this.burndownChartInstance = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: isPoints ? 'Ideal Remaining Points' : 'Ideal Remaining Hours',
            data: idealData,
            borderColor: '#94a3b8',
            borderDash: [6, 6],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.1,
          },
          {
            label: isPoints ? 'Actual Remaining Points' : 'Actual Remaining Hours',
            data: actualData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: '#2563eb',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            fill: true,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 14,
              font: { family: "'Inter', sans-serif", size: 12, weight: 500 },
            },
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            callbacks: {
              label(context) {
                const unit = isPoints ? 'pts' : 'hrs';
                return ` ${context.dataset.label}: ${context.parsed.y} ${unit}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: isPoints ? 'Story Points Remaining' : 'Effort Hours Remaining',
              font: { size: 12, weight: 600 },
            },
            ticks: { font: { size: 11 } },
          },
        },
      },
    });
  },

  /**
   * Renders the Velocity chart across historical sprints
   * @param {string} canvasId
   * @param {Array} velocityRecords - Output from /velocity
   */
  renderVelocityChart(canvasId, velocityRecords = []) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;

    if (this.velocityChartInstance) {
      this.velocityChartInstance.destroy();
      this.velocityChartInstance = null;
    }

    const sorted = [...velocityRecords].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const labels = sorted.map((r) => r.sprintName.replace(/Sprint\s+/i, 'S'));
    const committed = sorted.map((r) => r.committedPoints);
    const completed = sorted.map((r) => r.completedPoints);

    const ctx = canvas.getContext('2d');
    this.velocityChartInstance = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Committed Points',
            data: committed,
            backgroundColor: 'rgba(148, 163, 184, 0.4)',
            borderColor: '#94a3b8',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Delivered Points',
            data: completed,
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            borderColor: '#059669',
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 14,
              font: { family: "'Inter', sans-serif", size: 12, weight: 500 },
            },
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
          },
        },
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Story Points',
              font: { size: 12, weight: 600 },
            },
          },
        },
      },
    });
  },
};
