import { Request, Response, NextFunction } from 'express';
import { ActivityService } from '../services/activityService';
import { ActivityLog } from '../models/types';
import { ProjectScope, ScopeActor, scopeActor } from '../services/projectScope';
import { notAvailable } from '../services/followThroughSupport';

/**
 * Sprint 22A — activity log privacy.
 * - limit is capped server-side whatever the client asks for.
 * - Administrators keep the full log (including IP addresses).
 * - Everyone else sees only entries about records they can see: project
 *   records of their accessible projects, and org-level strategy records
 *   (portfolio, product, goal, roadmap). Sign-in, AI, user, team and system
 *   entries are never shown to them, IP addresses are removed, and budget /
 *   client values are removed for roles without commercial visibility.
 */
export const ACTIVITY_MAX_LIMIT = 200;
const ACTIVITY_SCAN_LIMIT = 1000;
const ADMIN_ONLY_TYPES = new Set(['auth', 'ai', 'user', 'team', 'system', 'governance', 'backlog']);
const ORG_LEVEL_TYPES = new Set(['portfolio', 'product', 'goal', 'roadmap']);

/** The entries this caller may see, sanitised; the project of each entity is resolved at most once. */
async function visibleActivities(actor: ScopeActor, entries: ActivityLog[]): Promise<ActivityLog[]> {
  if (actor.role === 'admin') return entries;
  const cache = new Map<string, boolean>();
  const visible: ActivityLog[] = [];
  for (const entry of entries) {
    if (ADMIN_ONLY_TYPES.has(entry.entityType)) continue;
    let ok = ORG_LEVEL_TYPES.has(entry.entityType);
    if (!ok) {
      const key = `${entry.entityType}:${entry.entityId}`;
      if (!cache.has(key)) {
        const projectId = await ProjectScope.projectOfEntity(entry.entityType, entry.entityId);
        cache.set(key, !!projectId && projectId !== 'org' && (await ProjectScope.canRead(actor, projectId)));
      }
      ok = cache.get(key)!;
    }
    if (!ok) continue;
    const { ipAddress: _ip, ...rest } = entry;
    visible.push({ ...rest, details: ProjectScope.stripCommercial(actor, rest.details || {}) });
  }
  return visible;
}

export const ActivityController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = scopeActor(req);
      const requested = parseInt((req.query.limit as string) || '50', 10);
      const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 50, 1), ACTIVITY_MAX_LIMIT);
      const entityType = req.query.entityType as string;
      const entityId = req.query.entityId as string;

      let activities;
      if (entityType && entityId) {
        // One record's history: the caller must be able to see that record.
        if (actor.role !== 'admin') {
          const allowed = !ADMIN_ONLY_TYPES.has(entityType)
            && (ORG_LEVEL_TYPES.has(entityType) || (await ProjectScope.canReadEntity(actor, entityType, entityId)));
          if (!allowed) throw notAvailable('Record');
        }
        activities = (await visibleActivities(actor, await ActivityService.getEntityActivities(entityType, entityId))).slice(0, ACTIVITY_MAX_LIMIT);
      } else {
        const scanned = await ActivityService.getRecentActivities(actor.role === 'admin' ? limit : ACTIVITY_SCAN_LIMIT);
        activities = (await visibleActivities(actor, scanned)).slice(0, limit);
      }

      res.json({ success: true, data: { activities } });
    } catch (err) {
      next(err);
    }
  },
};
