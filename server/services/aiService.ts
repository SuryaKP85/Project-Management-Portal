import { GeminiAIProvider } from '../ai/providers/geminiProvider';
import { LocalRuleAIProvider } from '../ai/providers/localRuleProvider';
import { AIProvider, AIProviderResponse, ExecutiveReportInput } from '../ai/providers/baseProvider';

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

  /** Sprint 13 — executive brief, with the same provider-then-LocalRule fallback. */
  async generateExecutiveReport(input: ExecutiveReportInput): Promise<AIProviderResponse> {
    const provider = this.getProvider();
    try {
      return await provider.generateExecutiveReport(input);
    } catch (err) {
      return await LocalRuleAIProvider.generateExecutiveReport(input);
    }
  },

  /**
   * Sprint 18 — requirement decomposition. Structured output is required, so
   * only a provider that implements it is used, and failures are reported to
   * the caller: there is deliberately no LocalRule fallback here (other AI
   * features keep theirs).
   */
  canDecompose(): boolean {
    return GeminiAIProvider.isAvailable() && typeof GeminiAIProvider.decomposeRequirement === 'function';
  },

  async decomposeRequirement(context: Record<string, unknown>): Promise<AIProviderResponse> {
    if (!this.canDecompose()) throw new Error('No AI provider that supports decomposition is configured.');
    return GeminiAIProvider.decomposeRequirement!(context);
  },

  /** Sprint 19 — story refinement: structured output required, no LocalRule fallback (as for decomposition). */
  canRefineStory(): boolean {
    return GeminiAIProvider.isAvailable() && typeof GeminiAIProvider.refineStory === 'function';
  },

  async refineStory(context: Record<string, unknown>): Promise<AIProviderResponse> {
    if (!this.canRefineStory()) throw new Error('No AI provider that supports story refinement is configured.');
    return GeminiAIProvider.refineStory!(context);
  },
};
