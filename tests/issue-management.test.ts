import { IssueService } from '../server/services/issueService';
import { IssueRepository } from '../server/repositories/issueRepository';
import { ActivityRepository } from '../server/repositories/activityRepository';

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

async function expectFailure(operation: Promise<unknown>, name: string) {
  let rejected = false;
  try {
    await operation;
  } catch {
    rejected = true;
  }
  assert(rejected, name);
}

async function main() {
  const actor = { id: 'usr_admin_1', name: 'Surya Prashanth' };

  console.log('\n========================================');
  console.log('🧪 ISSUE MANAGEMENT TEST SUITE');
  console.log('========================================\n');

  const initial = await IssueRepository.findAll();
  assert(initial.length >= 4, `Seeded issues available (${initial.length})`);

  const issue = await IssueService.createIssue({
    title: 'Issue Management Automated Test',
    projectId: 'PRJ-101',
    category: 'Technical',
    severity: 'High',
    priority: 'Urgent',
    status: 'Open',
    rootCauseCategory: 'Technical',
    reportedDate: '2026-09-09',
    targetResolutionDate: '2026-09-20',
  }, actor);

  assert(issue.id.startsWith('iss_'), 'Issue receives generated ID');
  assert(issue.code.startsWith('ISS-'), 'Issue receives enterprise code');
  assert(issue.projectId === 'PRJ-101', 'Issue retains validated project relationship');
  assert(issue.severity === 'High' && issue.priority === 'Urgent', 'Issue severity and priority persist');

  await expectFailure(
    IssueService.createIssue({ title: '', projectId: 'PRJ-101' }, actor),
    'Empty issue title rejected'
  );
  await expectFailure(
    IssueService.createIssue({ title: 'Invalid Project', projectId: 'DOES-NOT-EXIST' }, actor),
    'Unknown project rejected'
  );
  await expectFailure(
    IssueService.createIssue({ title: 'Invalid Status', projectId: 'PRJ-101', status: 'Escalated' as any }, actor),
    'Unsupported issue status rejected'
  );
  await expectFailure(
    IssueService.createIssue({ title: 'Invalid Severity', projectId: 'PRJ-101', severity: 'Severe' as any }, actor),
    'Unsupported issue severity rejected'
  );
  await expectFailure(
    IssueService.createIssue({ title: 'Invalid Date', projectId: 'PRJ-101', reportedDate: 'not-a-date' }, actor),
    'Invalid reported date rejected'
  );
  await expectFailure(
    IssueService.createIssue({ title: 'Invalid Date Order', projectId: 'PRJ-101', reportedDate: '2026-09-20', targetResolutionDate: '2026-09-10' }, actor),
    'Target resolution date before report date rejected'
  );

  const updated = await IssueService.updateIssue(issue.id, {
    status: 'Resolved',
    resolution: 'Automated verification completed',
  }, actor);

  assert(updated?.status === 'Resolved', 'Issue status transitions to Resolved');
  assert(!!updated?.resolvedDate, 'Resolved issue receives resolved timestamp');

  await expectFailure(
    IssueService.updateIssue(issue.id, { status: 'Escalated' as any }, actor),
    'Unsupported status rejected during update'
  );

  const activities = await ActivityRepository.findRecent(50);
  assert(
    activities.some((a) => a.entityId === issue.id && a.action === 'create'),
    'Issue creation recorded in activity log'
  );
  assert(
    activities.some((a) => a.entityId === issue.id && a.action === 'resolve'),
    'Issue resolution recorded in activity log'
  );

  const deleted = await IssueService.deleteIssue(issue.id, actor);
  assert(deleted === true, 'Issue deleted successfully');
  assert(await IssueService.getIssueById(issue.id) === null, 'Deleted issue is no longer retrievable');

  console.log('\n========================================');
  console.log(`📊 ISSUE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Issue test execution failed:', error);
  process.exit(1);
});
