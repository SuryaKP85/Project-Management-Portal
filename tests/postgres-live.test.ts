/**
 * Sprint 24 — live PostgreSQL validation: npm run test:pg
 *
 * Gated: without DATABASE_URL it prints SKIPPED and exits 0, having run nothing.
 *
 * With DATABASE_URL it never touches existing data. It creates its own empty
 * schema (pm_portal_test_<timestamp>), every phase connects with
 * search_path set to that schema only, and the schema is dropped at the end.
 * The PostgreSQL user therefore needs permission to create a schema.
 *
 * Phases run as separate processes, so "restart" is a real process restart:
 *   create   — startup applies the schema to the empty schema, the bootstrap
 *              administrator is created and signs in, then one record of every
 *              covered kind is created and read back;
 *   verify   — after a restart: everything is read back, then representative
 *              records are updated; a sprint completion that fails part-way
 *              rolls back, then completes once (a second completion is 409);
 *   reverify — after another restart: the updates persisted; representative
 *              deletes; deleting a project cascades to its delivery records;
 *              re-applying the schema archives a duplicate velocity row.
 *
 * PM_PORTAL_PG_TEST_DRY_RUN=embedded runs the same phases against a temporary
 * embedded data file instead (no PostgreSQL), so the script itself stays
 * correct where no PostgreSQL is available. That is NOT a PostgreSQL run.
 */
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

type Manifest = Record<string, string>;
const PHASES = ['create', 'verify', 'reverify'] as const;

function withSearchPath(url: string, schema: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
}

function runPhase(phase: string, env: NodeJS.ProcessEnv): { ok: boolean; checks: Array<[string, boolean]>; error?: string } {
  const child = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tests/postgres-live.test.ts'], {
    env: { ...env, PM_PORTAL_PG_TEST_PHASE: phase },
    encoding: 'utf8',
    timeout: 180000,
  });
  const line = String(child.stdout || '').split(/\r?\n/).find((l) => l.startsWith('RESULT '));
  if (!line) return { ok: false, checks: [], error: `phase ${phase} produced no result (exit ${child.status}): ${String(child.stderr || '').slice(-1500)}` };
  return JSON.parse(line.slice(7));
}

async function parent(): Promise<number> {
  const dryRun = process.env.PM_PORTAL_PG_TEST_DRY_RUN === 'embedded';
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!dryRun && !url) {
    console.log('SKIPPED: npm run test:pg needs DATABASE_URL pointing at a PostgreSQL server where a temporary schema may be created. Nothing was run.');
    return 0;
  }

  const stamp = Date.now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-portal-pgtest-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PM_PORTAL_PG_TEST_MANIFEST: path.join(work, 'manifest.json'),
    BOOTSTRAP_ADMIN_EMAIL: `pgtest.admin.${stamp}@example.test`,
    BOOTSTRAP_ADMIN_PASSWORD: 'PgTest#Admin2026x',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  };

  let drop: (() => Promise<void>) | null = null;
  if (dryRun) {
    // A fresh production embedded store: no demo accounts, the bootstrap administrator is created.
    Object.assign(env, { DATABASE_URL: '', PM_PORTAL_DATA_MODE: '', PM_PORTAL_DATA_FILE: path.join(work, 'pm-portal-data.json'), NODE_ENV: 'production' });
  } else {
    const { Client } = await import('pg');
    const schema = `pm_portal_test_${stamp}`;
    const admin = new Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    drop = async () => {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    };
    Object.assign(env, { DATABASE_URL: withSearchPath(url, schema), PM_PORTAL_DATA_MODE: '', NODE_ENV: env.NODE_ENV === 'production' ? 'test' : env.NODE_ENV || 'test' });
    console.log(`test:pg — running in temporary schema ${schema} (dropped afterwards).`);
  }

  let failed = 0;
  try {
    for (const phase of PHASES) {
      const result = runPhase(phase, env);
      for (const [label, ok] of result.checks) {
        console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}: [${phase}] ${label}`);
        if (!ok) failed += 1;
      }
      if (!result.ok) {
        failed += 1;
        console.log(`  ❌ FAIL: [${phase}] ${result.error || 'phase failed'}`);
        break;
      }
    }
  } finally {
    if (drop) await drop();
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`\n📊 test:pg (${dryRun ? 'embedded dry run — not PostgreSQL' : 'PostgreSQL'}): ${failed === 0 ? 'PASSED' : `${failed} FAILED`}`);
  return failed === 0 ? 0 : 1;
}

/** One phase, in its own process: start the store the way server.ts does, then act. */
async function phase(name: string): Promise<{ ok: boolean; checks: Array<[string, boolean]> }> {
  const checks: Array<[string, boolean]> = [];
  const check = (label: string, ok: boolean) => checks.push([label, !!ok]);
  const manifestFile = String(process.env.PM_PORTAL_PG_TEST_MANIFEST);
  const manifest: Manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};

  const { initDatabase, isDbConnected, closeDatabase } = await import('../server/config/database');
  const persistence = await import('../server/config/persistence');
  await initDatabase();
  const { ensureFirstAdmin } = await import('../server/config/bootstrapAdmin');
  const bootstrap = await ensureFirstAdmin(process.env, () => {});
  const usingPg = isDbConnected();

  const { AuthService } = await import('../server/services/authService');
  const login = await AuthService.login(String(process.env.BOOTSTRAP_ADMIN_EMAIL), String(process.env.BOOTSTRAP_ADMIN_PASSWORD));
  const me: any = login.user;
  const actor = { id: me.id, name: 'PG Test Admin' };
  const ftActor: any = { userId: me.id, role: me.role, name: 'PG Test Admin' };
  check('the bootstrap administrator signs in', !!me?.id && me.role === 'admin');

  const repos = {
    project: (await import('../server/repositories/projectRepository')).ProjectRepository,
    product: (await import('../server/repositories/productRepository')).ProductRepository,
    portfolio: (await import('../server/repositories/portfolioRepository')).PortfolioRepository,
    goal: (await import('../server/repositories/goalRepository')).GoalRepository,
    team: (await import('../server/repositories/teamRepository')).TeamRepository,
    requirement: (await import('../server/repositories/requirementRepository')).RequirementRepository,
    epic: (await import('../server/repositories/epicRepository')).EpicRepository,
    feature: (await import('../server/repositories/featureRepository')).FeatureRepository,
    story: (await import('../server/repositories/storyRepository')).StoryRepository,
    task: (await import('../server/repositories/taskRepository')).TaskRepository,
    subtask: (await import('../server/repositories/subtaskRepository')).SubtaskRepository,
    risk: (await import('../server/repositories/riskRepository')).RiskRepository,
    issue: (await import('../server/repositories/issueRepository')).IssueRepository,
    dependency: (await import('../server/repositories/dependencyRepository')).DependencyRepository,
    milestone: (await import('../server/repositories/milestoneRepository')).MilestoneRepository,
    release: (await import('../server/repositories/releaseRepository')).ReleaseRepository,
    sprint: (await import('../server/repositories/sprintRepository')).SprintRepository,
    meeting: (await import('../server/repositories/meetingRepository')).MeetingRepository,
    actionItem: (await import('../server/repositories/actionItemRepository')).ActionItemRepository,
    waitingFor: (await import('../server/repositories/waitingForRepository')).WaitingForRepository,
    followUp: (await import('../server/repositories/followUpRepository')).FollowUpRepository,
  };

  if (name === 'create') {
    check('startup on the empty store created the first administrator', bootstrap === 'created');
    check(`the store is ${process.env.DATABASE_URL ? 'PostgreSQL' : 'the embedded data file'}`, usingPg === !!process.env.DATABASE_URL);
    const { ProjectService } = await import('../server/services/projectService');
    const { ProductService } = await import('../server/services/productService');
    const { PortfolioService } = await import('../server/services/portfolioService');
    const { GoalService } = await import('../server/services/goalService');
    const { TeamService } = await import('../server/services/teamService');
    const { RequirementService } = await import('../server/services/requirementService');
    const { DeliveryService } = await import('../server/services/deliveryService');
    const { RiskService } = await import('../server/services/riskService');
    const { IssueService } = await import('../server/services/issueService');
    const { DependencyService } = await import('../server/services/dependencyService');
    const { MilestoneService } = await import('../server/services/milestoneService');
    const { ReleaseService } = await import('../server/services/releaseService');
    const { MeetingService } = await import('../server/services/meetingService');
    const { ActionItemService } = await import('../server/services/actionItemService');
    const { WaitingForService } = await import('../server/services/waitingForService');
    const { FollowUpService } = await import('../server/services/followUpService');

    const project = await ProjectService.createProject({ name: 'PG test project', client: 'PG test client', budget: 1234.5 } as any, me);
    const cascadeProject = await ProjectService.createProject({ name: 'PG cascade project', client: 'PG test client' } as any, me);
    const product = await ProductService.createProduct({ name: 'PG test product', code: `PGT-PROD-${Date.now()}` } as any, me);
    const portfolio = await PortfolioService.createPortfolio({ name: 'PG test portfolio', code: `PGT-PORT-${Date.now()}` } as any, me);
    const goal = await GoalService.createGoal({ objective: 'PG test goal' } as any, me);
    const team = await TeamService.createTeam({ name: 'PG test team' } as any, me);
    await TeamService.addMember(team.id, { userId: me.id, userName: 'PG Test Admin', roleInTeam: 'Lead', allocatedHrs: 30 }, me);
    const requirement = await RequirementService.create(ftActor, { projectId: project.id, title: 'PG test requirement' });
    const epic = await DeliveryService.createEpic({ name: 'PG test epic', projectId: project.id } as any, me);
    const feature = await DeliveryService.createFeature({ name: 'PG test feature', projectId: project.id, epicId: epic.id } as any, me);
    const story = await DeliveryService.createStory({ title: 'PG test story', projectId: project.id, featureId: feature.id, dueDate: '2026-10-08' } as any, me);
    const task = await DeliveryService.createTask({ title: 'PG test task', projectId: project.id, storyId: story.id } as any, me);
    const subtask = await DeliveryService.createSubtask({ title: 'PG test subtask', taskId: task.id } as any, me);
    const cascadeEpic = await DeliveryService.createEpic({ name: 'PG cascade epic', projectId: cascadeProject.id } as any, me);
    // Critical records without an owner: the owner (and notification recipient) is the caller.
    const risk = await RiskService.createRisk({ projectId: project.id, title: 'PG test risk', probability: 5, impact: 5 } as any, actor);
    const issue = await IssueService.createIssue({ projectId: project.id, title: 'PG test issue', severity: 'Critical', priority: 'High' } as any, actor);
    const dependency = await DependencyService.createDependency({ sourceEntityType: 'epic', sourceEntityId: epic.id, targetEntityType: 'feature', targetEntityId: feature.id, dependencyType: 'Blocks' } as any, actor);
    const milestone = await MilestoneService.createMilestone({ projectId: project.id, name: 'PG test milestone', targetDate: '2026-10-08' } as any, actor);
    const release = await ReleaseService.createRelease({ projectId: project.id, name: 'PG test release', version: '1.0.0', releaseDate: '2026-10-08' } as any, actor);
    const sprint = await repos.sprint.create({ name: 'PG test sprint', projectId: project.id, startDate: '2026-10-08', endDate: '2026-10-21', status: 'planning' } as any);
    const meeting = await MeetingService.create(ftActor, { projectId: project.id, title: 'PG test meeting', scheduledAt: '2026-10-09T10:00:00.000Z' });
    const actionItem = await ActionItemService.create(ftActor, { projectId: project.id, title: 'PG test action', dueDate: '2026-10-08' });
    const waitingFor = await WaitingForService.create(ftActor, { projectId: project.id, title: 'PG test waiting-for', waitingOnName: 'PG vendor', expectedDate: '2026-10-08' });
    const followUp = await FollowUpService.create(ftActor, { projectId: project.id, title: 'PG test follow-up', dueDate: '2026-10-08' });

    // A project deleted before the restart: its id must never be issued again.
    const deletedProject = await ProjectService.createProject({ name: 'PG deleted project', client: 'PG test client' } as any, me);
    await repos.project.delete(deletedProject.id);

    Object.assign(manifest, {
      deletedProject: deletedProject.id,
      project: project.id, cascadeProject: cascadeProject.id, product: product.id, portfolio: portfolio.id, goal: goal.id, team: team.id,
      requirement: requirement.id, epic: epic.id, feature: feature.id, story: story.id, task: task.id, subtask: subtask.id, cascadeEpic: cascadeEpic.id,
      risk: risk.id, riskCode: risk.code, issue: issue.id, dependency: dependency.id, milestone: milestone.id, release: release.id, sprint: sprint.id,
      meeting: meeting.id, actionItem: actionItem.id, waitingFor: waitingFor.id, followUp: followUp.id, admin: me.id,
    });
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    check('generated codes are server-issued (RSK, ISS, MLS, REL, DEP, TSK, SPR)', [risk.code, issue.code, milestone.code, release.code, dependency.code, task.code, sprint.code].every((c, i) => new RegExp(`^${['RSK', 'ISS', 'MLS', 'REL', 'DEP', 'TSK', 'SPR'][i]}-\\d+$`).test(String(c))));
    check('owners default to the caller (no demo user)', [risk.ownerId, issue.ownerId, milestone.ownerId, release.ownerId, dependency.ownerId, goal.ownerId, product.ownerId, portfolio.ownerId, team.leadId].every((o) => o === me.id));
  }

  // Read back: every phase after create runs in a fresh process (a restart).
  const read: Record<string, any> = {};
  for (const [kind, repo] of Object.entries(repos)) {
    const id = manifest[kind];
    if (id) read[kind] = await (repo as any).findById(id);
  }
  if (name !== 'reverify') {
    const missing = Object.entries(repos).filter(([kind]) => manifest[kind] && !read[kind]).map(([kind]) => kind);
    check(`every record reads back${name === 'create' ? '' : ' after a restart'} (${missing.join(', ') || 'all present'})`, missing.length === 0);
    check('DATE values come back unchanged as YYYY-MM-DD (2026-10-08 stays 2026-10-08)', read.milestone?.targetDate === '2026-10-08' && String(read.story?.dueDate).slice(0, 10) === '2026-10-08' && read.actionItem?.dueDate === '2026-10-08');
    check('the issue keeps its reporter (issues.reported_by)', read.issue?.reportedBy === manifest.admin);
    check('team membership is stored and counted', read.team?.memberCount === 1 && read.team?.members?.[0]?.userId === manifest.admin);
    check('the project budget is a number', typeof read.project?.budget === 'number' && read.project.budget === 1234.5);
  }

  if (name === 'verify') {
    const { RiskService } = await import('../server/services/riskService');
    const { TeamService } = await import('../server/services/teamService');
    await RiskService.updateRisk(manifest.risk, { title: 'PG test risk (updated)' } as any, actor);
    await repos.issue.update(manifest.issue, { status: 'Resolved' } as any);
    await TeamService.removeMember(manifest.team, manifest.admin, me);
    const again = await repos.risk.findById(manifest.risk);
    check('an update is read back', again?.title === 'PG test risk (updated)' && again?.code === manifest.riskCode);

    // Sprint completion through the controller: a failure in its last step undoes every step; then it completes once.
    const { ProjectService } = await import('../server/services/projectService');
    const projectNumber = (id: string) => Number(/^PRJ-(\d+)$/.exec(String(id))?.[1]);
    const afterRestart = await ProjectService.createProject({ name: 'PG project after restart', client: 'PG test client' } as any, me);
    check(`after a restart a new project gets a new id, never the deleted one (${manifest.deletedProject} deleted, ${afterRestart.id} issued)`,
      projectNumber(afterRestart.id) > projectNumber(manifest.deletedProject) && afterRestart.id !== manifest.deletedProject && (await repos.project.findById(manifest.deletedProject)) === null);
    await repos.project.delete(afterRestart.id);

    const { SprintController } = await import('../server/controllers/sprintController');
    const { VelocityRepository } = await import('../server/repositories/velocityRepository');
    const req = () => ({ params: { id: manifest.sprint }, body: { carryoverAction: 'backlog' }, query: {}, headers: {}, user: { userId: me.id, role: me.role, firstName: me.firstName, lastName: me.lastName, email: me.email } });
    const res = () => { const r: any = { statusCode: 200, body: null }; r.status = (c: number) => { r.statusCode = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
    await repos.story.update(manifest.story, { sprintId: manifest.sprint } as any);
    const sprintVelocity = async () => (await VelocityRepository.findByProject(manifest.project)).filter((v: any) => v.sprintId === manifest.sprint).length;
    const realSprintUpdate = repos.sprint.update;
    (repos.sprint as any).update = async (...args: any[]) => {
      if (args[1]?.status === 'completed') throw new Error('test:pg injected failure');
      return (realSprintUpdate as any).apply(repos.sprint, args);
    };
    const failed = res();
    try {
      await SprintController.completeSprint(req() as any, failed);
    } finally {
      (repos.sprint as any).update = realSprintUpdate;
    }
    check('a sprint completion that fails part-way changes nothing (velocity, carry-over and status roll back)',
      failed.statusCode >= 400 && (await sprintVelocity()) === 0 && (await repos.story.findById(manifest.story))?.sprintId === manifest.sprint && (await repos.sprint.findById(manifest.sprint))?.status !== 'completed');
    const done = res();
    await SprintController.completeSprint(req() as any, done);
    const twice = res();
    await SprintController.completeSprint(req() as any, twice);
    check('the retried completion succeeds once (one velocity record, story carried over); a second completion is 409',
      done.statusCode === 200 && twice.statusCode === 409 && (await sprintVelocity()) === 1 && !(await repos.story.findById(manifest.story))?.sprintId);
  }

  if (name === 'reverify') {
    check('updates persisted across a restart', read.risk?.title === 'PG test risk (updated)' && read.issue?.status === 'Resolved' && read.team?.memberCount === 0);
    check('a risk delete is reported by the store', (await repos.risk.delete(manifest.risk)) === true && (await repos.risk.findById(manifest.risk)) === null);
    check('a second delete of the same risk reports nothing deleted', (await repos.risk.delete(manifest.risk)) === false);
    check('a story delete removes it', (await repos.story.delete(manifest.story)) === true && (await repos.story.findById(manifest.story)) === null);
    if (usingPg) {
      // The startup migration on an existing database: a duplicate velocity row (left by an old double
      // completion) is archived, not deleted, and the one-record-per-sprint index is created again.
      const { query, applySchema, schemaFilePath } = await import('../server/config/database');
      await query('DROP INDEX uq_velocity_records_sprint');
      await query(
        `INSERT INTO velocity_records (id, sprint_id, sprint_name, project_id, start_date, end_date, committed_points, completed_points, created_at)
         VALUES ('vel_pgtest_duplicate', $1, 'PG test duplicate', $2, '2026-10-08', '2026-10-21', 1, 1, NOW() - INTERVAL '1 day')`,
        [manifest.sprint, manifest.project]
      );
      // A schema application that fails part-way (here: after every real statement, including the
      // velocity archive) applies nothing — PostgreSQL runs the single schema query as one transaction.
      const brokenSchema = path.join(os.tmpdir(), `pm-portal-pgtest-broken-${Date.now()}.sql`);
      fs.writeFileSync(brokenSchema, `${fs.readFileSync(schemaFilePath(), 'utf8')}\nCREATE TABLE pgtest_atomic_marker (id INTEGER);\nSELECT 1 / 0;\n`);
      let brokenFailed = false;
      try {
        await applySchema({ query: (sql: string) => query(sql) }, brokenSchema);
      } catch {
        brokenFailed = true;
      } finally {
        fs.rmSync(brokenSchema, { force: true });
      }
      const stillThere = await query('SELECT id FROM velocity_records WHERE id = $1', ['vel_pgtest_duplicate']);
      const notArchived = await query('SELECT id FROM velocity_records_duplicates WHERE id = $1', ['vel_pgtest_duplicate']);
      const marker = await query(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'pgtest_atomic_marker'`);
      const noIndex = await query(`SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uq_velocity_records_sprint'`);
      check('a schema application that fails part-way changes nothing (velocity rows not archived, no index, no new table)',
        brokenFailed && stillThere.rows.length === 1 && notArchived.rows.length === 0 && marker.rows.length === 0 && noIndex.rows.length === 0);

      await applySchema({ query: (sql: string) => query(sql) });
      const kept = await query('SELECT id FROM velocity_records WHERE sprint_id = $1', [manifest.sprint]);
      const archived = await query('SELECT id, archived_at FROM velocity_records_duplicates WHERE sprint_id = $1', [manifest.sprint]);
      const index = await query(`SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uq_velocity_records_sprint'`);
      check('re-applying the schema to an existing database archives a duplicate velocity row and recreates the index (nothing deleted)',
        kept.rows.length === 1 && kept.rows[0].id !== 'vel_pgtest_duplicate' && archived.rows.length === 1 && archived.rows[0].id === 'vel_pgtest_duplicate' && !!archived.rows[0].archived_at && index.rows.length === 1);
      await repos.project.delete(manifest.cascadeProject);
      check('deleting a project cascades to its delivery records (PostgreSQL)', (await repos.epic.findById(manifest.cascadeEpic)) === null);
    }
  }

  persistence.flushNow();
  await closeDatabase();
  return { ok: checks.every(([, ok]) => ok), checks };
}

if (process.env.PM_PORTAL_PG_TEST_PHASE) {
  phase(process.env.PM_PORTAL_PG_TEST_PHASE)
    .then((result) => {
      console.log(`RESULT ${JSON.stringify(result)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.log(`RESULT ${JSON.stringify({ ok: false, checks: [], error: String(err?.stack || err) })}`);
      process.exit(1);
    });
} else {
  parent().then((code) => process.exit(code));
}
