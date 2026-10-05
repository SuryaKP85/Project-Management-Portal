import crypto from 'crypto';
import { Project, UserStory } from '../models/types';
import { StoryRepository } from '../repositories/storyRepository';
import { FeatureRepository } from '../repositories/featureRepository';
import { EpicRepository } from '../repositories/epicRepository';
import { RequirementRepository } from '../repositories/requirementRepository';
import { RequirementLinkRepository } from '../repositories/requirementLinkRepository';
import { AIService } from './aiService';
import { ActivityService } from './activityService';
import { canDecompose } from './requirementDecompositionService';
import { FollowThroughActor, ProjectAccessService, forbidden, httpError, notAvailable } from './followThroughSupport';
import { toStoryRefinementContext, validateStoryRefinement } from '../ai/storyRefinement';

/**
 * Sprint 19 — AI story refinement.
 *
 * Story → "Refine with AI" → a temporary proposal (user story + acceptance
 * criteria) → the person edits it in the Story editor → Save goes through the
 * existing guarded PATCH /stories/:id. Nothing here writes a story; there is
 * no proposal table and no approval endpoint.
 *
 * Who: the Sprint 18 rule — admin, project manager or product manager with
 * write access to the story's project (canWriteProject). The story and its
 * project are resolved server-side; a requirement is used as context only
 * when it is linked to the story and belongs to the same project.
 * No LocalRule fallback: no provider is 503, a provider failure 502 AI_ERROR,
 * unusable output 502 AI_INVALID_OUTPUT.
 */

export interface StoryRefinementProposal {
  storyId: string;
  storyCode: string;
  provider: string;
  generatedAt: string;
  userStory: { asA: string; iWant: string; soThat: string };
  /** completed is always false; ids are issued by the server when the story is saved. */
  acceptanceCriteria: Array<{ text: string; completed: false }>;
}

export interface OriginatingRequirement {
  id: string;
  code: string;
  title: string;
}

const aiInvalid = (message: string) => httpError(502, 'AI_INVALID_OUTPUT', `The AI response could not be used: ${message}`);

/** The story and its project, if the caller may see that project; otherwise 404 (no probing). */
async function loadAccessibleStory(actor: FollowThroughActor, id: string): Promise<{ story: UserStory; project: Project }> {
  const story = typeof id === 'string' && id ? await StoryRepository.findById(id) : null;
  if (!story) throw notAvailable('Story');
  const project = await ProjectAccessService.resolveAccessibleProject(actor, story.projectId);
  if (!project) throw notAvailable('Story');
  return { story, project };
}

/** The requirement a story was decomposed from, when the link and the requirement are in the story's project. */
export async function findOriginatingRequirement(story: UserStory) {
  for (const link of await RequirementLinkRepository.findByTarget('story', story.id)) {
    if (link.projectId !== story.projectId) continue;
    const requirement = await RequirementRepository.findById(link.requirementId);
    if (requirement && requirement.projectId === story.projectId) return requirement;
  }
  return null;
}

async function audit(actor: FollowThroughActor, details: Record<string, unknown>): Promise<void> {
  await ActivityService.logActivity({
    entityType: 'ai',
    entityId: `aiq_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    action: 'ai_query',
    actorId: actor.userId,
    actorName: actor.name,
    details: { operation: 'story_refinement', role: actor.role, ...details },
    ipAddress: actor.ipAddress,
  });
}

export function parseStoryRefinement(text: unknown) {
  if (typeof text !== 'string' || !text.trim()) throw aiInvalid('the response was empty.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw aiInvalid('the response was not valid JSON.');
  }
  return validateStoryRefinement(data, aiInvalid);
}

export const StoryRefinementService = {
  async propose(actor: FollowThroughActor, id: string): Promise<StoryRefinementProposal> {
    const { story, project } = await loadAccessibleStory(actor, id);
    if (!canDecompose(actor, project)) {
      throw forbidden('Only an administrator, or a project or product manager who manages or belongs to this project, can refine stories with AI.');
    }
    if (!AIService.canRefineStory()) {
      throw httpError(503, 'AI_UNAVAILABLE', 'AI story refinement is not available: no AI provider with structured output is configured.');
    }
    const sameProject = <T extends { projectId: string }>(r: T | null) => (r && r.projectId === story.projectId ? r : null);
    const feature = story.featureId ? sameProject(await FeatureRepository.findById(story.featureId)) : null;
    const epic = story.epicId ? sameProject(await EpicRepository.findById(story.epicId)) : null;
    const requirement = await findOriginatingRequirement(story);
    const context = toStoryRefinementContext({
      story, featureTitle: feature?.name, epicTitle: epic?.name,
      requirement: requirement ? { title: requirement.title, description: requirement.description, rationale: requirement.rationale, type: requirement.type } : null,
    });

    let provider = 'gemini';
    let refined;
    try {
      const response = await AIService.refineStory(context);
      provider = response.provider;
      refined = parseStoryRefinement(response.text);
    } catch (err: any) {
      const invalid = err?.code === 'AI_INVALID_OUTPUT';
      await audit(actor, { provider, storyCode: story.code, requirementLinked: !!requirement, outcome: 'failed', reason: invalid ? 'invalid-output' : 'provider-error' });
      if (invalid) throw err;
      console.warn('AI story refinement failed:', err?.message);
      throw httpError(502, 'AI_ERROR', 'The AI provider did not return a refinement. Try again later.');
    }
    await audit(actor, { provider, storyCode: story.code, requirementLinked: !!requirement, outcome: 'proposed', criteriaCount: refined.acceptanceCriteria.length });
    return {
      storyId: story.id,
      storyCode: story.code,
      provider,
      generatedAt: new Date().toISOString(),
      userStory: refined.userStory,
      acceptanceCriteria: refined.acceptanceCriteria.map((text) => ({ text, completed: false as const })),
    };
  },

  /** Read-only: the originating requirement's code and title, for anyone who can see the story's project. */
  async origin(actor: FollowThroughActor, id: string): Promise<OriginatingRequirement | null> {
    const { story } = await loadAccessibleStory(actor, id);
    const requirement = await findOriginatingRequirement(story);
    return requirement ? { id: requirement.id, code: requirement.code, title: requirement.title } : null;
  },
};
