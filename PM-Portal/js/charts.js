/* charts.js - Modern Chart.js orchestrator for light/dark theme-adaptive executive reports */

export const Charts = {
  instances: {},

  /**
   * Generates color palette configurations synced with the "Sleek Interface" variables
   */
  getThemeConfig() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    // Core theme color tokens
    const primary = '#4f46e5';   // Indigo
    const success = '#10b981';   // Emerald
    const warning = '#f59e0b';   // Amber
    const danger = '#ef4444';    // Red
    const info = '#06b6d4';      // Cyan
    const secondary = isDark ? '#475569' : '#94a3b8'; // Slate colors
    
    return {
      isDark,
      textColor: isDark ? '#94a3b8' : '#64748b',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
      tooltipBg: isDark ? '#1e293b' : '#ffffff',
      tooltipBorder: isDark ? '#334155' : '#e2e8f0',
      tooltipColor: isDark ? '#f8fafc' : '#0f172a',
      colors: {
        primary,
        success,
        warning,
        danger,
        info,
        secondary,
        palette: [primary, success, warning, info, danger, secondary]
      }
    };
  },

  /**
   * Standardizes Chart.js options for cohesive fonts, ticks, grids, and responsiveness
   */
  getDefaultOptions(title, config, extraOptions = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: config.textColor,
            font: {
              family: "'Plus Jakarta Sans', sans-serif",
              size: 11,
              weight: '500'
            },
            padding: 15,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: config.tooltipBg,
          titleColor: config.textColor,
          bodyColor: config.tooltipColor,
          borderColor: config.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleFont: {
            family: "'Plus Jakarta Sans', sans-serif",
            weight: '700'
          },
          bodyFont: {
            family: "'Plus Jakarta Sans', sans-serif"
          },
          boxPadding: 6,
          usePointStyle: true
        }
      },
      ...extraOptions
    };
  },

  /**
   * Helper to register a new Chart.js instance safely destroying pre-existing ones
   */
  registerInstance(id, chart) {
    if (this.instances[id]) {
      this.instances[id].destroy();
    }
    this.instances[id] = chart;
  },

  /**
   * Cleans up all chart instances to prevent canvas binding leaks
   */
  destroyAll() {
    Object.keys(this.instances).forEach(key => {
      if (this.instances[key]) {
        this.instances[key].destroy();
        this.instances[key] = null;
      }
    });
  },

  /* ==========================================
     EXECUTIVE CHART GENERATION METHODS
     ========================================== */

  /**
   * 1. Customer-wise Projects (Bar Chart)
   */
  renderCustomerProjects(canvasId, dummyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config = this.getThemeConfig();
    const labels = dummyData ? dummyData.map(d => d.label) : ['AeroSpace Inc.', 'Defense Lab', 'Speedy Delivery', 'Global Bank Corp.', 'GreenField Farms'];
    const values = dummyData ? dummyData.map(d => d.value) : [12, 8, 15, 5, 2];

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Projects Count',
          data: values,
          backgroundColor: config.colors.primary,
          hoverBackgroundColor: '#4338ca',
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 32
        }]
      },
      options: this.getDefaultOptions('Customer Projects', config, {
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } }
          },
          y: {
            grid: { color: config.gridColor },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" }, precision: 0 }
          }
        },
        plugins: {
          legend: { display: false }
        }
      })
    });

    this.registerInstance(canvasId, chart);
  },

  /**
   * 2. Project Status (Doughnut Chart)
   */
  renderProjectStatus(canvasId, dummyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config = this.getThemeConfig();
    const labels = dummyData ? dummyData.map(d => d.label) : ['In Progress', 'Completed', 'Planning', 'On Hold', 'Delayed', 'Critical'];
    const values = dummyData ? dummyData.map(d => d.value) : [18, 20, 10, 4, 3, 1];
    
    const colors = [
      config.colors.primary,
      config.colors.success,
      config.colors.secondary,
      config.colors.info,
      config.colors.warning,
      config.colors.danger
    ];

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: config.isDark ? 3 : 2,
          borderColor: config.isDark ? '#1e293b' : '#ffffff',
          hoverOffset: 6
        }]
      },
      options: this.getDefaultOptions('Project Status', config, {
        cutout: '65%'
      })
    });

    this.registerInstance(canvasId, chart);
  },

  /**
   * 3. Priority Distribution (Pie Chart)
   */
  renderProjectPriority(canvasId, dummyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config = this.getThemeConfig();
    const labels = dummyData ? dummyData.map(d => d.label) : ['High Priority', 'Medium Priority', 'Low Priority'];
    const values = dummyData ? dummyData.map(d => d.value) : [15, 20, 7];

    const colors = [
      config.colors.danger,
      config.colors.warning,
      config.colors.primary
    ];

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: config.isDark ? 3 : 2,
          borderColor: config.isDark ? '#1e293b' : '#ffffff'
        }]
      },
      options: this.getDefaultOptions('Priority', config)
    });

    this.registerInstance(canvasId, chart);
  },

  /**
   * 4. Risk Assessment (Bar Chart)
   */
  renderProjectRisk(canvasId, dummyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config = this.getThemeConfig();
    const labels = dummyData ? dummyData.map(d => d.label) : ['Critical', 'High', 'Medium', 'Low'];
    const values = dummyData ? dummyData.map(d => d.value) : [2, 5, 12, 18];

    const colors = [
      config.colors.danger,
      config.colors.warning,
      config.colors.primary,
      config.colors.success
    ];

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Risks Logged',
          data: values,
          backgroundColor: colors,
          borderRadius: 6,
          maxBarThickness: 32
        }]
      },
      options: this.getDefaultOptions('Risk Overview', config, {
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } }
          },
          y: {
            grid: { color: config.gridColor },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" }, precision: 0 }
          }
        },
        plugins: {
          legend: { display: false }
        }
      })
    });

    this.registerInstance(canvasId, chart);
  },

  /**
   * 5. Monthly Deliveries (Line Chart)
   */
  renderMonthlyDeliveries(canvasId, dummyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config = this.getThemeConfig();
    const labels = dummyData ? dummyData.map(d => d.label) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const values = dummyData ? dummyData.map(d => d.value) : [3, 5, 4, 7, 8, 12, 10, 9, 11, 14, 13, 16];

    const ctx = canvas.getContext('2d');
    
    // Gradient fill beneath line
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Milestones Completed',
          data: values,
          borderColor: config.colors.info,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: config.colors.info,
          pointBorderColor: config.isDark ? '#1e293b' : '#ffffff',
          pointBorderWidth: 2,
          pointHoverRadius: 6
        }]
      },
      options: this.getDefaultOptions('Deliveries', config, {
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } }
          },
          y: {
            grid: { color: config.gridColor },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" }, precision: 0 }
          }
        }
      })
    });

    this.registerInstance(canvasId, chart);
  },

  /**
   * 6. Department Effort (FTE) (Polar Area Chart)
   */
  renderDeptEffort(canvasId, dummyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config = this.getThemeConfig();
    const labels = dummyData ? dummyData.map(d => d.label) : ['Engineering', 'Design', 'QA / Test', 'Product', 'Operations'];
    const values = dummyData ? dummyData.map(d => d.value) : [45, 15, 25, 10, 12];

    const colors = [
      'rgba(79, 70, 229, 0.75)',   // primary
      'rgba(245, 158, 11, 0.75)',  // warning
      'rgba(16, 185, 129, 0.75)',  // success
      'rgba(6, 182, 212, 0.75)',   // info
      'rgba(71, 85, 105, 0.75)'    // secondary
    ];

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'polarArea',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: config.isDark ? 2 : 1,
          borderColor: config.isDark ? '#334155' : '#e2e8f0'
        }]
      },
      options: this.getDefaultOptions('Dept Effort', config, {
        scales: {
          r: {
            grid: { color: config.gridColor },
            ticks: { 
              backdropColor: 'transparent',
              color: config.textColor,
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 9 }
            }
          }
        }
      })
    });

    this.registerInstance(canvasId, chart);
  },

  /**
   * 7. Remaining Hours by Team (Bar Chart)
   */
  renderRemainingHours(canvasId, dummyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config = this.getThemeConfig();
    const labels = dummyData ? dummyData.map(d => d.label) : ['Engineering', 'Design', 'QA / Test', 'Operations'];
    const values = dummyData ? dummyData.map(d => d.value) : [540, 180, 320, 200];

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Hours Remaining',
          data: values,
          backgroundColor: config.colors.warning,
          borderRadius: 6,
          maxBarThickness: 40
        }]
      },
      options: this.getDefaultOptions('Remaining Hours', config, {
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } }
          },
          y: {
            grid: { color: config.gridColor },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } }
          }
        },
        plugins: {
          legend: { display: false }
        }
      })
    });

    this.registerInstance(canvasId, chart);
  },

  /**
   * 8. Resource Utilization (Horizontal Bar Chart)
   */
  renderResourceUtilization(canvasId, dummyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config = this.getThemeConfig();
    const labels = dummyData ? dummyData.map(d => d.label) : ['Lead Architects', 'Fullstack Devs', 'UX Designers', 'QA Engineers', 'Product Managers'];
    const values = dummyData ? dummyData.map(d => d.value) : [95, 100, 75, 60, 85];

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Utilization %',
          data: values,
          backgroundColor: config.colors.success,
          borderRadius: 6,
          maxBarThickness: 20
        }]
      },
      options: this.getDefaultOptions('Utilization', config, {
        indexAxis: 'y',
        scales: {
          x: {
            grid: { color: config.gridColor },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } },
            max: 110
          },
          y: {
            grid: { display: false },
            ticks: { color: config.textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } }
          }
        },
        plugins: {
          legend: { display: false }
        }
      })
    });

    this.registerInstance(canvasId, chart);
  },

  /**
   * 9. SOW Status (Doughnut Chart)
   */
  renderSOWStatus(canvasId, dummyData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const config = this.getThemeConfig();
    const labels = dummyData ? dummyData.map(d => d.label) : ['Approved', 'Pending Sign-off', 'Under Draft', 'In Review'];
    const values = dummyData ? dummyData.map(d => d.value) : [24, 5, 8, 5];

    const colors = [
      config.colors.success,
      config.colors.warning,
      config.colors.info,
      config.colors.primary
    ];

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: config.isDark ? 3 : 2,
          borderColor: config.isDark ? '#1e293b' : '#ffffff',
          hoverOffset: 6
        }]
      },
      options: this.getDefaultOptions('SOW Status', config, {
        cutout: '60%'
      })
    });

    this.registerInstance(canvasId, chart);
  }
};
