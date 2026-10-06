import { Request, Response } from 'express';
import { BacklogRepository } from '../repositories/backlogRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import crypto from 'crypto';
import { SprintRepository } from '../repositories/sprintRepository';
import { ProjectScope, ScopeActor, scopeActor } from '../services/projectScope';
import { notAvailable } from '../services/followThroughSupport';

function getActor(req: Request) {
  if (!req.user) return { id: 'usr_system', name: 'System User' };
  return {
    id: req.user.userId,
    name: `${req.user.firstName} ${req.user.lastName}`.trim() || req.user.email,
  };
}

/** Sprint 22A: access errors keep their status (404 / 403 / 400); other errors stay a 500 as before. */
function failWith(res: Response, err: any, fallback: number) {
  const status = Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : fallback;
  return res.status(status).json({ success: false, message: err?.message, ...(err?.code ? { error: { code: err.code, message: err.message } } : {}) });
}

const BACKLOG_TYPES = ['epic', 'feature', 'story', 'task'];

/** A backlog item the caller may change: it exists, its project is visible (404) and writable (403). */
async function writableItem(actor: ScopeActor, type: unknown, id: unknown): Promise<string> {
  const projectId = BACKLOG_TYPES.includes(String(type)) ? await ProjectScope.projectOfEntity(type, id) : undefined;
  if (!projectId || projectId === 'org') throw notAvailable('Backlog item');
  await ProjectScope.assertWrite(actor, projectId, 'Backlog item');
  return projectId;
}

export const BacklogController = {
  async getBacklog(req: Request, res: Response) {
    try {
      const { projectId, type, status, priority, assigneeId, search, includeSprintItems } = req.query;
      const items = await ProjectScope.filter(scopeActor(req), await BacklogRepository.getBacklogItems({
        projectId: projectId ? String(projectId) : undefined,
        type: type ? String(type) : undefined,
        status: status ? String(status) : undefined,
        priority: priority ? String(priority) : undefined,
        assigneeId: assigneeId ? String(assigneeId) : undefined,
        search: search ? String(search) : undefined,
        includeSprintItems: includeSprintItems === 'true',
      }), (item) => item.projectId);
      return res.json({ success: true, data: items, count: items.length });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },

  async reorder(req: Request, res: Response) {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Items array is required' });
      }

      // Every item is checked before any order is written.
      const actorScope = scopeActor(req);
      for (const item of items) await writableItem(actorScope, item?.type, item?.id);
      await BacklogRepository.reorder(items);
      const actor = getActor(req);

      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'backlog',
        entityId: items[0]?.id || 'backlog',
        action: 'reorder',
        actorId: actor.id,
        actorName: actor.name,
        details: { reorderedCount: items.length },
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, message: 'Backlog reordered successfully' });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },

  async assign(req: Request, res: Response) {
    try {
      const { itemId, itemType, sprintId } = req.body;
      if (!itemId || !itemType) {
        return res.status(400).json({ success: false, message: 'itemId and itemType are required' });
      }

      const itemProjectId = await writableItem(scopeActor(req), itemType, itemId);
      if (sprintId) {
        const sprint = await SprintRepository.findById(String(sprintId));
        if (!sprint || !(await ProjectScope.canRead(scopeActor(req), sprint.projectId))) throw notAvailable('Sprint');
        if (sprint.projectId !== itemProjectId) {
          return res.status(400).json({ success: false, message: "Only work from the sprint's own project can be planned into it." });
        }
      }
      const result = await BacklogRepository.assignToSprint(itemId, itemType, sprintId || null);
      const actor = getActor(req);

      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        entityType: 'backlog',
        entityId: itemId,
        action: sprintId ? 'assign' : 'reassign',
        actorId: actor.id,
        actorName: actor.name,
        details: { itemId, itemType, sprintId: sprintId || 'backlog' },
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, data: result.item });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },
};

