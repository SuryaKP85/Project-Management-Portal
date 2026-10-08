/**
 * Sprint 16 — repository backstop: a create never replaces an existing
 * record. Services generate ids, so this should not happen through the API;
 * if it does (an internal caller or a legacy import), the create fails with a
 * 409 the global errorHandler reports, instead of silently overwriting.
 */
export function duplicateRecordError(kind: string, id: string, field = 'id'): Error & { status: number; code: string } {
  return Object.assign(new Error(`A ${kind} with ${field} '${id}' already exists.`), { status: 409, code: 'CONFLICT' });
}

const SERVER_OWNED = ['id', 'code', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'] as const;

/**
 * Sprint 23 — a create request never chooses the record's identity. Services
 * pass the client body through this, so the repository generates the id and
 * code. `keep` names a client-proposed business identifier the product
 * deliberately accepts (portfolio and product codes), which stays unique.
 */
export function withoutClientIdentity<T extends object>(body: T, keep: ReadonlyArray<(typeof SERVER_OWNED)[number]> = []): T {
  const out: any = { ...(body || {}) };
  for (const key of SERVER_OWNED) if (!keep.includes(key)) delete out[key];
  return out;
}
