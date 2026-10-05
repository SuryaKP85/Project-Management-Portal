import { Meeting, MeetingStatus } from '../models/types';
import { persistentMap } from '../config/persistence';
import { isDbConnected, query } from '../config/database';
import { matchesSearch, matchesValue, newId, toIso, toOptional } from './followThroughRows';

/**
 * Sprint 14 — meeting persistence.
 *
 * Established repository shape: a PostgreSQL branch guarded by isDbConnected()
 * with an in-memory fallback store. SQL narrows by project; applyFilter() is
 * the single source of filter semantics in both modes. Writes to PostgreSQL
 * are reported when they fail, never disguised as success.
 */

// Sprint 20: restored from / saved to the embedded data file in persistent mode.
const memoryMeetings = persistentMap<Meeting>('meetings');

export interface MeetingFilter {
  /** Access scope set by the service: only these projects are returned. */
  projectIds?: string[];
  projectId?: string;
  status?: string;
  organizerId?: string;
  participantId?: string;
  /** Inclusive lower / upper bounds on scheduledAt (ISO date or date-time). */
  from?: string;
  to?: string;
  search?: string;
}

function mapRow(r: any): Meeting {
  const participants = Array.isArray(r.participant_ids)
    ? r.participant_ids
    : typeof r.participant_ids === 'string'
      ? JSON.parse(r.participant_ids)
      : [];
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    agenda: toOptional(r.agenda),
    notes: toOptional(r.notes),
    scheduledAt: toIso(r.scheduled_at),
    durationMinutes: Number(r.duration_minutes ?? 30),
    location: toOptional(r.location),
    meetingLink: toOptional(r.meeting_link),
    organizerId: r.organizer_id,
    participantIds: participants.map(String),
    status: r.status as MeetingStatus,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

function applyFilter(items: Meeting[], filter?: MeetingFilter): Meeting[] {
  if (!filter) return items;
  const scope = filter.projectIds ? new Set(filter.projectIds) : null;
  const from = filter.from ? new Date(filter.from).getTime() : null;
  // A date-only upper bound includes the whole of that day.
  const to = filter.to
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(filter.to) ? `${filter.to}T23:59:59.999Z` : filter.to).getTime()
    : null;
  return items.filter((m) => {
    if (scope && !scope.has(m.projectId)) return false;
    if (filter.projectId && m.projectId !== filter.projectId) return false;
    if (!matchesValue(filter.status, m.status)) return false;
    if (filter.organizerId && m.organizerId !== filter.organizerId) return false;
    if (filter.participantId && !m.participantIds.includes(filter.participantId)) return false;
    const at = new Date(m.scheduledAt).getTime();
    if (from !== null && !Number.isNaN(from) && at < from) return false;
    if (to !== null && !Number.isNaN(to) && at > to) return false;
    return matchesSearch(filter.search, [m.title, m.agenda, m.location]);
  });
}

/** Most recent (or furthest upcoming) first. */
function bySchedule(a: Meeting, b: Meeting): number {
  return b.scheduledAt.localeCompare(a.scheduledAt) || b.createdAt.localeCompare(a.createdAt);
}

const COLUMNS = `id, project_id, title, agenda, notes, scheduled_at, duration_minutes, location, meeting_link,
  organizer_id, participant_ids, status, created_by, updated_by, created_at, updated_at`;

function rowValues(m: Meeting): unknown[] {
  return [
    m.id, m.projectId, m.title, m.agenda || null, m.notes || null, m.scheduledAt, m.durationMinutes,
    m.location || null, m.meetingLink || null, m.organizerId || null, JSON.stringify(m.participantIds || []),
    m.status, m.createdBy || null, m.updatedBy || null, m.createdAt, m.updatedAt,
  ];
}

export const MeetingRepository = {
  async findAll(filter?: MeetingFilter): Promise<Meeting[]> {
    if (filter?.projectIds && filter.projectIds.length === 0) return [];
    if (isDbConnected()) {
      try {
        const res = filter?.projectIds
          ? await query(`SELECT * FROM meetings WHERE project_id = ANY($1::text[])`, [filter.projectIds])
          : await query(`SELECT * FROM meetings`);
        return applyFilter(res.rows.map(mapRow), filter).sort(bySchedule);
      } catch (err: any) {
        console.warn('DB error in MeetingRepository.findAll, falling back to memory:', err.message);
      }
    }
    return applyFilter(Array.from(memoryMeetings.values()), filter).sort(bySchedule);
  },

  async findById(id: string): Promise<Meeting | null> {
    if (isDbConnected()) {
      try {
        const res = await query('SELECT * FROM meetings WHERE id = $1', [id]);
        if (res.rows.length > 0) return mapRow(res.rows[0]);
      } catch (err: any) {
        console.warn('DB error in MeetingRepository.findById, falling back to memory:', err.message);
      }
    }
    return memoryMeetings.get(id) || null;
  },

  async create(data: Omit<Meeting, 'id' | 'createdAt' | 'updatedAt'>): Promise<Meeting> {
    const now = new Date().toISOString();
    const meeting: Meeting = { ...data, id: newId('mtg'), createdAt: now, updatedAt: now };
    if (isDbConnected()) {
      await query(
        `INSERT INTO meetings (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)`,
        rowValues(meeting)
      );
    }
    memoryMeetings.set(meeting.id, meeting);
    return meeting;
  },

  async update(id: string, updates: Partial<Meeting>): Promise<Meeting | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const updated: Meeting = {
      ...existing,
      ...updates,
      id: existing.id,
      projectId: existing.projectId,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      updatedAt: new Date().toISOString(),
    };
    if (isDbConnected()) {
      await query(
        `UPDATE meetings SET title = $1, agenda = $2, notes = $3, scheduled_at = $4, duration_minutes = $5,
           location = $6, meeting_link = $7, organizer_id = $8, participant_ids = $9::jsonb, status = $10,
           updated_by = $11, updated_at = $12
         WHERE id = $13`,
        [
          updated.title, updated.agenda || null, updated.notes || null, updated.scheduledAt, updated.durationMinutes,
          updated.location || null, updated.meetingLink || null, updated.organizerId || null,
          JSON.stringify(updated.participantIds || []), updated.status, updated.updatedBy || null, updated.updatedAt, id,
        ]
      );
    }
    memoryMeetings.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const existedInMemory = memoryMeetings.delete(id);
    if (isDbConnected()) {
      // PostgreSQL is authoritative: a persisted row need not be in memory.
      const res = await query('DELETE FROM meetings WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    }
    return existedInMemory;
  },
};
