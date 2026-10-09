import { Request } from 'express';
import { ProjectScope, scopeActor } from '../services/projectScope';
import { resolveEntity } from '../services/dependencyService';
import { notAvailable } from '../services/followThroughSupport';
import { GoalRepository } from '../repositories/goalRepository';
import { GovernanceLinkTargetType } from '../models/types';

// Sprint 25: shared by the risk, issue and milestone controllers (moved from riskController).
export const LINK_TARGET_TYPES: GovernanceLinkTargetType[] = ['portfolio', 'product', 'project', 'epic', 'feature', 'story', 'task', 'sprint', 'milestone', 'release', 'goal'];

/**
 * Sprint 23: a client may only request a link (target type + id). The server
 * checks the caller can see the target and takes its code and name from the
 * record itself — a client-supplied display name is never stored.
 */
export async function resolvedLinks(req: Request, items: unknown) {
  if (!Array.isArray(items)) throw Object.assign(new Error('linkedItems must be a list.'), { status: 400 });
  const links: { targetType: GovernanceLinkTargetType; targetId: string; targetCode?: string; targetName?: string }[] = [];
  for (const item of items) {
    const targetType = String(item?.targetType ?? '').toLowerCase() as GovernanceLinkTargetType;
    const targetId = String(item?.targetId ?? '').trim();
    if (!LINK_TARGET_TYPES.includes(targetType)) throw Object.assign(new Error(`Unsupported link target type '${targetType}'.`), { status: 400 });
    await ProjectScope.assertLinkTarget(scopeActor(req), targetType, targetId);
    const target = targetType === 'goal'
      ? await GoalRepository.findById(targetId).then((g) => (g ? { code: undefined, name: g.objective } : null))
      : await resolveEntity(targetType, targetId).then((r) => (r.exists ? r : null));
    if (!target) throw notAvailable('Link target');
    links.push({ targetType, targetId, targetCode: target.code, targetName: target.name });
  }
  return links;
}

/** The request body with any requested links replaced by server-resolved ones. */
export async function withResolvedLinks(req: Request) {
  const body = { ...(req.body || {}) };
  if (body.linkedItems !== undefined) body.linkedItems = await resolvedLinks(req, body.linkedItems);
  return body;
}
