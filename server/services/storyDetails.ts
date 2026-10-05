import crypto from 'crypto';
import { StoryCriteria, UserStoryFormat } from '../models/types';

/**
 * Sprint 19 — the canonical Story details, shared by the guards (writes) and
 * the story repository (reads). No imports beyond types, so both can use it.
 *
 * userStory          { asA, iWant, soThat } — strings, nothing else.
 * acceptanceCriteria [{ id, text, completed }] — ordered.
 *
 * Writes are strict (normaliseUserStory / normaliseCriteria): unknown keys are
 * dropped, malformed items are rejected, legacy string criteria become
 * objects. Reads are lenient (readUserStory / readCriteria): whatever older
 * code stored — strings, objects, the legacy flat persona fields — comes back
 * in the canonical shape, the same in memory and PostgreSQL.
 */

export const STORY_DETAIL_LIMITS = { userStoryField: 2000, criteria: 50, criterionText: 2000 } as const;

type Fail = (message: string) => Error;

const CRITERION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Single-line text: control characters become spaces, then trimmed (project convention). */
const clean = (value: string) => value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();

export const newCriterionId = () => `crit_${crypto.randomBytes(6).toString('hex')}`;

function storyText(value: unknown, field: string, fail: Fail): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw fail(`Field 'userStory.${field}' must be text.`);
  const text = clean(value);
  if (text.length > STORY_DETAIL_LIMITS.userStoryField) {
    throw fail(`Field 'userStory.${field}' must be at most ${STORY_DETAIL_LIMITS.userStoryField} characters.`);
  }
  return text;
}

export function normaliseUserStory(value: unknown, fail: Fail): UserStoryFormat {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail("Field 'userStory' must be an object.");
  const v = value as Record<string, unknown>;
  return { asA: storyText(v.asA, 'asA', fail), iWant: storyText(v.iWant, 'iWant', fail), soThat: storyText(v.soThat, 'soThat', fail) };
}

/**
 * Validates a criteria list for storage. Strings become new items; objects
 * keep a well-formed, unique id and their completed flag; anything else is a
 * validation error. Order is preserved.
 */
export function normaliseCriteria(value: unknown, fail: Fail): StoryCriteria[] {
  if (!Array.isArray(value)) throw fail("Field 'acceptanceCriteria' must be a list.");
  if (value.length > STORY_DETAIL_LIMITS.criteria) {
    throw fail(`Field 'acceptanceCriteria' can contain at most ${STORY_DETAIL_LIMITS.criteria} criteria.`);
  }
  const seen = new Set<string>();
  return value.map((item, i) => {
    const at = `acceptanceCriteria[${i}]`;
    let rawText: unknown;
    let id: unknown;
    let completed: unknown = false;
    if (typeof item === 'string') {
      rawText = item;
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      ({ text: rawText, id, completed = false } = item as Record<string, unknown>);
    } else {
      throw fail(`${at} must be text or an object with 'text'.`);
    }
    if (typeof rawText !== 'string') throw fail(`${at}.text must be text.`);
    const text = clean(rawText);
    if (!text) throw fail(`${at}.text cannot be empty.`);
    if (text.length > STORY_DETAIL_LIMITS.criterionText) throw fail(`${at}.text must be at most ${STORY_DETAIL_LIMITS.criterionText} characters.`);
    if (typeof completed !== 'boolean') throw fail(`${at}.completed must be true or false.`);
    const keep = typeof id === 'string' && CRITERION_ID.test(id) && !seen.has(id);
    const finalId = keep ? (id as string) : newCriterionId();
    seen.add(finalId);
    return { id: finalId, text, completed };
  });
}

/** Lenient read of any stored criteria list into the canonical shape (items without text are dropped). */
export function readCriteria(raw: unknown): StoryCriteria[] {
  if (!Array.isArray(raw)) return [];
  const out: StoryCriteria[] = [];
  raw.forEach((item, i) => {
    const obj = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
    const text = typeof item === 'string' ? item : typeof obj?.text === 'string' ? obj.text : '';
    if (!text.trim()) return;
    const id = typeof obj?.id === 'string' && CRITERION_ID.test(obj.id) ? obj.id : `legacy_${i + 1}`;
    out.push({ id, text, completed: obj?.completed === true });
  });
  return out;
}

/** Lenient read of a stored user story; falls back to the legacy flat fields. */
export function readUserStory(raw: unknown, legacy: Record<string, unknown> = {}): UserStoryFormat {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const str = (a: unknown, b: unknown) => (typeof a === 'string' && a ? a : typeof b === 'string' ? b : '');
  return { asA: str(v.asA, legacy.userPersona), iWant: str(v.iWant, legacy.userAction), soThat: str(v.soThat, legacy.userBenefit) };
}

/** A stored story in the canonical shape: details normalised, legacy flat fields removed. */
export function canonicalStory<T extends Record<string, any>>(story: T): T {
  const { userPersona, userAction, userBenefit, ...rest } = story as Record<string, any>;
  return {
    ...rest,
    userStory: readUserStory(story.userStory, { userPersona, userAction, userBenefit }),
    acceptanceCriteria: readCriteria(story.acceptanceCriteria),
  } as unknown as T;
}
