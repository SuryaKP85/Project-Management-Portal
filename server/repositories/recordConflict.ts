/**
 * Sprint 16 — repository backstop: a create never replaces an existing
 * record. Services generate ids, so this should not happen through the API;
 * if it does (an internal caller or a legacy import), the create fails with a
 * 409 the global errorHandler reports, instead of silently overwriting.
 */
export function duplicateRecordError(kind: string, id: string): Error & { status: number; code: string } {
  return Object.assign(new Error(`A ${kind} with id '${id}' already exists.`), { status: 409, code: 'CONFLICT' });
}
