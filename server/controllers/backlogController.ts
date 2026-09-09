import { Request, Response } from 'express';
import { BacklogRepository } from '../repositories/backlogRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import crypto from 'crypto';

function getActor(req: Request) {
  if (!req.user) return { id: 'usr_system', name: 'System User' };
  return {
    id: req.user.userId,
    name: `${req.user.firstName} ${req.user.lastName}`.trim() || req.user.email,
  };
}

export const BacklogController = {
  async getBacklog(req: Request, res: Response) {
    try {
      const { projectId, type, status, priority, assigneeId, search, includeSprintItems } = req.query;
      const items = await BacklogRepository.getBacklogItems({
        projectId: projectId ? String(projectId) : undefined,
        type: type ? String(type) : undefined,
        status: status ? String(status) : undefined,
        priority: priority ? String(priority) : undefined,
        assigneeId: assigneeId ? String(assigneeId) : undefined,
        search: search ? String(search) : undefined,
        includeSprintItems: includeSprintItems === 'true',
      });
      return res.json({ success: true, data: items, count: items.length });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async reorder(req: Request, res: Response) {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Items array is required' });
      }

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
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  async assign(req: Request, res: Response) {
    try {
      const { itemId, itemType, sprintId } = req.body;
      if (!itemId || !itemType) {
        return res.status(400).json({ success: false, message: 'itemId and itemType are required' });
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
      return res.status(500).json({ success: false, message: err.message });
    }
  },
};

