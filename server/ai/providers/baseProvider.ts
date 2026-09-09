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

export interface AIProvider {
  name: string;
  isAvailable(): boolean;
  query(prompt: string, context?: Record<string, any>): Promise<AIProviderResponse>;
  generateProjectInsights(project: Record<string, any>): Promise<AIProviderResponse>;
  draftExecutiveEmail(context: { project: string; client: string; status: string; keyHighlights: string[] }): Promise<AIProviderResponse>;
}
