import { AIProvider, AIProviderResponse, ExecutiveReportInput } from './baseProvider';

export const LocalRuleAIProvider: AIProvider = {
  name: 'local-rules',

  isAvailable(): boolean {
    return true;
  },

  async query(prompt: string, context?: Record<string, any>): Promise<AIProviderResponse> {
    const p = prompt.toLowerCase();

    if (p.includes('risk') || p.includes('escalat') || p.includes('block')) {
      return {
        provider: 'local-rules',
        text: 'Identified 1 project requiring immediate SOW sign-off (PRJ-103) and 2 potential schedule compression points. Recommend reviewing QA bottlenecks in Sprint 18.',
        recommendations: [
          {
            category: 'Risk Mitigation',
            title: 'SOW Executive Clearance',
            description: 'Fast-track executive sign-off for Orion Life Support Automation to unblock procurement.',
            urgency: 'critical',
          },
          {
            category: 'Capacity Balancing',
            title: 'QA Reallocation',
            description: 'Reallocate 20 hours from Artemis Comms QA to Titan Propulsion Telemetry.',
            urgency: 'high',
          },
        ],
        suggestedActions: ['Open Action Center', 'Review SOW Status', 'Rebalance QA Allocation'],
      };
    }

    if (p.includes('capacity') || p.includes('overload') || p.includes('resource')) {
      return {
        provider: 'local-rules',
        text: 'Engineering Core team capacity is currently at 82%. Quality Assurance is operating at 87% utilization with 2 developers exceeding 40h/week.',
        recommendations: [
          {
            category: 'Resource Allocation',
            title: 'Load Balancing',
            description: 'Redistribute weekend deployment shifts to avoid burn-out on critical path developers.',
            urgency: 'medium',
          },
        ],
        suggestedActions: ['View Resource Planner', 'Open Weekend Roster'],
      };
    }

    return {
      provider: 'local-rules',
      text: `Surya PM OS Heuristic Engine: Processed query regarding "${prompt.slice(0, 50)}...". All delivery metrics are tracking within baseline parameters.`,
      recommendations: [
        {
          category: 'Delivery Health',
          title: 'Weekly Baseline Health',
          description: 'Maintain current velocity of 42 story points per sprint across active products.',
          urgency: 'low',
        },
      ],
      suggestedActions: ['View Executive Dashboard', 'Generate Excel Report'],
    };
  },

  /**
   * Sprint 13: grounded in the server-built project projection (including its
   * deterministic health), so the offline answer reflects the real project
   * rather than fixed sample figures.
   */
  async generateProjectInsights(project: Record<string, any>): Promise<AIProviderResponse> {
    const name = project.name || project.code || 'This project';
    const code = project.code ? ` (${project.code})` : '';
    const health = project.health;
    const healthLine = health ? ` Deterministic health is ${health.band} (${health.score}/100).` : '';
    const factors: Array<Record<string, any>> = Array.isArray(health?.topNegativeFactors) ? health.topNegativeFactors : [];

    const recommendations: NonNullable<AIProviderResponse['recommendations']> = factors.length > 0
      ? factors.map((f) => ({
          category: 'Health Factor',
          title: String(f.label || f.id || 'Health factor'),
          description: `This factor currently lowers the health score by ${Math.abs(Number(f.impact) || 0)} points. Review it with the delivery team.`,
          urgency: Number(f.impact) <= -20 ? 'high' : 'medium',
        }))
      : [
          {
            category: 'Delivery Health',
            title: 'Maintain delivery cadence',
            description: 'No health factors are currently reducing the score. Keep monitoring schedule and governance signals.',
            urgency: 'low',
          },
        ];
    if (project.risk === 'Critical' && recommendations.length > 0) recommendations[0].urgency = 'critical';

    return {
      provider: 'local-rules',
      text: `${name}${code} is ${project.progress ?? 0}% complete with ${project.risk || 'unrated'} delivery risk.${healthLine}`,
      recommendations,
    };
  },

  async draftExecutiveEmail(context: { project: string; client: string; status: string; keyHighlights: string[] }): Promise<AIProviderResponse> {
    const text = `Subject: Executive Status Update: ${context.project} - ${context.client}

Dear Stakeholders,

Please find the executive progress summary for ${context.project}:

• Current Status: ${context.status}
• Highlights:
${context.keyHighlights.map((h) => `  - ${h}`).join('\n')}

The delivery team remains on track according to the current sprint baseline. Please let us know if you require additional breakdown reports.

Best regards,
Surya Project Management Office (PMO)`;

    return {
      provider: 'local-rules',
      text,
    };
  },

  /** Sprint 13: deterministic brief from the server-built figures only. */
  async generateExecutiveReport(input: ExecutiveReportInput): Promise<AIProviderResponse> {
    const f = input.figures || {};
    const label = input.period.charAt(0).toUpperCase() + input.period.slice(1);
    const parts: string[] = [
      `${label} executive brief: ${f.projectsIncluded ?? 0} of ${f.projectsInScope ?? 0} project(s) in your scope reviewed${f.truncated ? ' (the AI context is capped, so not every project is included)' : ''}.`,
    ];
    if (typeof f.averageProgress === 'number') parts.push(`Average progress across the reviewed projects is ${f.averageProgress}%.`);
    const attention: Array<Record<string, any>> = Array.isArray(f.attentionProjects) ? f.attentionProjects : [];
    parts.push(
      attention.length > 0
        ? `${attention.length} project(s) need attention: ${attention.slice(0, 5).map((a) => `${a.name} (${a.band}, ${a.score}/100)`).join(', ')}.`
        : 'No reviewed project is At Risk or Critical.'
    );
    if (f.governance) {
      parts.push(`Governance: ${f.governance.criticalOrHighRisks} high/critical risk(s) open, ${f.governance.openIssues} open issue(s), ${f.governance.blockedDependencies} blocked dependenc${f.governance.blockedDependencies === 1 ? 'y' : 'ies'}.`);
    }
    return { provider: 'local-rules', text: parts.join(' ') };
  },
};
