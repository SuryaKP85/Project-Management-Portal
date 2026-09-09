import { AIProvider, AIProviderResponse } from './baseProvider';

export const OpenAIAIProvider: AIProvider = {
  name: 'openai',

  isAvailable(): boolean {
    return false; // Reserved for multi-provider expansion
  },

  async query(prompt: string, context?: Record<string, any>): Promise<AIProviderResponse> {
    throw new Error('OpenAI Provider is not configured in this sprint.');
  },

  async generateProjectInsights(project: Record<string, any>): Promise<AIProviderResponse> {
    throw new Error('OpenAI Provider is not configured in this sprint.');
  },

  async draftExecutiveEmail(context: { project: string; client: string; status: string; keyHighlights: string[] }): Promise<AIProviderResponse> {
    throw new Error('OpenAI Provider is not configured in this sprint.');
  },
};
