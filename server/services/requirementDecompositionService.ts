import crypto from 'crypto';
import { Epic, Feature, Project, Requirement, RequirementLink, RequirementLinkTargetType, UserStory } from '../models/types';
import { withTransaction } from '../config/database';
import { RequirementRepository } from '../repositories/requirementRepository';
import { EpicRepository } from '../repositories/epicRepository';
import { FeatureRepository } from '../repositories/featureRepository';
import { StoryRepository } from '../repositories/storyRepository';
import {
  RequirementDecompositionRepository, RequirementLinkRepository, decompositionExists,
} from '../repositories/requirementLinkRepository';
import { AIService } from './aiService';
import { ActivityService } from './activityService';
import { canWriteProject } from './deliveryGuards';
import { FollowThroughActor, ProjectAccessService, forbidden, httpError, notAvailable, validationError } from './followThroughSupport';
import {
  DecompositionEpic, countDecomposition, toDecompositionContext, validateDecompositionEpics,
} from '../ai/requirementDecomposition';

/**
 * Sprint 18 — Requirement → Epic → Feature → Story decomposition.
 *
 * AI proposes, a person reviews and edits, the person approves, and only then
 * are authoritative delivery records created:
 *
 * - propose(): checks access and the approved status, sends a capped
 *   projection of the requirement (as sealed, untrusted data) to the AI,
 *   validates the structured reply and returns it. Nothing is stored except
 *   a metadata-only AI audit entry. There is no LocalRule fallback: a missing
 *   provider or unusable output is an error.
 * - approve(): treats the edited tree as untrusted user input, then in one
 *   transaction (withTransaction: PostgreSQL BEGIN/COMMIT/ROLLBACK plus the
 *   memory undo journal) re-reads and locks the requirement, records the
 *   decomposition (UNIQUE requirement + revision), creates the epics,
 *   features and stories and links every one of them to the requirement.
 *   Activity is written only after the commit, and best effort: an activity
 *   failure never undoes or fails a committed decomposition.
 *
 * Concurrency: there is no in-process lock. In PostgreSQL the row lock and
 * UNIQUE(requirement_id, requirement_revision) make exactly one approval per
 * revision commit, across any number of requests or server instances. Memory
 * mode is a single server process; there the repository's synchronous
 * check-and-insert gives the same result within that process only.
 *
 * The server decides every authoritative value: project (the requirement's),
 * parents (tree position), codes and ids, status (backlog), priority (the
 * requirement's), owner (the approver), no assignees, empty user story and
 * acceptance criteria.
 *
 * Authorisation (both steps): admin, project manager or product manager who
 * can write to the project (canWriteProject: admin, or its manager or a listed
 * member). Team members and viewers cannot use decomposition, so it is never
 * a way around the existing epic/feature create rules.
 */

const DECOMPOSER_ROLES = ['admin', 'project-manager', 'product-manager'];
const APPROVAL_KEYS = ['requirementRevision', 'epics'];

export interface DecompositionProposal {
  requirementId: string;
  requirementCode: string;
  requirementRevision: number;
  provider: string;
  generatedAt: string;
  epics: DecompositionEpic[];
}

export interface CreatedStory { id: string; code: string; title: string }
export interface CreatedFeature { id: string; code: string; title: string; stories: CreatedStory[] }
export interface CreatedEpic { id: string; code: string; title: string; features: CreatedFeature[] }

export interface DecompositionResult {
  decompositionId: string;
  requirementId: string;
  requirementCode: string;
  requirementRevision: number;
  projectId: string;
  counts: { epics: number; features: number; stories: number };
  epics: CreatedEpic[];
  links: Array<{ id: string; targetType: RequirementLinkTargetType; targetId: string; code: string }>;
}

export interface LinkedDeliveryRecord {
  linkId: string;
  type: RequirementLinkTargetType;
  id: string;
  code: string;
  title: string;
  status: string;
  decompositionId: string;
  createdAt: string;
}

const conflict = (code: string, message: string) => httpError(409, code, message);
const aiInvalid = (message: string) => httpError(502, 'AI_INVALID_OUTPUT', `The AI response could not be used: ${message}`);

async function loadAccessible(actor: FollowThroughActor, id: string): Promise<{ requirement: Requirement; project: Project }> {
  const requirement = typeof id === 'string' && id ? await RequirementRepository.findById(id) : null;
  if (!requirement) throw notAvailable('Requirement');
  const project = await ProjectAccessService.resolveAccessibleProject(actor, requirement.projectId);
  if (!project) throw notAvailable('Requirement');
  return { requirement, project };
}

export function canDecompose(actor: FollowThroughActor, project: Project): boolean {
  return DECOMPOSER_ROLES.includes(actor.role) && canWriteProject({ id: actor.userId, role: actor.role }, project);
}

/** Access (404), role and project write access (403), then the approved status (409). */
async function authorise(actor: FollowThroughActor, id: string): Promise<{ requirement: Requirement; project: Project }> {
  const loaded = await loadAccessible(actor, id);
  if (!canDecompose(actor, loaded.project)) {
    throw forbidden('Only an administrator, or a project or product manager who manages or belongs to this project, can decompose its requirements.');
  }
  if (loaded.requirement.status !== 'approved') {
    throw conflict('REQUIREMENT_NOT_APPROVED', 'Only an approved requirement can be decomposed.');
  }
  return loaded;
}

async function audit(actor: FollowThroughActor, details: Record<string, unknown>): Promise<void> {
  await ActivityService.logActivity({
    entityType: 'ai',
    entityId: `aiq_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    action: 'ai_query',
    actorId: actor.userId,
    actorName: actor.name,
    details: { operation: 'requirement_decomposition', role: actor.role, ...details },
    ipAddress: actor.ipAddress,
  });
}

/** Parses the provider's JSON text and validates it against the contract. */
export function parseProposal(text: unknown): DecompositionEpic[] {
  if (typeof text !== 'string' || !text.trim()) throw aiInvalid('the response was empty.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw aiInvalid('the response was not valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw aiInvalid('the response was not a JSON object.');
  const extra = Object.keys(data as object).filter((k) => k !== 'epics');
  if (extra.length) throw aiInvalid(`unexpected field(s): ${extra.slice(0, 5).join(', ')}.`);
  return validateDecompositionEpics((data as any).epics, aiInvalid);
}

/** Post-commit work (activity): a failure is logged on the server and never changes the outcome. */
async function bestEffort(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err: any) {
    console.warn(`Requirement decomposition: could not write the ${label}:`, err?.message);
  }
}

const recordId = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

/**
 * Checks a link target before it is stored: the record must exist and belong
 * to the requirement's project. Used by approve() and available to any later
 * linking feature.
 */
export async function assertLinkTarget(requirement: Requirement, targetType: RequirementLinkTargetType, targetId: string): Promise<{ code: string }> {
  const target = targetType === 'epic' ? await EpicRepository.findById(targetId)
    : targetType === 'feature' ? await FeatureRepository.findById(targetId)
      : targetType === 'story' ? await StoryRepository.findById(targetId)
        : null;
  if (!target || target.projectId !== requirement.projectId) {
    throw validationError(`The ${targetType} to link was not found in this requirement's project.`);
  }
  return { code: target.code };
}

export const RequirementDecompositionService = {
  async propose(actor: FollowThroughActor, id: string): Promise<DecompositionProposal> {
    const { requirement } = await authorise(actor, id);
    if (await RequirementDecompositionRepository.findByRevision(requirement.id, requirement.revision)) {
      throw conflict('ALREADY_DECOMPOSED', 'This revision of the requirement has already been decomposed. Edit and re-approve it to decompose again.');
    }
    if (!AIService.canDecompose()) {
      throw httpError(503, 'AI_UNAVAILABLE', 'AI decomposition is not available: no AI provider with structured output is configured.');
    }

    let provider = 'gemini';
    let epics: DecompositionEpic[];
    try {
      const response = await AIService.decomposeRequirement(toDecompositionContext(requirement) as unknown as Record<string, unknown>);
      provider = response.provider;
      epics = parseProposal(response.text);
    } catch (err: any) {
      await audit(actor, { provider, requirementCode: requirement.code, requirementRevision: requirement.revision, outcome: 'failed', reason: err?.code === 'AI_INVALID_OUTPUT' ? 'invalid-output' : 'provider-error' });
      if (err?.code === 'AI_INVALID_OUTPUT') throw err;
      console.warn('AI decomposition failed:', err?.message);
      throw httpError(502, 'AI_ERROR', 'The AI provider did not return a decomposition. Try again later.');
    }

    const counts = countDecomposition(epics);
    await audit(actor, {
      provider, requirementCode: requirement.code, requirementRevision: requirement.revision, outcome: 'proposed',
      epicCount: counts.epics, featureCount: counts.features, storyCount: counts.stories,
    });
    return {
      requirementId: requirement.id,
      requirementCode: requirement.code,
      requirementRevision: requirement.revision,
      provider,
      generatedAt: new Date().toISOString(),
      epics,
    };
  },

  async approve(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<DecompositionResult> {
    const { requirement, project } = await authorise(actor, id);

    // The approval is untrusted user input: only the two contract fields, fully validated.
    const extra = Object.keys(body || {}).filter((k) => !APPROVAL_KEYS.includes(k));
    if (extra.length) throw validationError(`Unexpected field(s): ${extra.slice(0, 5).join(', ')}.`);
    const revision = body.requirementRevision;
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
      throw validationError("Field 'requirementRevision' must be the revision number the proposal was made from.");
    }
    const epics = validateDecompositionEpics(body.epics, validationError);
    if (revision !== requirement.revision) {
      throw conflict('STALE_PROPOSAL', 'The requirement has changed since this proposal was made. Generate a new proposal.');
    }
    if (await RequirementDecompositionRepository.findByRevision(requirement.id, revision)) throw decompositionExists();

    const now = () => new Date().toISOString();
    const result = await withTransaction(async () => {
      // Re-read under lock: the requirement must still be approved and at this revision.
      const current = await RequirementRepository.findForUpdate(requirement.id);
      if (!current || current.projectId !== project.id) throw notAvailable('Requirement');
      if (current.status !== 'approved') throw conflict('REQUIREMENT_NOT_APPROVED', 'Only an approved requirement can be decomposed.');
      if (current.revision !== revision) {
        throw conflict('STALE_PROPOSAL', 'The requirement has changed since this proposal was made. Generate a new proposal.');
      }

      // The database guarantee: one decomposition per requirement revision.
      const decomposition = await RequirementDecompositionRepository.create({
        requirementId: current.id, projectId: project.id, requirementRevision: revision, createdBy: actor.userId,
      });

      const created: CreatedEpic[] = [];
      const links: DecompositionResult['links'] = [];
      const link = async (targetType: RequirementLinkTargetType, targetId: string) => {
        const { code } = await assertLinkTarget(current, targetType, targetId);
        const row: RequirementLink = await RequirementLinkRepository.create({
          requirementId: current.id, projectId: project.id, targetType, targetId, decompositionId: decomposition.id, createdBy: actor.userId,
        });
        links.push({ id: row.id, targetType, targetId, code });
      };

      for (const e of epics) {
        const epic: Epic = await EpicRepository.create({
          id: recordId('epic'), code: '', name: e.title, description: e.description, projectId: project.id,
          ownerId: actor.userId, status: 'backlog', priority: current.priority, health: 'on-track', progress: 0,
          isArchived: false, createdAt: now(), updatedAt: now(),
        });
        await link('epic', epic.id);
        const createdEpic: CreatedEpic = { id: epic.id, code: epic.code, title: epic.name, features: [] };
        for (const f of e.features) {
          const feature: Feature = await FeatureRepository.create({
            id: recordId('feat'), code: '', name: f.title, description: f.description, epicId: epic.id, projectId: project.id,
            ownerId: actor.userId, status: 'backlog', priority: current.priority, progress: 0, createdAt: now(), updatedAt: now(),
          });
          await link('feature', feature.id);
          const createdFeature: CreatedFeature = { id: feature.id, code: feature.code, title: feature.name, stories: [] };
          for (const st of f.stories) {
            const story: UserStory = await StoryRepository.create({
              id: recordId('story'), code: '', title: st.title, description: st.description,
              userStory: { asA: '', iWant: '', soThat: '' }, acceptanceCriteria: [],
              featureId: feature.id, epicId: epic.id, projectId: project.id, storyPoints: 3,
              priority: current.priority, status: 'backlog', reporterId: actor.userId, progress: 0,
              createdAt: now(), updatedAt: now(),
            });
            await link('story', story.id);
            createdFeature.stories.push({ id: story.id, code: story.code, title: story.title });
          }
          createdEpic.features.push(createdFeature);
        }
        created.push(createdEpic);
      }

      const counts = countDecomposition(epics);
      return {
        decompositionId: decomposition.id,
        requirementId: current.id,
        requirementCode: current.code,
        requirementRevision: revision,
        projectId: project.id,
        counts: { epics: counts.epics, features: counts.features, stories: counts.stories },
        epics: created,
        links,
      } as DecompositionResult;
    }).catch(async (err: any) => {
      // Rolled back. Expected refusals need no entry; anything else gets one failure entry.
      if (!(err?.status === 409 || err?.status === 404 || err?.status === 400)) {
        await bestEffort('failure entry', () => ActivityService.logActivity({
          entityType: 'requirement', entityId: requirement.id, action: 'decompose', actorId: actor.userId, actorName: actor.name,
          details: { projectId: project.id, code: requirement.code, revision, outcome: 'failed' }, ipAddress: actor.ipAddress,
        }));
      }
      throw err; // the original failure, never one from the audit
    });

    // Committed: only now is the work recorded as done. These entries are
    // post-commit and best effort: if one cannot be written, the decomposition
    // has still happened and is still reported as created (the data is not
    // rolled back and the caller does not see a failure).
    await bestEffort('decomposition entry', () => ActivityService.logActivity({
      entityType: 'requirement', entityId: result.requirementId, action: 'decompose', actorId: actor.userId, actorName: actor.name,
      details: {
        projectId: result.projectId, code: result.requirementCode, revision: result.requirementRevision, decompositionId: result.decompositionId,
        outcome: 'created', epicCount: result.counts.epics, featureCount: result.counts.features, storyCount: result.counts.stories,
        epicCodes: result.epics.map((e) => e.code),
      },
      ipAddress: actor.ipAddress,
    }));
    const createdEntry = (entityType: 'epic' | 'feature' | 'story', entityId: string, code: string, title: string) =>
      bestEffort(`${entityType} create entry`, () => ActivityService.logActivity({
        entityType, entityId, action: 'create', actorId: actor.userId, actorName: actor.name,
        details: { code, ...(entityType === 'story' ? { title } : { name: title }), projectId: result.projectId, requirementCode: result.requirementCode, decompositionId: result.decompositionId },
        ipAddress: actor.ipAddress,
      }));
    for (const e of result.epics) {
      await createdEntry('epic', e.id, e.code, e.title);
      for (const f of e.features) {
        await createdEntry('feature', f.id, f.code, f.title);
        for (const s of f.stories) await createdEntry('story', s.id, s.code, s.title);
      }
    }
    return result;
  },

  /** Linked delivery records for the requirement detail: same project only, dangling links dropped. */
  async linkedRecords(actor: FollowThroughActor, id: string): Promise<LinkedDeliveryRecord[]> {
    const { requirement } = await loadAccessible(actor, id);
    const links = await RequirementLinkRepository.findByRequirement(requirement.id);
    const out: LinkedDeliveryRecord[] = [];
    for (const l of links) {
      if (l.projectId !== requirement.projectId) continue;
      const target: any = l.targetType === 'epic' ? await EpicRepository.findById(l.targetId)
        : l.targetType === 'feature' ? await FeatureRepository.findById(l.targetId)
          : l.targetType === 'story' ? await StoryRepository.findById(l.targetId)
            : null;
      if (!target || target.projectId !== requirement.projectId) continue;
      out.push({
        linkId: l.id, type: l.targetType, id: target.id, code: target.code, title: target.name || target.title || '',
        status: target.status, decompositionId: l.decompositionId, createdAt: l.createdAt,
      });
    }
    return out;
  },
};
