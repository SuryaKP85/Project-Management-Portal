import { AIProvider, AIProviderResponse } from './baseProvider';

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

  async generateProjectInsights(project: Record<string, any>): Promise<AIProviderResponse> {
    return {
      provider: 'local-rules',
      text: `Project ${project.name || 'PRJ'} is currently at ${project.progress || 0}% progress with ${project.risk || 'Low'} risk status.`,
      recommendations: [
        {
          category: 'Schedule Control',
          title: 'Sprint Variance Check',
          description: 'Ensure deliverables for current sprint meet the agreed SOW milestones.',
          urgency: project.risk === 'Critical' ? 'critical' : 'medium',
        },
      ],
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
};
