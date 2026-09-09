import { GoogleGenAI } from '@google/genai';
import { AIProvider, AIProviderResponse } from './baseProvider';

let geminiClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

export const GeminiAIProvider: AIProvider = {
  name: 'gemini',

  isAvailable(): boolean {
    return getClient() !== null;
  },

  async query(prompt: string, context?: Record<string, any>): Promise<AIProviderResponse> {
    const ai = getClient();
    if (!ai) {
      throw new Error('Gemini API key is not configured on the server.');
    }

    const systemInstruction = `You are the Surya PM Operating System AI Copilot.
You specialize in enterprise Product Management, Project Delivery, Risk Forecasting, Resource Balancing, and Executive Governance.
Provide clear, actionable, and structured insights for Project Managers and Engineering Directors.`;

    const fullPrompt = `${systemInstruction}\n\nContext:\n${JSON.stringify(context || {})}\n\nUser Question:\n${prompt}`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out after 4000ms')), 4000)
    );

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: fullPrompt,
        }),
        timeoutPromise,
      ]);

      return {
        provider: 'gemini',
        text: response.text || 'Analysis completed.',
        metadata: { model: 'gemini-3.6-flash' },
      };
    } catch (err: any) {
      console.warn('Gemini API query notice:', err.message);
      throw err;
    }
  },

  async generateProjectInsights(project: Record<string, any>): Promise<AIProviderResponse> {
    const ai = getClient();
    if (!ai) {
      throw new Error('Gemini API key is not configured.');
    }

    const prompt = `Analyze this project data and provide 3 specific risk mitigations and health recommendations:
${JSON.stringify(project, null, 2)}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });

      return {
        provider: 'gemini',
        text: response.text || '',
        recommendations: [
          {
            category: 'Risk Mitigation',
            title: 'Critical Path Review',
            description: response.text ? response.text.slice(0, 160) + '...' : 'Review sprint dependencies and critical path.',
            urgency: project.risk === 'Critical' ? 'critical' : 'medium',
          },
        ],
      };
    } catch (err: any) {
      throw err;
    }
  },

  async draftExecutiveEmail(context: { project: string; client: string; status: string; keyHighlights: string[] }): Promise<AIProviderResponse> {
    const ai = getClient();
    if (!ai) {
      throw new Error('Gemini API key is not configured.');
    }

    const prompt = `Draft a concise, professional executive weekly status email for client: ${context.client} regarding project: ${context.project}.
Current Status: ${context.status}
Key Highlights:
${context.keyHighlights.map((h) => `- ${h}`).join('\n')}

Format as:
Subject: [Project] Status Update
Dear Stakeholders,
...
Best regards,
Surya Project Management Team`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });

      return {
        provider: 'gemini',
        text: response.text || '',
        metadata: { client: context.client, project: context.project },
      };
    } catch (err: any) {
      throw err;
    }
  },
};
