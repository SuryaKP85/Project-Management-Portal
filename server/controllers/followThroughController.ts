import { Request, Response, NextFunction } from 'express';
import { MeetingService } from '../services/meetingService';
import { ActionItemService } from '../services/actionItemService';
import { WaitingForService } from '../services/waitingForService';
import { FollowUpService } from '../services/followUpService';
import { FollowThroughActor } from '../services/followThroughSupport';

/**
 * Sprint 14 — HTTP layer for Meetings, Action Items, Waiting For and
 * Follow-ups. Identity comes only from the verified JWT; the services apply
 * project scope and role rules. Typed service errors (400/403/404) reach the
 * global errorHandler through next(), as in the identity controllers.
 */

function actorFrom(req: Request): FollowThroughActor | null {
  if (!req.user) return null;
  return {
    userId: req.user.userId,
    role: req.user.role,
    name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
    ipAddress: req.ip,
  };
}

const unauthenticated = (res: Response) =>
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });

type Handler = (actor: FollowThroughActor, req: Request, res: Response) => Promise<unknown>;

function handle(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = actorFrom(req);
      if (!actor) return unauthenticated(res);
      await fn(actor, req, res);
    } catch (err) {
      next(err);
    }
  };
}

const body = (req: Request): Record<string, unknown> => (req.body && typeof req.body === 'object' ? req.body : {});

export const MeetingController = {
  list: handle(async (actor, req, res) => res.json({ success: true, data: await MeetingService.list(actor, req.query as any) })),
  get: handle(async (actor, req, res) => res.json({ success: true, data: { meeting: await MeetingService.get(actor, req.params.id) } })),
  create: handle(async (actor, req, res) => res.status(201).json({ success: true, data: { meeting: await MeetingService.create(actor, body(req)) } })),
  update: handle(async (actor, req, res) => res.json({ success: true, data: { meeting: await MeetingService.update(actor, req.params.id, body(req)) } })),
  remove: handle(async (actor, req, res) => {
    await MeetingService.remove(actor, req.params.id);
    res.json({ success: true, data: { deleted: true } });
  }),
};

export const ActionItemController = {
  list: handle(async (actor, req, res) => res.json({ success: true, data: await ActionItemService.list(actor, req.query as any) })),
  get: handle(async (actor, req, res) => res.json({ success: true, data: { actionItem: await ActionItemService.get(actor, req.params.id) } })),
  create: handle(async (actor, req, res) => res.status(201).json({ success: true, data: { actionItem: await ActionItemService.create(actor, body(req)) } })),
  update: handle(async (actor, req, res) => res.json({ success: true, data: { actionItem: await ActionItemService.update(actor, req.params.id, body(req)) } })),
  updateStatus: handle(async (actor, req, res) => res.json({ success: true, data: { actionItem: await ActionItemService.updateStatus(actor, req.params.id, body(req)) } })),
  remove: handle(async (actor, req, res) => {
    await ActionItemService.remove(actor, req.params.id);
    res.json({ success: true, data: { deleted: true } });
  }),
};

export const WaitingForController = {
  list: handle(async (actor, req, res) => res.json({ success: true, data: await WaitingForService.list(actor, req.query as any) })),
  get: handle(async (actor, req, res) => res.json({ success: true, data: { waitingFor: await WaitingForService.get(actor, req.params.id) } })),
  create: handle(async (actor, req, res) => res.status(201).json({ success: true, data: { waitingFor: await WaitingForService.create(actor, body(req)) } })),
  update: handle(async (actor, req, res) => res.json({ success: true, data: { waitingFor: await WaitingForService.update(actor, req.params.id, body(req)) } })),
  updateStatus: handle(async (actor, req, res) => res.json({ success: true, data: { waitingFor: await WaitingForService.updateStatus(actor, req.params.id, body(req)) } })),
  remove: handle(async (actor, req, res) => {
    await WaitingForService.remove(actor, req.params.id);
    res.json({ success: true, data: { deleted: true } });
  }),
};

export const FollowUpController = {
  list: handle(async (actor, req, res) => res.json({ success: true, data: await FollowUpService.list(actor, req.query as any) })),
  get: handle(async (actor, req, res) => res.json({ success: true, data: { followUp: await FollowUpService.get(actor, req.params.id) } })),
  create: handle(async (actor, req, res) => res.status(201).json({ success: true, data: { followUp: await FollowUpService.create(actor, body(req)) } })),
  update: handle(async (actor, req, res) => res.json({ success: true, data: { followUp: await FollowUpService.update(actor, req.params.id, body(req)) } })),
  updateStatus: handle(async (actor, req, res) => res.json({ success: true, data: { followUp: await FollowUpService.updateStatus(actor, req.params.id, body(req)) } })),
  remove: handle(async (actor, req, res) => {
    await FollowUpService.remove(actor, req.params.id);
    res.json({ success: true, data: { deleted: true } });
  }),
};
