/**
 * Sprint 9.6A — live PostgreSQL persistence proof for RoadmapItem.
 *
 * Gated: when DATABASE_URL is absent or PostgreSQL cannot be reached, this
 * prints SKIPPED and exits 0 so local validation and CI never fail for lack
 * of a database. When PostgreSQL is available it applies server/db/schema.sql
 * (idempotent) and exercises the repository's PostgreSQL branches end to end,
 * verifying persistence with direct SQL rather than the in-process memory map.
 *
 * Run manually:  npx tsx tests/roadmap-postgres.test.ts
 */
import fs from 'fs';
import { initDatabase, isDbConnected, query, closeDatabase } from '../server/config/database';
import { RoadmapRepository, ROADMAP_CODE_PATTERN, nextCodeNumber } from '../server/repositories/roadmapRepository';
import { RoadmapService } from '../server/services/roadmapService';
import { GoalService } from '../server/services/goalService';
import { GovernanceLinkRepository } from '../server/repositories/governanceLinkRepository';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    failed++;
  }
}

/** Isolated identifiers: a run-specific suffix keeps them clear of seeded data. */
const RUN = `s96a_${Date.now().toString(36)}`;
const FX = {
  userId: `usr_${RUN}`,
  portfolioId: `port_${RUN}`,
  productId: `prod_${RUN}`,
  projectId: `PRJ-${RUN.toUpperCase()}`,
  goalId: `goal_${RUN}`,
  goalId2: `goal_${RUN}_2`,
  itemA: `rm_${RUN}_a`,
  itemB: `rm_${RUN}_b`,
  codeA: `RM-${RUN.toUpperCase()}-A`,
  codeB: `RM-${RUN.toUpperCase()}-B`,
  highId: `rm_${RUN}_high`,
  dupId: `rm_${RUN}_dup`,
};
const actor = { id: FX.userId, name: 'S96A Live Test' };
/** Rows created by the 9.6B generation checks; removed in cleanup. */
const generatedIds: string[] = [];

async function createFixtures() {
  await query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, 'x', 'S96A', 'Fixture', 'admin') ON CONFLICT (id) DO NOTHING`,
    [FX.userId, `${RUN}@example.test`]
  );
  await query(
    `INSERT INTO portfolios (id, code, name) VALUES ($1, $2, 'S96A Portfolio') ON CONFLICT (id) DO NOTHING`,
    [FX.portfolioId, `PF-${RUN}`]
  );
  await query(
    `INSERT INTO products (id, code, name, portfolio_id) VALUES ($1, $2, 'S96A Product', $3) ON CONFLICT (id) DO NOTHING`,
    [FX.productId, `PD-${RUN}`, FX.portfolioId]
  );
  await query(
    `INSERT INTO projects (id, code, name, client, product_id, portfolio_id)
     VALUES ($1, $1, 'S96A Project', 'S96A Client', $2, $3) ON CONFLICT (id) DO NOTHING`,
    [FX.projectId, FX.productId, FX.portfolioId]
  );
  await query(
    `INSERT INTO goals (id, objective, status, progress) VALUES ($1, 'S96A Goal', 'in-progress', 40) ON CONFLICT (id) DO NOTHING`,
    [FX.goalId]
  );
  await query(
    `INSERT INTO goals (id, objective, status, progress) VALUES ($1, 'S96C control goal', 'in-progress', 10) ON CONFLICT (id) DO NOTHING`,
    [FX.goalId2]
  );
}

/** Best-effort teardown; each statement is independent so one failure does not block the rest. */
async function cleanup() {
  const allItemIds = [FX.itemA, FX.itemB, FX.highId, FX.dupId, ...generatedIds];
  const statements: Array<[string, any[]]> = [
    [`DELETE FROM governance_links WHERE governance_type = 'roadmap' AND governance_id = ANY($1)`, [allItemIds]],
    [`DELETE FROM activity_logs WHERE actor_id = $1`, [FX.userId]],
    [`DELETE FROM roadmap_items WHERE id = ANY($1)`, [allItemIds]],
    [`DELETE FROM governance_links WHERE target_type = 'goal' AND target_id IN ($1, $2)`, [FX.goalId, FX.goalId2]],
    [`DELETE FROM goals WHERE id IN ($1, $2)`, [FX.goalId, FX.goalId2]],
    [`DELETE FROM projects WHERE id = $1`, [FX.projectId]],
    [`DELETE FROM products WHERE id = $1`, [FX.productId]],
    [`DELETE FROM portfolios WHERE id = $1`, [FX.portfolioId]],
    [`DELETE FROM users WHERE id = $1`, [FX.userId]],
  ];
  for (const [sql, params] of statements) {
    try {
      await query(sql, params);
    } catch (err: any) {
      console.warn(`  (cleanup) ${err.message}`);
    }
  }
}

async function rowById(id: string) {
  const res = await query('SELECT * FROM roadmap_items WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function main() {
  console.log('\n========================================');
  console.log('🧪 ROADMAP POSTGRESQL PERSISTENCE TEST');
  console.log('========================================\n');

  if (!process.env.DATABASE_URL) {
    console.log('SKIPPED: DATABASE_URL is not set. Nothing to test without PostgreSQL.');
    process.exit(0);
  }

  await initDatabase();
  if (!isDbConnected()) {
    console.log('SKIPPED: PostgreSQL could not be reached at DATABASE_URL.');
    process.exit(0);
  }

  try {
    // 2. Apply the schema (idempotent: CREATE ... IF NOT EXISTS throughout).
    await query(fs.readFileSync('server/db/schema.sql', 'utf8'));
    const tableCheck = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'roadmap_items' ORDER BY ordinal_position`
    );
    assert(tableCheck.rows.length === 21, `roadmap_items exists with 21 columns (${tableCheck.rows.length})`);

    await createFixtures();

    // 4. Create through the repository (service validation is exercised too).
    const created = await RoadmapService.createItem(
      {
        id: FX.itemA,
        code: FX.codeA,
        name: 'S96A persisted initiative',
        description: 'live pg probe',
        status: 'committed',
        priority: 'high',
        startDate: '2026-03-01',
        targetDate: '2026-11-30',
        ownerId: FX.userId,
        productId: FX.productId,
        portfolioId: FX.portfolioId,
        projectId: FX.projectId,
      } as any,
      actor
    );
    assert(created.id === FX.itemA, 'Create returned the requested id');

    // 5. Row exists in PostgreSQL — proven with SQL, not the memory map.
    const rowA = await rowById(FX.itemA);
    assert(!!rowA, 'Created row is present in roadmap_items');
    assert(rowA?.code === FX.codeA && rowA?.status === 'committed' && rowA?.priority === 'high', 'Persisted columns match the create payload');
    assert(rowA?.project_id === FX.projectId && rowA?.owner_id === FX.userId, 'FK columns persisted with canonical ids');
    assert(rowA?.project_name === 'S96A Project' && rowA?.owner_name === 'S96A Fixture', 'Denormalised names resolved server-side and persisted');

    // 6–7. findById through the PG branch, temporal contract intact.
    const readA = await RoadmapRepository.findById(FX.itemA);
    assert(!!readA, 'findById returns the persisted row');
    assert(readA?.startDate === '2026-03-01', `startDate is YYYY-MM-DD (${readA?.startDate})`);
    assert(readA?.targetDate === '2026-11-30', `targetDate is YYYY-MM-DD (${readA?.targetDate})`);
    assert(typeof readA?.createdAt === 'string' && !Number.isNaN(Date.parse(readA!.createdAt)), 'createdAt is an ISO-compatible string');
    assert(typeof readA?.updatedAt === 'string' && !Number.isNaN(Date.parse(readA!.updatedAt)), 'updatedAt is an ISO-compatible string');

    // 8. Update persists.
    await RoadmapService.updateItem(FX.itemA, { status: 'in-progress', targetDate: '2026-12-15' }, actor);
    const rowAfterUpdate = await rowById(FX.itemA);
    assert(rowAfterUpdate?.status === 'in-progress', 'Update persisted status');
    assert((await RoadmapRepository.findById(FX.itemA))?.targetDate === '2026-12-15', 'Update persisted a date, read back as YYYY-MM-DD');

    // 9. Filters through the PG findAll path.
    const second = await RoadmapService.createItem(
      { id: FX.itemB, code: FX.codeB, name: 'S96A second initiative', status: 'proposed', priority: 'low', portfolioId: FX.portfolioId } as any,
      actor
    );
    const has = (items: any[], id: string) => items.some((i) => i.id === id);
    const byProject = await RoadmapRepository.findAll({ projectId: FX.projectId });
    assert(has(byProject, FX.itemA) && !has(byProject, FX.itemB), 'projectId filter');
    const byProduct = await RoadmapRepository.findAll({ productId: FX.productId });
    assert(has(byProduct, FX.itemA) && !has(byProduct, FX.itemB), 'productId filter');
    const byPortfolio = await RoadmapRepository.findAll({ portfolioId: FX.portfolioId });
    assert(has(byPortfolio, FX.itemA) && has(byPortfolio, FX.itemB), 'portfolioId filter');
    const byOwner = await RoadmapRepository.findAll({ ownerId: FX.userId });
    assert(has(byOwner, FX.itemA) && !has(byOwner, FX.itemB), 'ownerId filter');
    const byStatus = await RoadmapRepository.findAll({ status: 'in-progress' });
    assert(has(byStatus, FX.itemA) && !has(byStatus, FX.itemB), 'status filter');
    const byPriority = await RoadmapRepository.findAll({ priority: 'low' });
    assert(has(byPriority, FX.itemB) && !has(byPriority, FX.itemA), 'priority filter');
    const bySearch = await RoadmapRepository.findAll({ search: 'second initiative' });
    assert(has(bySearch, FX.itemB) && !has(bySearch, FX.itemA), 'search filter');

    // ---- Sprint 9.6E: SQL-pushed filters must equal the JavaScript semantics ----
    const jsFilter = (items: any[], f: any) => items.filter((i) =>
      (!f.productId || i.productId === f.productId) &&
      (!f.portfolioId || i.portfolioId === f.portfolioId) &&
      (!f.projectId || i.projectId === f.projectId) &&
      (!f.ownerId || i.ownerId === f.ownerId) &&
      (!f.status || f.status === 'all' || i.status.toLowerCase() === f.status.toLowerCase()) &&
      (!f.priority || f.priority === 'all' || i.priority.toLowerCase() === f.priority.toLowerCase()) &&
      (!f.search || i.name.toLowerCase().includes(f.search.toLowerCase()) || i.code.toLowerCase().includes(f.search.toLowerCase()) || (i.description || '').toLowerCase().includes(f.search.toLowerCase()))
    );
    const fullSet = await RoadmapRepository.findAll();
    const parityFilters: Array<[string, any]> = [
      ['projectId', { projectId: FX.projectId }], ['ownerId', { ownerId: FX.userId }],
      ['status', { status: 'in-progress' }], ['mixed-case status', { status: 'IN-Progress' }], ["status 'all'", { status: 'all' }],
      ['priority', { priority: 'low' }], ['mixed-case priority', { priority: 'LOW' }], ["priority 'all'", { priority: 'all' }],
      ['search', { search: 'second initiative' }], ['search literal %', { search: '%' }], ['search literal _', { search: '_' }],
      ['combined', { portfolioId: FX.portfolioId, priority: 'LOW', search: 'S96A' }],
    ];
    for (const [label, f] of parityFilters) {
      const actual = (await RoadmapRepository.findAll(f)).map((i) => i.id);
      const expected = jsFilter(fullSet, f).map((i) => i.id);
      assert(JSON.stringify(actual) === JSON.stringify(expected), `SQL filter parity: ${label} (${actual.length} rows)`);
    }

    // 10. Reorder persisted rows.
    const reorder = await RoadmapService.reorderItems(
      [{ id: FX.itemA, sequence: 5000 }, { id: FX.itemB, sequence: 4000 }, { id: `rm_${RUN}_missing`, sequence: 1 }],
      actor
    );
    assert(reorder.applied === 2 && reorder.skipped === 1, `Reorder applied 2 and skipped the unknown id (${reorder.applied}/${reorder.skipped})`);
    assert(Number((await rowById(FX.itemA))?.sequence) === 5000 && Number((await rowById(FX.itemB))?.sequence) === 4000, 'Reorder persisted sequences');
    const ordered = (await RoadmapRepository.findAll({ portfolioId: FX.portfolioId })).map((i) => i.id);
    assert(ordered.indexOf(FX.itemB) < ordered.indexOf(FX.itemA), 'findAll returns rows in persisted sequence order');

    // 11–12. Goal link through the service references the persisted id.
    const link = await RoadmapService.linkGoal(FX.itemA, FX.goalId, actor);
    assert(!!link && link.governanceType === 'roadmap' && link.governanceId === FX.itemA && link.targetId === FX.goalId, 'Goal link created via the service');
    const linkRows = await query(`SELECT * FROM governance_links WHERE governance_type = 'roadmap' AND governance_id = $1`, [FX.itemA]);
    assert(linkRows.rows.length === 1 && linkRows.rows[0].target_type === 'goal', 'Link row persisted referencing the roadmap id');
    const bulk = await GovernanceLinkRepository.findBySourceType('roadmap');
    assert(bulk.some((l) => l.governanceId === FX.itemA && l.targetId === FX.goalId), 'findBySourceType (PG) returns the link');
    assert(second.id === FX.itemB, 'Second item id sanity');

    // 13–16. Delete: true from rowCount, row gone, links removed by the service.
    const deleted = await RoadmapService.deleteItem(FX.itemA, actor);
    assert(deleted === true, 'deleteItem returns true for a persisted row');
    assert((await rowById(FX.itemA)) === null, 'Row removed from roadmap_items');
    const linksAfter = await query(`SELECT COUNT(*)::int AS n FROM governance_links WHERE governance_type = 'roadmap' AND governance_id = $1`, [FX.itemA]);
    assert(linksAfter.rows[0].n === 0, 'Goal links removed by the service cleanup path');
    assert((await RoadmapService.deleteItem(FX.itemA, actor)) === false, 'Deleting the same row again returns false');
    assert((await RoadmapService.deleteItem(FX.itemB, actor)) === true, 'Second item deleted');

    // ---- Sprint 9.6B: durable code generation ----
    const seq = await query(`SELECT sequencename FROM pg_sequences WHERE sequencename = 'roadmap_code_seq'`);
    assert(seq.rows.length === 1, 'roadmap_code_seq exists in pg_sequences');

    const suffix = (c: string) => Number(ROADMAP_CODE_PATTERN.exec(c)![1]);
    const maxValid = async () => nextCodeNumber((await query('SELECT code FROM roadmap_items')).rows.map((r) => r.code)) - 1;

    const beforeGen = await maxValid();
    const gen1 = await RoadmapService.createItem({ name: 'S96B gen 1' }, actor);
    generatedIds.push(gen1.id);
    assert(ROADMAP_CODE_PATTERN.test(gen1.code), `Generated code matches RM-### (${gen1.code})`);
    assert(suffix(gen1.code) > beforeGen, `Generated code exceeds the previous valid maximum (${gen1.code} > RM-${beforeGen})`);
    assert((await rowById(gen1.id))?.code === gen1.code, 'Generated code persisted');

    // "Restart": drop and re-open the connection; the sequence must continue.
    await closeDatabase();
    await initDatabase();
    assert(isDbConnected(), 'Reconnected after simulated restart');
    const gen2 = await RoadmapService.createItem({ name: 'S96B gen 2' }, actor);
    generatedIds.push(gen2.id);
    assert(suffix(gen2.code) > suffix(gen1.code), `Sequence continues across reconnect (${gen1.code} -> ${gen2.code})`);

    // Deleting the latest generated row must not free its code.
    assert((await RoadmapService.deleteItem(gen2.id, actor)) === true, 'Latest generated row deleted');
    const gen3 = await RoadmapService.createItem({ name: 'S96B gen 3' }, actor);
    generatedIds.push(gen3.id);
    assert(suffix(gen3.code) > suffix(gen2.code), `Deleted code is not re-issued (${gen2.code} deleted, next ${gen3.code})`);

    // A higher code appearing outside the generator (direct insert) is respected.
    await query(
      `INSERT INTO roadmap_items (id, code, name, status, priority, sequence) VALUES ($1, 'RM-9000', 'S96B direct high', 'proposed', 'low', 1)`,
      [FX.highId]
    );
    // The sequence is raised past the highest valid stored code before each
    // generated create, so the very next code must exceed the direct insert.
    const gen4 = await RoadmapService.createItem({ name: 'S96B gen 4' }, actor);
    generatedIds.push(gen4.id);
    assert(suffix(gen4.code) > 9000, `Generated code exceeds a directly inserted RM-9000 (${gen4.code})`);
    const codesNow = (await query('SELECT code FROM roadmap_items')).rows.map((r) => r.code);
    assert(new Set(codesNow).size === codesNow.length, 'No duplicate codes in roadmap_items');

    // Concurrent creates: nextval serialises them; all must persist distinctly.
    const burst = await Promise.all([1, 2, 3, 4].map((n) => RoadmapService.createItem({ name: `S96B burst ${n}` }, actor)));
    burst.forEach((i) => generatedIds.push(i.id));
    const burstCodes = burst.map((i) => i.code);
    assert(new Set(burstCodes).size === 4, `Concurrent creates produce distinct codes (${burstCodes.join(',')})`);
    const persistedBurst = await query('SELECT COUNT(*)::int AS n FROM roadmap_items WHERE id = ANY($1)', [burst.map((i) => i.id)]);
    assert(persistedBurst.rows[0].n === 4, 'All concurrent creates persisted');

    // Duplicate explicit code: rejected, no PG row, no phantom memory row.
    let dupRejected = false;
    try {
      await RoadmapService.createItem({ id: FX.dupId, code: gen1.code, name: 'S96B duplicate' } as any, actor);
    } catch {
      dupRejected = true;
    }
    assert(dupRejected, 'Duplicate explicit code is rejected');
    assert((await rowById(FX.dupId)) === null, 'Rejected duplicate wrote no PostgreSQL row');
    assert((await RoadmapRepository.findById(FX.dupId)) === null, 'Rejected duplicate left no phantom memory row');

    // ---- Sprint 9.6C: goal deletion removes its backlinks in PostgreSQL ----
    const holder = await RoadmapService.createItem({ name: 'S96C link holder' }, actor);
    generatedIds.push(holder.id);
    await RoadmapService.linkGoal(holder.id, FX.goalId, actor);
    await RoadmapService.linkGoal(holder.id, FX.goalId2, actor); // unrelated control link
    const goalLinks = async (goalId: string) =>
      (await query(`SELECT COUNT(*)::int AS n FROM governance_links WHERE target_type = 'goal' AND target_id = $1`, [goalId])).rows[0].n;
    assert((await goalLinks(FX.goalId)) === 1 && (await goalLinks(FX.goalId2)) === 1, 'Both goal links persisted (control)');
    const unrelatedBefore = (await query(`SELECT COUNT(*)::int AS n FROM governance_links WHERE NOT (target_type = 'goal' AND target_id = $1)`, [FX.goalId])).rows[0].n;

    // Cleanup is keyed on the goal found by findById, so it runs even though the
    // repository's memory-map boolean is false for a PG-only row (out of scope here).
    await GoalService.deleteGoal(FX.goalId, { id: FX.userId, firstName: 'S96A', lastName: 'Fixture', email: `${RUN}@example.test`, role: 'admin', isActive: true, createdAt: '', updatedAt: '' } as any);
    assert((await query('SELECT 1 FROM goals WHERE id = $1', [FX.goalId])).rows.length === 0, 'Goal row deleted from PostgreSQL');
    assert((await goalLinks(FX.goalId)) === 0, 'No governance_links rows remain for the deleted goal');
    assert((await goalLinks(FX.goalId2)) === 1, "The other goal's link on the same item remains");
    const unrelatedAfter = (await query(`SELECT COUNT(*)::int AS n FROM governance_links WHERE NOT (target_type = 'goal' AND target_id = $1)`, [FX.goalId])).rows[0].n;
    assert(unrelatedAfter === unrelatedBefore, 'Unrelated governance links are untouched');
    assert(!(await RoadmapService.getLinkedGoals(holder.id)).some((g) => g.goalId === FX.goalId), 'Holder item no longer reports the deleted goal');
  } catch (err: any) {
    console.error('  ❌ Unexpected error:', err?.message || err);
    failed++;
  } finally {
    await cleanup();
    await closeDatabase();
  }

  console.log('\n========================================');
  console.log(`📊 ROADMAP POSTGRESQL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
