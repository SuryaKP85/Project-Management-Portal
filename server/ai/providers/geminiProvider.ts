import { GoogleGenAI } from '@google/genai';
import { AIProvider, AIProviderResponse } from './baseProvider';
import {
  PM_SYSTEM_INSTRUCTION,
  buildGuardedContents,
  taskSystemInstruction,
} from '../promptGuard';

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

    // System instructions travel in the SDK's dedicated channel; PM context and
    // the user's question are delimited and labelled as untrusted data.
    const guardedContents = buildGuardedContents(prompt, context);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out after 4000ms')), 4000)
    );

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: guardedContents,
          config: { systemInstruction: PM_SYSTEM_INSTRUCTION },
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

    const guardedContents = buildGuardedContents(
      'Provide 3 specific risk mitigations and health recommendations for the supplied project.',
      project
    );

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: guardedContents,
        config: {
          systemInstruction: taskSystemInstruction(
            'Analyse the supplied project record and return risk mitigations and health recommendations.'
          ),
        },
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

    // The project/client/status/highlight values are user-authored and are
    // therefore sealed as untrusted data rather than interpolated into the
    // instruction text.
    const guardedContents = buildGuardedContents(
      'Draft the executive weekly status email described by the task instruction, using the supplied details.',
      {
        project: context.project,
        client: context.client,
        currentStatus: context.status,
        keyHighlights: context.keyHighlights,
      }
    );

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: guardedContents,
        config: {
          systemInstruction: taskSystemInstruction(
            `Draft a concise, professional executive weekly status email to stakeholders, using only the supplied details.
Format as:
Subject: [Project] Status Update
Dear Stakeholders,
...
Best regards,
Surya Project Management Team`
          ),
        },
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
