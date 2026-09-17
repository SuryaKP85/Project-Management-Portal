import crypto from 'crypto';
import { AIService } from './aiService';
import { AiContextService, AiContextActor, AiAuthorizedContext } from './aiContextService';
import { ActivityService } from './activityService';

/**
 * Sprint 7A (Step 3) — AI assistant orchestration.
 *
 * Owns the sequence: build authorised context -> ask the provider -> audit.
 * The caller supplies only a question; everything the provider sees is derived
 * server-side from the authenticated identity (see AiContextService).
 */

export interface AiAssistantAnswer {
  queryId: string;
  answer: string;
  provider: string;
  scope: AiAuthorizedContext['scope'];
  recommendations?: Array<Record<string, any>>;
  suggestedActions?: string[];
  meta: {
    generatedAt: string;
    projectsInScope: number;
    projectsIncluded: number;
    workItemsIncluded: number;
    truncated: boolean;
  };
}

export const AiAssistantService = {
  async ask(
    actor: AiContextActor & { name?: string; ipAddress?: string },
    question: string
  ): Promise<AiAssistantAnswer> {
    const queryId = `aiq_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const context = await AiContextService.buildContext(actor);
    const response = await AIService.query(question, context as unknown as Record<string, any>);

    const actorName =
      actor.name || `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email || actor.userId;

    // Audit via the existing activity architecture. Deliberately minimal: we
    // record that a query happened, by whom, and the shape of the context it
    // was answered from. The question text, the answer text and the context
    // itself are NOT persisted.
    await ActivityService.logActivity({
      entityType: 'ai',
      entityId: queryId,
      action: 'ai_query',
      actorId: actor.userId,
      actorName,
      details: {
        provider: response.provider,
        scope: context.scope,
        role: actor.role,
        promptLength: question.length,
        projectsInScope: context.meta.projectsInScope,
        workItemsIncluded: context.meta.workItemsIncluded,
        truncated: context.meta.truncated,
      },
      ipAddress: actor.ipAddress,
    });

    return {
      queryId,
      answer: response.text,
      provider: response.provider,
      scope: context.scope,
      recommendations: response.recommendations,
      suggestedActions: response.suggestedActions,
      meta: context.meta,
    };
  },
};
