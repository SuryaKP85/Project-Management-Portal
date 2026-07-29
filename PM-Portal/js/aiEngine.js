/* aiEngine.js - Core Modular AI Decision Support Engine & Abstraction Layer */

import { Storage } from './storage.js';
import { Calculations } from './calculations.js';

/**
 * AI Provider Interface Strategy Pattern
 * Allows plugging external APIs (Gemini, OpenAI, Azure OpenAI, Claude) seamlessly in the future
 * while operating natively with high-precision Local JS Rules and Statistical Models.
 */
class BaseAIProvider {
  constructor(name) {
    this.name = name;
  }
  async analyze(data) { throw new Error('Provider must implement analyze()'); }
  async generateEmail(template, params) { throw new Error('Provider must implement generateEmail()'); }
  async parseQuery(query, context) { throw new Error('Provider must implement parseQuery()'); }
}

class LocalRuleAIProvider extends BaseAIProvider {
  constructor() {
    super('Local Rule Engine');
  }

  async analyze(data) {
    return {
      timestamp: new Date().toISOString(),
      provider: this.name,
      status: 'success'
    };
  }
}

/**
 * Future API Provider Stubs for seamless enterprise cloud migration
 */
class GeminiAIProvider extends BaseAIProvider {
  constructor(apiKey) {
    super('Google Gemini API');
    this.apiKey = apiKey;
  }
}

class OpenAIAIProvider extends BaseAIProvider {
  constructor(apiKey) {
    super('OpenAI API');
    this.apiKey = apiKey;
  }
}

export const AIEngine = {
  activeProvider: new LocalRuleAIProvider(),
  futureProviders: {
    gemini: GeminiAIProvider,
    openai: OpenAIAIProvider
  },

  /**
   * Set active AI Provider
   * @param {BaseAIProvider} provider 
   */
  setProvider(provider) {
    this.activeProvider = provider;
    console.log(`AI Engine provider switched to: ${provider.name}`);
  },

  // ==========================================
  // 1. SMART PROJECT HEALTH SCORING (0 - 100)
  // ==========================================

  /**
   * Evaluates a project's holistic health score (0-100) and status
   * Factors: Completion %, Date schedule variance, Risks, Blocked stories, Pending QA, SOW, Leaves, Weekend support
   * @param {object} project 
   * @returns {object} Health breakdown
   */
  calculateProjectHealth(project) {
    if (!project) return { score: 0, status: 'Critical', statusClass: 'danger', factors: [] };

    const userStories = Storage.getUserStories().filter(s => s.projectId === project.id);
    const risks = Storage.getRisks().filter(r => r.projectId === project.id);
    const timeLogs = Storage.getTimeLogs().filter(t => t.projectId === project.id);
    const weekendWork = Storage.getWeekendWork().filter(w => w.projectId === project.id);

    let score = 100;
    const factors = [];

    // 1. Completion vs Date Schedule (Weight: 25)
    const expectedTimeProgress = Calculations.dateProgress(project.estimatedStart, project.estimatedEnd);
    const actualProgress = project.progress || 0;
    const scheduleLag = expectedTimeProgress - actualProgress;

    if (scheduleLag > 20) {
      score -= 25;
      factors.push({ type: 'danger', text: `Severe schedule delay (Lagging ${scheduleLag}% behind timeline)` });
    } else if (scheduleLag > 10) {
      score -= 15;
      factors.push({ type: 'warning', text: `Moderate schedule delay (${scheduleLag}% behind expected timeline)` });
    } else if (scheduleLag < -10) {
      score += 5; // Ahead of schedule
      factors.push({ type: 'success', text: `Ahead of schedule by Math.abs(scheduleLag)%` });
    }

    // 2. Remaining Hours vs Timeline (Weight: 20)
    const daysLeft = Calculations.daysRemaining(project.estimatedEnd);
    const hoursLeft = project.hoursRemaining || 0;
    const requiredDailyBurn = daysLeft > 0 ? (hoursLeft / daysLeft).toFixed(1) : hoursLeft;

    if (daysLeft === 0 && hoursLeft > 0) {
      score -= 35;
      factors.push({ type: 'danger', text: `Overdue! ${hoursLeft} hours remaining past deadline` });
    } else if (requiredDailyBurn > 12) {
      score -= 20;
      factors.push({ type: 'danger', text: `Unrealistic daily burn rate required: ${requiredDailyBurn}h/day` });
    } else if (requiredDailyBurn > 8) {
      score -= 10;
      factors.push({ type: 'warning', text: `High daily burn rate needed: ${requiredDailyBurn}h/day` });
    }

    // 3. Blocked User Stories (Weight: 15)
    const blockedStories = userStories.filter(s => s.isBlocked);
    if (blockedStories.length > 0) {
      const penalty = Math.min(25, blockedStories.length * 8);
      score -= penalty;
      factors.push({ type: 'danger', text: `${blockedStories.length} blocked story ticket(s) require unblocking` });
    }

    // 4. Pending QA Stories (Weight: 10)
    const pendingQA = userStories.filter(s => s.status === 'Testing' || s.status === 'QA Review');
    if (pendingQA.length > 3) {
      score -= 10;
      factors.push({ type: 'warning', text: `QA Bottleneck: ${pendingQA.length} stories awaiting QA verification` });
    }

    // 5. High / Critical Risks (Weight: 15)
    const criticalRisks = risks.filter(r => (r.impact === 'High' || r.impact === 'Critical') && r.status !== 'Mitigated');
    if (criticalRisks.length > 0) {
      score -= criticalRisks.length * 10;
      factors.push({ type: 'danger', text: `${criticalRisks.length} unmitigated High/Critical risk(s) logged` });
    }

    // 6. SOW Approval Status (Weight: 10)
    if (project.sowStatus && project.sowStatus !== 'Approved') {
      score -= 15;
      factors.push({ type: 'warning', text: `SOW Status is '${project.sowStatus}' (Pending Executive Sign-off)` });
    }

    // 7. Weekend Support Buffer Bonus
    if (weekendWork.length > 0) {
      score = Math.min(100, score + 5);
      factors.push({ type: 'info', text: `Weekend delivery shift scheduled (${weekendWork.length} resources)` });
    }

    // Clamp score 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Status Label
    let status = 'Healthy';
    let statusClass = 'success';
    let badgeBg = 'bg-success-subtle text-success border-success-subtle';

    if (score >= 90) {
      status = 'Excellent';
      statusClass = 'success';
      badgeBg = 'bg-success-subtle text-success border-success-subtle';
    } else if (score >= 75) {
      status = 'Healthy';
      statusClass = 'success';
      badgeBg = 'bg-success-subtle text-success border-success-subtle';
    } else if (score >= 60) {
      status = 'Monitor';
      statusClass = 'info';
      badgeBg = 'bg-info-subtle text-info border-info-subtle';
    } else if (score >= 45) {
      status = 'At Risk';
      statusClass = 'warning';
      badgeBg = 'bg-warning-subtle text-warning border-warning-subtle';
    } else {
      status = 'Critical';
      statusClass = 'danger';
      badgeBg = 'bg-danger-subtle text-danger border-danger-subtle';
    }

    return {
      score,
      status,
      statusClass,
      badgeBg,
      factors,
      metrics: {
        daysLeft,
        hoursLeft,
        requiredDailyBurn,
        blockedCount: blockedStories.length,
        pendingQACount: pendingQA.length
      }
    };
  },

  // ==========================================
  // 2. CUSTOMER HEALTH SCORE (0 - 100)
  // ==========================================

  /**
   * Automatically determines customer health score and status
   * @param {object} customer 
   * @returns {object} Customer Health
   */
  calculateCustomerHealth(customer) {
    if (!customer) return { score: 100, status: 'Healthy', badgeBg: 'bg-success-subtle text-success' };

    const allProjects = Storage.getProjects();
    const customerProjects = allProjects.filter(p => p.clientId === customer.id || p.clientName === customer.name);

    let score = 100;
    const risks = [];

    // Escalation penalty
    if (customer.escalationsCount && customer.escalationsCount > 0) {
      score -= customer.escalationsCount * 20;
      risks.push(`${customer.escalationsCount} active executive customer escalation(s)`);
    }

    // Project delay penalty
    const delayedProjects = customerProjects.filter(p => {
      const health = this.calculateProjectHealth(p);
      return health.status === 'At Risk' || health.status === 'Critical';
    });

    if (delayedProjects.length > 0) {
      score -= delayedProjects.length * 15;
      risks.push(`${delayedProjects.length} project(s) currently At Risk / Critical`);
    }

    // Pending SOW penalty
    const pendingSow = customerProjects.filter(p => p.sowStatus && p.sowStatus !== 'Approved');
    if (pendingSow.length > 0) {
      score -= pendingSow.length * 10;
      risks.push(`${pendingSow.length} pending SOW contracts requiring agreement`);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let status = 'Healthy';
    let badgeBg = 'bg-success-subtle text-success border-success-subtle';

    if (score < 50) {
      status = 'Critical';
      badgeBg = 'bg-danger-subtle text-danger border-danger-subtle';
    } else if (score < 75) {
      status = 'Needs Attention';
      badgeBg = 'bg-warning-subtle text-warning border-warning-subtle';
    }

    return {
      score,
      status,
      badgeBg,
      risks,
      activeProjectsCount: customerProjects.length
    };
  },

  // ==========================================
  // 3. RESOURCE AI & CAPACITY ANALYZER
  // ==========================================

  /**
   * Analyzes utilization, leaves, burnout risks, and capacity
   * @returns {object} Resource AI Analysis
   */
  analyzeResources() {
    const resources = Storage.getResources();
    const leaves = Storage.getLeaves();
    const weekendWork = Storage.getWeekendWork();

    const overloaded = [];
    const underutilized = [];
    const onLeaveUpcoming = [];
    const recommendations = [];

    resources.forEach(r => {
      const allocation = r.allocationPercentage || 100;
      if (allocation > 100) {
        overloaded.push(r);
        recommendations.push({
          priority: 'High',
          type: 'resource_overload',
          targetResource: r.name,
          currentAllocation: allocation,
          message: `${r.name} (${r.role}) is over-allocated at ${allocation}%. Recommend redistributing ${allocation - 100}% workload to available teammates.`,
          actionLabel: `Rebalance ${r.name}`,
          execute: (app) => this.autoBalanceResource(r.id, app)
        });
      } else if (allocation < 60) {
        underutilized.push(r);
      }
    });

    // Check leaves
    const today = new Date();
    const next7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    leaves.forEach(l => {
      const start = new Date(l.startDate);
      if (start >= today && start <= next7Days && l.status === 'Approved') {
        onLeaveUpcoming.push(l);
        recommendations.push({
          priority: 'Medium',
          type: 'upcoming_leave',
          targetResource: l.resourceName,
          message: `${l.resourceName} is on approved leave from ${l.startDate} to ${l.endDate}. Ensure backup coverage for active tasks.`,
          actionLabel: 'Assign Backup',
          execute: (app) => app.switchPage('resource-planner')
        });
      }
    });

    return {
      totalResources: resources.length,
      overloadedCount: overloaded.length,
      underutilizedCount: underutilized.length,
      upcomingLeavesCount: onLeaveUpcoming.length,
      overloaded,
      underutilized,
      recommendations
    };
  },

  /**
   * Auto-balances workload from an overloaded resource
   */
  autoBalanceResource(resourceId, appInstance) {
    const resources = Storage.getResources();
    const target = resources.find(r => r.id === resourceId);
    if (!target) return;

    const excess = (target.allocationPercentage || 100) - 100;
    target.allocationPercentage = 100;
    Storage.saveResources(resources);

    // Find peer in same department
    const peer = resources.find(r => r.id !== resourceId && r.department === target.department && (r.allocationPercentage || 100) < 100);
    if (peer) {
      peer.allocationPercentage = Math.min(100, (peer.allocationPercentage || 50) + excess);
      Storage.saveResources(resources);
      appInstance.showToast(`Rebalanced ${excess}% capacity from ${target.name} to ${peer.name}`, 'success');
    } else {
      appInstance.showToast(`Reduced ${target.name}'s allocation to 100%`, 'success');
    }
  },

  // ==========================================
  // 4. PROJECT FORECAST & PREDICTIVE ANALYTICS
  // ==========================================

  /**
   * Predicts completion date, delay, burn rate, schedule variance, cost overrun
   * @param {object} project 
   * @returns {object} Predictive Forecast
   */
  forecastProject(project) {
    if (!project) return null;

    const daysRemaining = Calculations.daysRemaining(project.estimatedEnd);
    const hoursRemaining = project.hoursRemaining || 0;
    const progress = project.progress || 0;
    const totalBudget = project.budget || 0;

    // Daily velocity calculation (based on average 6 hours/day per active PM/Dev)
    const estimatedDailyBurn = 7.5; // standard team hours/day
    const daysToComplete = hoursRemaining > 0 ? Math.ceil(hoursRemaining / estimatedDailyBurn) : 0;

    const projectedEndDate = new Date();
    projectedEndDate.setDate(projectedEndDate.getDate() + daysToComplete);

    const actualEnd = new Date(project.estimatedEnd);
    const delayDays = Math.max(0, Math.ceil((projectedEndDate.getTime() - actualEnd.getTime()) / (1000 * 60 * 60 * 24)));

    const onTimeLikelihood = delayDays === 0 ? Math.min(98, 85 + Math.round(progress / 5)) : Math.max(12, 90 - (delayDays * 12));
    const confidencePercent = Math.min(96, 70 + Math.round(progress * 0.25));

    // Effort and Cost Variance
    const hourlyRate = 85; // Standard blended enterprise rate $85/hr
    const estimatedCostRemaining = hoursRemaining * hourlyRate;
    const expectedCostOverrun = delayDays > 0 ? (delayDays * estimatedDailyBurn * hourlyRate) : 0;
    const totalProjectedCost = totalBudget + expectedCostOverrun;

    return {
      projectId: project.id,
      projectName: project.name,
      daysRemaining,
      hoursRemaining,
      daysToComplete,
      projectedEndDate: projectedEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      estimatedDelayDays: delayDays,
      onTimeLikelihood,
      confidencePercent,
      burnRateHoursPerDay: estimatedDailyBurn,
      scheduleVarianceDays: delayDays > 0 ? `+${delayDays} days` : 'On Schedule',
      effortVarianceHours: delayDays * estimatedDailyBurn,
      estimatedCostRemaining,
      expectedCostOverrun,
      totalProjectedCost
    };
  },

  // ==========================================
  // 5. NATURAL LANGUAGE SEARCH PARSER ENGINE
  // ==========================================

  /**
   * Parses natural language query strings into actionable search results & dashboard filters
   * Examples:
   * "Which projects are delayed?"
   * "Which developer has the highest utilization?"
   * "Show Bosch projects"
   * "Pending SOW"
   * "Stories exceeding estimates"
   * @param {string} query 
   * @returns {object} Query execution result
   */
  parseNaturalLanguageQuery(query) {
    if (!query || typeof query !== 'string') return null;

    const q = query.toLowerCase().trim();
    const projects = Storage.getProjects();
    const resources = Storage.getResources();
    const stories = Storage.getUserStories();
    const customers = Storage.getCustomers();
    const weekendWork = Storage.getWeekendWork();

    let matchedCategory = 'General Search';
    let results = [];
    let summaryText = '';

    if (q.includes('delayed') || q.includes('late') || q.includes('miss') || q.includes('behind')) {
      matchedCategory = 'Delayed Projects Filter';
      results = projects.filter(p => {
        const h = this.calculateProjectHealth(p);
        return h.status === 'At Risk' || h.status === 'Critical' || Calculations.daysRemaining(p.estimatedEnd) === 0;
      });
      summaryText = `Found ${results.length} project(s) experiencing schedule delay or critical risk status.`;
    } 
    else if (q.includes('utilization') || q.includes('overload') || q.includes('capacity') || q.includes('highest utilization')) {
      matchedCategory = 'Resource Utilization Analysis';
      results = [...resources].sort((a, b) => (b.allocationPercentage || 0) - (a.allocationPercentage || 0));
      summaryText = `Top allocated resource: ${results[0]?.name || 'N/A'} at ${results[0]?.allocationPercentage || 100}% capacity.`;
    }
    else if (q.includes('sow') || q.includes('pending sow') || q.includes('contract')) {
      matchedCategory = 'Pending SOW Contracts';
      results = projects.filter(p => p.sowStatus && p.sowStatus !== 'Approved');
      summaryText = `Found ${results.length} project(s) awaiting executive SOW contract approval.`;
    }
    else if (q.includes('weekend') || q.includes('saturday') || q.includes('sunday')) {
      matchedCategory = 'Weekend Work Shifts';
      results = weekendWork;
      summaryText = `Found ${results.length} scheduled weekend shift assignments across portfolio.`;
    }
    else if (q.includes('exceeding') || q.includes('estimate') || q.includes('over budget')) {
      matchedCategory = 'Stories Exceeding Estimates';
      results = stories.filter(s => (s.loggedHours || 0) > (s.estimatedHours || 0));
      summaryText = `Found ${results.length} user story ticket(s) exceeding initial time estimates.`;
    }
    else if (q.includes('available') || q.includes('free') || q.includes('next week')) {
      matchedCategory = 'Available Resources';
      results = resources.filter(r => (r.allocationPercentage || 100) <= 75);
      summaryText = `Found ${results.length} team member(s) with available headroom capacity next week.`;
    }
    else {
      // Name search across projects and customers
      const matchProj = projects.filter(p => p.name.toLowerCase().includes(q) || p.clientName?.toLowerCase().includes(q));
      const matchCust = customers.filter(c => c.name.toLowerCase().includes(q));
      results = [...matchProj, ...matchCust];
      summaryText = `Found ${results.length} matching entity record(s) for "${query}".`;
    }

    return {
      query,
      category: matchedCategory,
      summaryText,
      resultsCount: results.length,
      results
    };
  },

  // ==========================================
  // 6. VOICE COMMAND ARCHITECTURE HOOKS
  // ==========================================

  voiceState: {
    isListening: false,
    recognition: null
  },

  isVoiceSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  },

  initVoiceListener(onCommandRecognized) {
    if (!this.isVoiceSupported()) {
      console.warn('Speech Recognition API is not supported in this browser.');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.voiceState.recognition = new SpeechRecognition();
    this.voiceState.recognition.continuous = false;
    this.voiceState.recognition.interimResults = false;
    this.voiceState.recognition.lang = 'en-US';

    this.voiceState.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log('Voice Command Recognized:', transcript);
      if (onCommandRecognized) onCommandRecognized(transcript);
    };

    return true;
  },

  toggleVoiceSearch(onCommandRecognized) {
    if (!this.voiceState.recognition) {
      this.initVoiceListener(onCommandRecognized);
    }

    if (this.voiceState.isListening) {
      this.voiceState.recognition.stop();
      this.voiceState.isListening = false;
    } else {
      this.voiceState.recognition.start();
      this.voiceState.isListening = true;
    }
    return this.voiceState.isListening;
  }
};
