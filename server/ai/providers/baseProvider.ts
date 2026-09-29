export interface AIProviderResponse {
  provider: 'gemini' | 'local-rules' | 'openai';
  text: string;
  recommendations?: Array<{
    category: string;
    title: string;
    description: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    actionPayload?: Record<string, any>;
  }>;
  suggestedActions?: string[];
  metadata?: Record<string, any>;
}

/**
 * Sprint 13 — executive report input. Built server-side from the caller's
 * authorised AI context: deterministic figures plus the already-whitelisted
 * project projections. Nothing here comes from the browser except `period`,
 * which is validated against a fixed list.
 */
export interface ExecutiveReportInput {
  period: 'weekly' | 'monthly' | 'quarterly';
  figures: Record<string, any>;
  projects: Array<Record<string, any>>;
}

export interface AIProvider {
  name: string;
  isAvailable(): boolean;
  query(prompt: string, context?: Record<string, any>): Promise<AIProviderResponse>;
  generateProjectInsights(project: Record<string, any>): Promise<AIProviderResponse>;
  draftExecutiveEmail(context: { project: string; client: string; status: string; keyHighlights: string[] }): Promise<AIProviderResponse>;
  generateExecutiveReport(input: ExecutiveReportInput): Promise<AIProviderResponse>;
}
