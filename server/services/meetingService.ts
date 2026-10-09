import { Meeting, MeetingStatus } from '../models/types';
import { MeetingRepository } from '../repositories/meetingRepository';
import { ActionItemRepository } from '../repositories/actionItemRepository';
import { WaitingForRepository } from '../repositories/waitingForRepository';
import { FollowUpRepository } from '../repositories/followUpRepository';
import {
  FollowThroughActor, ProjectAccessService, assertProjectWrite, assertCanDelete, assertCanWrite, assertSameProject, cleanEnum,
  cleanOptionalText, cleanRequiredDateTime, cleanRequiredText, listingScope, logFollowThroughActivity,
  notAvailable, paginate, parsePaging, queryText, requireProjectUser, validationError,
} from './followThroughSupport';

/**
 * Sprint 14 — Meetings. A meeting belongs to one project; its organizer and
 * participants are portal users who can see that project. Action items can
 * be raised from a meeting (ActionItemService). Meetings send no
 * notifications: calendar invitations are out of scope.
 */

export const MEETING_STATUSES: readonly MeetingStatus[] = ['Scheduled', 'Completed', 'Cancelled'];
const MAX_PARTICIPANTS = 50;
const MIN_DURATION = 5;
const MAX_DURATION = 24 * 60;

function cleanDuration(value: unknown): number {
  if (value === undefined || value === null || value === '') return 30;
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_DURATION || n > MAX_DURATION) {
    throw validationError(`Field 'durationMinutes' must be a whole number between ${MIN_DURATION} and ${MAX_DURATION}.`);
  }
  return n;
}

/** Only http(s) links are stored, so the browser never renders a javascript: or data: URL. */
function cleanMeetingLink(value: unknown): string | undefined {
  const text = cleanOptionalText(value, 'meetingLink', 2048);
  if (!text) return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw validationError("Field 'meetingLink' must be a valid URL.");
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw validationError("Field 'meetingLink' must be an http or https URL.");
  }
  return url.toString();
}

async function cleanParticipants(value: unknown, project: any): Promise<string[]> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw validationError("Field 'participantIds' must be an array of user ids.");
  const ids = Array.from(new Set(value.map((v) => (typeof v === 'string' ? v.trim() : v))));
  if (ids.length > MAX_PARTICIPANTS) throw validationError(`A meeting can have at most ${MAX_PARTICIPANTS} participants.`);
  for (const id of ids) await requireProjectUser(id, project, 'participantIds');
  return ids as string[];
}

async function loadAccessible(actor: FollowThroughActor, id: string): Promise<{ meeting: Meeting; project: any }> {
  const meeting = await MeetingRepository.findById(id);
  if (!meeting) throw notAvailable('Meeting');
  const project = await ProjectAccessService.resolveAccessibleProject(actor, meeting.projectId);
  if (!project) throw notAvailable('Meeting');
  return { meeting, project };
}

export const MeetingService = {
  async list(actor: FollowThroughActor, params: Record<string, unknown>) {
    const projectIds = await listingScope(actor, params.projectId);
    const all = await MeetingRepository.findAll({
      projectIds,
      status: queryText(params.status),
      organizerId: queryText(params.organizerId),
      participantId: queryText(params.participantId),
      from: queryText(params.from),
      to: queryText(params.to),
      search: queryText(params.search),
    });
    const { page, limit } = parsePaging(params);
    const result = paginate(all, page, limit);
    return { meetings: result.items, total: result.total, page: result.page, limit: result.limit };
  },

  async get(actor: FollowThroughActor, id: string): Promise<Meeting> {
    return (await loadAccessible(actor, id)).meeting;
  },

  async create(actor: FollowThroughActor, body: Record<string, unknown>): Promise<Meeting> {
    assertCanWrite(actor);
    const project = await ProjectAccessService.resolveAccessibleProject(actor, body.projectId);
    if (!project) throw notAvailable('Project');
    assertProjectWrite(actor, project); // Sprint 25

    const organizerId = body.organizerId === undefined || body.organizerId === '' ? actor.userId : body.organizerId;
    await requireProjectUser(organizerId, project, 'organizerId');

    const meeting = await MeetingRepository.create({
      projectId: project.id,
      title: cleanRequiredText(body.title, 'title', 255),
      agenda: cleanOptionalText(body.agenda, 'agenda', 10000),
      notes: cleanOptionalText(body.notes, 'notes', 20000),
      scheduledAt: cleanRequiredDateTime(body.scheduledAt, 'scheduledAt'),
      durationMinutes: cleanDuration(body.durationMinutes),
      location: cleanOptionalText(body.location, 'location', 255),
      meetingLink: cleanMeetingLink(body.meetingLink),
      organizerId: organizerId as string,
      participantIds: await cleanParticipants(body.participantIds, project),
      status: cleanEnum(body.status, MEETING_STATUSES, 'status', 'Scheduled'),
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    await logFollowThroughActivity(actor, 'meeting', meeting.id, 'create', {
      projectId: meeting.projectId,
      title: meeting.title,
      scheduledAt: meeting.scheduledAt,
      participantCount: meeting.participantIds.length,
    });
    return meeting;
  },

  async update(actor: FollowThroughActor, id: string, body: Record<string, unknown>): Promise<Meeting> {
    assertCanWrite(actor);
    const { meeting: current, project } = await loadAccessible(actor, id);
    assertProjectWrite(actor, project); // Sprint 25
    assertSameProject(body, current.projectId);

    const updates: Partial<Meeting> = { updatedBy: actor.userId };
    if (body.title !== undefined) updates.title = cleanRequiredText(body.title, 'title', 255);
    if (body.agenda !== undefined) updates.agenda = cleanOptionalText(body.agenda, 'agenda', 10000);
    if (body.notes !== undefined) updates.notes = cleanOptionalText(body.notes, 'notes', 20000);
    if (body.scheduledAt !== undefined) updates.scheduledAt = cleanRequiredDateTime(body.scheduledAt, 'scheduledAt');
    if (body.durationMinutes !== undefined) updates.durationMinutes = cleanDuration(body.durationMinutes);
    if (body.location !== undefined) updates.location = cleanOptionalText(body.location, 'location', 255);
    if (body.meetingLink !== undefined) updates.meetingLink = cleanMeetingLink(body.meetingLink);
    if (body.organizerId !== undefined) {
      await requireProjectUser(body.organizerId, project, 'organizerId');
      updates.organizerId = body.organizerId as string;
    }
    if (body.participantIds !== undefined) updates.participantIds = await cleanParticipants(body.participantIds, project);
    if (body.status !== undefined) updates.status = cleanEnum(body.status, MEETING_STATUSES, 'status');

    const updated = (await MeetingRepository.update(id, updates)) as Meeting;

    if (updates.status !== undefined && updates.status !== current.status) {
      await logFollowThroughActivity(actor, 'meeting', id, 'status_change', {
        projectId: updated.projectId,
        from: current.status,
        to: updated.status,
      });
    }
    const changed = (Object.keys(updates) as Array<keyof Meeting>).filter(
      (k) => k !== 'updatedBy' && k !== 'status' && JSON.stringify(updated[k]) !== JSON.stringify(current[k])
    );
    if (changed.length > 0) {
      await logFollowThroughActivity(actor, 'meeting', id, 'update', { projectId: updated.projectId, fields: changed });
    }
    return updated;
  },

  async remove(actor: FollowThroughActor, id: string): Promise<void> {
    assertCanDelete(actor);
    const { meeting, project } = await loadAccessible(actor, id);
    assertProjectWrite(actor, project); // Sprint 25
    // Action items raised in the meeting stay, unlinked; references to it are cleared.
    await ActionItemRepository.detachMeeting(id);
    await WaitingForRepository.clearRelated('meeting', id);
    await FollowUpRepository.clearRelated('meeting', id);
    await MeetingRepository.delete(id);
    await logFollowThroughActivity(actor, 'meeting', id, 'delete', { projectId: meeting.projectId, title: meeting.title });
  },
};
