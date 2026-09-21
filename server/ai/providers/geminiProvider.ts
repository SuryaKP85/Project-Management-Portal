import { GoogleGenAI } from '@google/genai';
import { AIProvider, AIProviderResponse } from './baseProvider';
import { config, GEMINI_DEFAULT_MODEL, GEMINI_DEFAULT_TIMEOUT_MS } from '../../config/env';
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

/**
 * Resolves the model for this call. Reads the environment first so an override
 * applies without a restart, mirroring how the API key is read above, and falls
 * back to the configured default.
 */
export function resolveGeminiModel(): string {
  const fromEnv = (process.env.GEMINI_MODEL || '').trim();
  if (fromEnv) return fromEnv;
  return config.geminiModel || GEMINI_DEFAULT_MODEL;
}

/**
 * Resolves the per-call timeout in milliseconds. A non-numeric or non-positive
 * override is ignored in favour of the configured default, so a malformed value
 * cannot disable the ceiling entirely.
 */
export function resolveGeminiTimeoutMs(): number {
  const parsedEnv = parseInt((process.env.GEMINI_TIMEOUT_MS || '').trim(), 10);
  if (Number.isFinite(parsedEnv) && parsedEnv > 0) return parsedEnv;
  return config.geminiTimeoutMs > 0 ? config.geminiTimeoutMs : GEMINI_DEFAULT_TIMEOUT_MS;
}

/**
 * Applies the configured ceiling to a single Gemini call. The timer is always
 * cleared, so a fast response does not leave a pending handle holding the event
 * loop open.
 */
export async function withGeminiTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  const timeoutMs = resolveGeminiTimeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Gemini ${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
    const model = resolveGeminiModel();

    try {
      const response = await withGeminiTimeout(
        ai.models.generateContent({
          model,
          contents: guardedContents,
          config: { systemInstruction: PM_SYSTEM_INSTRUCTION },
        }),
        'query'
      );

      return {
        provider: 'gemini',
        text: response.text || 'Analysis completed.',
        metadata: { model },
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
      const response = await withGeminiTimeout(
        ai.models.generateContent({
          model: resolveGeminiModel(),
          contents: guardedContents,
          config: {
            systemInstruction: taskSystemInstruction(
              'Analyse the supplied project record and return risk mitigations and health recommendations.'
            ),
          },
        }),
        'project insights'
      );

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
      const response = await withGeminiTimeout(
        ai.models.generateContent({
          model: resolveGeminiModel(),
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
        }),
        'draft email'
      );

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
