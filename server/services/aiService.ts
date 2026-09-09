import { GeminiAIProvider } from '../ai/providers/geminiProvider';
import { LocalRuleAIProvider } from '../ai/providers/localRuleProvider';
import { AIProvider, AIProviderResponse } from '../ai/providers/baseProvider';

export const AIService = {
  getProvider(preferred?: string): AIProvider {
    if (preferred === 'gemini' && GeminiAIProvider.isAvailable()) {
      return GeminiAIProvider;
    }
    if (GeminiAIProvider.isAvailable()) {
      return GeminiAIProvider;
    }
    return LocalRuleAIProvider;
  },

  async query(prompt: string, context?: Record<string, any>, preferredProvider?: string): Promise<AIProviderResponse> {
    const provider = this.getProvider(preferredProvider);
    try {
      return await provider.query(prompt, context);
    } catch (err: any) {
      console.warn(`Primary AI provider (${provider.name}) failed, falling back to Local Rule provider:`, err.message);
      return await LocalRuleAIProvider.query(prompt, context);
    }
  },

  async getProjectInsights(project: Record<string, any>): Promise<AIProviderResponse> {
    const provider = this.getProvider();
    try {
      return await provider.generateProjectInsights(project);
    } catch (err) {
      return await LocalRuleAIProvider.generateProjectInsights(project);
    }
  },

  async draftExecutiveEmail(context: { project: string; client: string; status: string; keyHighlights: string[] }): Promise<AIProviderResponse> {
    const provider = this.getProvider();
    try {
      return await provider.draftExecutiveEmail(context);
    } catch (err) {
      return await LocalRuleAIProvider.draftExecutiveEmail(context);
    }
  },
};
