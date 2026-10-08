import { Project, ProjectTeamMember, SafeUser } from '../models/types';
import { ProjectRepository } from '../repositories/projectRepository';
import { issueMemoryDeliveryCode, issueSequenceDeliveryCode } from '../repositories/deliveryCodes';
import { isDbConnected } from '../config/database';
import { UserRepository } from '../repositories/userRepository';
import { forbidden, httpError, validationError } from './followThroughSupport';

/**
 * Sprint 16 — server-side guards for V2 project create/update.
 *
 * - Ids are server-generated on POST /projects; a client can propose a
 *   business code, which must be well-formed and unused. (The legacy V1.1
 *   import, POST /projects/migrate, keeps its own ids but can never overwrite.)
 * - Updates are project administration: admins, or the project's current
 *   manager. Listed members (whatever their role) can work on the project's
 *   delivery records but cannot change its settings, manager or members — so
 *   nobody can add themselves to a project, take one over, or grant
 *   themselves administration by being listed.
 * - Only allowlisted fields are stored; id, code, createdAt, updatedAt and any
 *   other client field are ignored.
 */

type Actor = Pick<SafeUser, 'id' | 'role'>;

export const PROJECT_STATUSES = ['planning', 'in-progress', 'awaiting-sow-sign-off', 'on-hold', 'completed', 'archived'] as const;
export const PROJECT_RISKS = ['Low', 'Medium', 'High', 'Critical'] as const;
export const PROJECT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/;

/** V2 project fields a client may set (managerId/members have their own rule). */
const V2_FIELDS = [
  'name', 'client', 'status', 'risk', 'progress', 'budget', 'sprint', 'startDate', 'endDate', 'productId', 'productName',
  'portfolioId', 'portfolioName', 'teamId', 'teamName', 'sowStatus', 'poc', 'developer', 'qa', 'ba', 'remarks', 'month',
  'quarter', 'year', 'jiraLinks', 'managerName', 'managerId', 'members',
] as const;

/**
 * V1.1 display fields the browser keeps on projects. The memory store has
 * always round-tripped them, and the V1.1 sync writes the server's copy back
 * into browser storage, so dropping them would erase them there.
 */
const V1_COMPAT_FIELDS = [
  'manager', 'productManager', 'hd', 'sow', 'confluenceLink', 'estimatedStart', 'estimatedEnd', 'actualStart', 'actualEnd', 'lastUpdate',
] as const;

export const PROJECT_EDITABLE_FIELDS: readonly string[] = [...V2_FIELDS, ...V1_COMPAT_FIELDS];

const blank = (v: unknown) => v === null || v === undefined || v === '';

function text(value: unknown, field: string, max: number): string {
  if (blank(value)) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw validationError(`Field '${field}' must be text.`);
  const out = String(value).trim();
  if (out.length > max) throw validationError(`Field '${field}' must be at most ${max} characters.`);
  return out;
}

/** An absolute https URL without credentials, normalised; anything else is not stored (''). */
export function safeHttpsUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || raw.length > 2048 || !/^https:\/\//i.test(raw)) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

function members(value: unknown): ProjectTeamMember[] {
  if (blank(value)) return [];
  if (!Array.isArray(value) || value.length > 200) throw validationError("Field 'members' must be a list of at most 200 people.");
  return value.map((m: any) => {
    if (!m || typeof m !== 'object') throw validationError("Each entry in 'members' must be an object.");
    const member: ProjectTeamMember = { name: text(m.name, 'members.name', 150), role: text(m.role, 'members.role', 100) };
    if (!blank(m.userId)) member.userId = text(m.userId, 'members.userId', 64);
    return member;
  });
}

const memberKey = (list: ProjectTeamMember[] | undefined) =>
  JSON.stringify((list || []).map((m) => `${m.userId || ''}|${m.name || ''}|${m.role || ''}`).sort());

async function activeUserId(value: unknown, field: string): Promise<string> {
  if (typeof value !== 'string' || !value) throw validationError(`Field '${field}' must be a user id.`);
  const user = await UserRepository.findById(value);
  if (!user) throw validationError(`Field '${field}' does not match a user.`);
  if (!user.isActive) throw validationError(`Field '${field}' refers to a deactivated user.`);
  return user.id;
}

async function checkMemberUsers(list: ProjectTeamMember[]): Promise<void> {
  for (const m of list) {
    if (m.userId && !(await UserRepository.findById(m.userId))) throw validationError(`A member's userId '${m.userId}' does not match a user.`);
  }
}

/**
 * Validates allowlisted fields. On update, enum-like fields are only checked
 * when they change, so a legacy value already stored cannot block every later
 * V1.1 background sync of that project.
 */
function cleanValues(input: Record<string, any>, current?: Project): Record<string, any> {
  const out: Record<string, any> = {};
  const changed = (field: string) => !current || input[field] !== (current as any)[field];
  for (const field of PROJECT_EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field) || input[field] === undefined) continue;
    const value = input[field];
    switch (field) {
      case 'managerId': case 'members': break; // handled by the membership rule
      case 'name':
        if (blank(value) || typeof value !== 'string' || !value.trim()) throw validationError("Field 'name' cannot be empty.");
        out.name = text(value, 'name', 255);
        break;
      case 'status':
        if (changed('status') && !(PROJECT_STATUSES as readonly string[]).includes(value)) throw validationError(`Field 'status' must be one of: ${PROJECT_STATUSES.join(', ')}.`);
        out.status = value;
        break;
      case 'risk':
        if (changed('risk') && !(PROJECT_RISKS as readonly string[]).includes(value)) throw validationError(`Field 'risk' must be one of: ${PROJECT_RISKS.join(', ')}.`);
        out.risk = value;
        break;
      case 'progress': {
        const n = Number(value);
        if (changed('progress') && (!Number.isFinite(n) || n < 0 || n > 100)) throw validationError("Field 'progress' must be a number from 0 to 100.");
        out.progress = Number.isFinite(n) ? n : (current ? current.progress : 0);
        break;
      }
      case 'budget': {
        const n = Number(value);
        if (changed('budget') && (!Number.isFinite(n) || n < 0)) throw validationError("Field 'budget' must be a number of at least 0.");
        out.budget = Number.isFinite(n) ? n : (current ? current.budget : 0);
        break;
      }
      case 'confluenceLink': out.confluenceLink = safeHttpsUrl(value); break;
      case 'jiraLinks': out.jiraLinks = value; break; // normalised by the repository (Sprint 15A)
      case 'remarks': out.remarks = text(value, 'remarks', 5000); break;
      // Sprint 24: the reporting-period columns are short by design (a month name, 'Q3', '2026').
      case 'month': out.month = text(value, 'month', 50); break;
      case 'quarter': out.quarter = text(value, 'quarter', 20); break;
      case 'year': out.year = text(value, 'year', 20); break;
      default: out[field] = text(value, field, 255);
    }
  }
  return out;
}

/**
 * The next PRJ-### id: never an id or code in use, and — Sprint 24 — never one
 * issued before, even if that project was deleted. It comes from a persistent
 * monotonic counter (a PostgreSQL sequence, or the embedded store's counter),
 * raised above every stored PRJ-### id and code.
 */
async function nextProjectId(): Promise<string> {
  const all = await ProjectRepository.findAll();
  const used = new Set<string>(all.flatMap((p) => [p.id, p.code].filter(Boolean) as string[]));
  for (;;) {
    const id = isDbConnected() ? await issueSequenceDeliveryCode('project', used) : issueMemoryDeliveryCode('project', used);
    if (!used.has(id)) return id;
  }
}

/** Roles the PATCH /projects/:id route admits (requireRoles is hierarchical, so product managers too). */
const PROJECT_ADMIN_ROLES = ['admin', 'project-manager', 'product-manager'];

export const ProjectGuards = {
  /**
   * Project administration — editing a project's settings, budget, status,
   * risk, metadata, manager or members — belongs to administrators and the
   * project's current manager (managerId). Being listed in members grants
   * participation (delivery work, follow-through, AI context), never
   * administration.
   */
  canAdminister(actor: Actor, project: Project): boolean {
    if (actor.role === 'admin') return true;
    return PROJECT_ADMIN_ROLES.includes(actor.role) && !!project.managerId && project.managerId === actor.id;
  },

  async prepareCreate(body: Record<string, any>, actor: Actor): Promise<Partial<Project>> {
    const input = body && typeof body === 'object' ? body : {};
    const clean: Partial<Project> = cleanValues(input);
    if (!clean.name) throw validationError("Field 'name' is required.");
    const id = await nextProjectId();
    let code = id;
    if (!blank(input.code)) {
      if (typeof input.code !== 'string' || !PROJECT_CODE_PATTERN.test(input.code)) {
        throw validationError("Field 'code' may only use letters, digits, '.', '_' and '-' (up to 50 characters).");
      }
      code = input.code;
    }
    // The creator manages the project unless an active manager is named.
    clean.managerId = blank(input.managerId) ? actor.id : await activeUserId(input.managerId, 'managerId');
    if (blank(clean.managerName)) {
      // Sprint 24: the name shown for the manager is the manager's own, never a demo default.
      const manager = await UserRepository.findById(clean.managerId);
      clean.managerName = manager ? `${manager.firstName || ''} ${manager.lastName || ''}`.trim() || manager.email : '';
    }
    const memberList = members(input.members);
    await checkMemberUsers(memberList);
    clean.members = memberList;
    return { ...clean, id, code };
  },

  async prepareUpdate(existing: Project, body: Record<string, any>, actor: Actor): Promise<Partial<Project>> {
    const input = body && typeof body === 'object' ? body : {};
    // Checked in the service as well as by the route, so a direct call is held to the same rule.
    if (!this.canAdminister(actor, existing)) {
      throw forbidden("Only an administrator or the project's manager can change this project.");
    }
    const clean: Partial<Project> = cleanValues(input, existing);
    if (!blank(input.managerId) && input.managerId !== existing.managerId) {
      clean.managerId = await activeUserId(input.managerId, 'managerId');
    }
    if (input.members !== undefined) {
      const memberList = members(input.members);
      if (memberKey(memberList) !== memberKey(existing.members)) {
        await checkMemberUsers(memberList);
        clean.members = memberList;
      }
    }
    return clean;
  },

  duplicate(id: string) {
    return httpError(409, 'CONFLICT', `A project with id or code '${id}' already exists.`);
  },
};
