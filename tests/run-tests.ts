/**
 * Automated Verification Test Suite for Surya PM Portal V2.0 Foundation
 */
import { hashPassword, verifyPassword } from '../server/auth/password';
import { generateToken, verifyToken } from '../server/auth/jwt';
import { hasPermission } from '../server/auth/rbac';
import { UserRepository } from '../server/repositories/userRepository';
import { ProjectRepository } from '../server/repositories/projectRepository';
import { ProductRepository } from '../server/repositories/productRepository';
import { TeamRepository } from '../server/repositories/teamRepository';
import { ActivityRepository } from '../server/repositories/activityRepository';
import { NotificationRepository } from '../server/repositories/notificationRepository';
import { AuthService } from '../server/services/authService';
import { AIService } from '../server/services/aiService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 RUNNING V2.0 FOUNDATION TEST SUITE');
  console.log('========================================\n');

  // 1. Password Hashing & Security
  console.log('--- 1. Password Security & Hashing ---');
  const password = 'SuperSecurePassword@2026';
  const hashed = await hashPassword(password);
  assert(hashed.includes(':') && hashed.length > 50, 'Password hashed with secure scrypt salt format');
  
  const isMatch = await verifyPassword(password, hashed);
  assert(isMatch === true, 'Correct password verifies successfully');

  const isWrongMatch = await verifyPassword('WrongPassword123', hashed);
  assert(isWrongMatch === false, 'Incorrect password fails verification');

  // 2. JWT Generation & Verification
  console.log('\n--- 2. JWT Authentication & Sessions ---');
  const testUser = {
    id: 'usr_test_1',
    email: 'tester@enterprise.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'project-manager' as const,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const token = generateToken(testUser);
  assert(typeof token === 'string' && token.split('.').length === 3, 'JWT token correctly generated with 3 parts');

  const verified = verifyToken(token);
  assert(verified !== null && verified.userId === 'usr_test_1' && verified.role === 'project-manager', 'JWT token decoded and verified accurately');

  // 3. RBAC Hierarchy
  console.log('\n--- 3. Role-Based Access Control (RBAC) ---');
  assert(hasPermission('admin', ['project-manager']), 'Admin has permission for PM endpoints');
  assert(hasPermission('admin', ['viewer']), 'Admin has permission for Viewer endpoints');
  assert(hasPermission('project-manager', ['project-manager', 'team-member']), 'PM has permission for PM/Team endpoints');
  assert(!hasPermission('viewer', ['admin']), 'Viewer is denied admin-only endpoints');
  assert(!hasPermission('team-member', ['admin']), 'Team member is denied admin-only endpoints');

  // 4. Repositories (Data Access Layer)
  console.log('\n--- 4. Data Access Layer & Repositories ---');
  const users = await UserRepository.findAll();
  assert(users.length >= 3, `UserRepository returned seeded users (count: ${users.length})`);
  assert(users.every((u: any) => !u.passwordHash), 'UserRepository sanitizes password hashes from list results');

  const projects = await ProjectRepository.findAll();
  assert(projects.length >= 4, `ProjectRepository returned seeded projects (count: ${projects.length})`);

  const products = await ProductRepository.findAll();
  assert(products.length >= 2, `ProductRepository returned seeded products (count: ${products.length})`);

  const teams = await TeamRepository.findAll();
  assert(teams.length >= 3, `TeamRepository returned seeded teams (count: ${teams.length})`);

  // 5. Activity Logging Foundation
  console.log('\n--- 5. Activity Logging Service ---');
  const newActivity = await ActivityRepository.create({
    id: `act_test_${Date.now()}`,
    entityType: 'project',
    entityId: 'PRJ-101',
    action: 'status_change',
    actorId: 'usr_admin_1',
    actorName: 'Surya Prashanth',
    details: { from: 'planning', to: 'in-progress' },
    createdAt: new Date().toISOString(),
  });
  assert(newActivity.id.startsWith('act_test_'), 'Activity log created successfully');

  const recent = await ActivityRepository.findRecent(10);
  assert(recent.some((a) => a.id === newActivity.id), 'Activity log retrieved in recent activity stream');

  // 6. Notifications Foundation
  console.log('\n--- 6. Notifications Service ---');
  const newNotif = await NotificationRepository.create({
    id: `notif_test_${Date.now()}`,
    userId: 'usr_admin_1',
    title: 'Test Notification',
    message: 'Testing notification engine delivery',
    type: 'system',
    isRead: false,
    createdAt: new Date().toISOString(),
  });
  assert(newNotif.id.startsWith('notif_test_'), 'Notification created successfully');

  const userNotifs = await NotificationRepository.findByUserId('usr_admin_1');
  assert(userNotifs.some((n) => n.id === newNotif.id), 'Notification retrieved by user ID');

  // 7. AI Service Abstraction & Fallback
  console.log('\n--- 7. AI Engine Abstraction ---');
  const aiResult = await AIService.query('What is the project risk status?');
  assert(aiResult.text.length > 10, 'AI query processed and returned intelligent response');
  assert(aiResult.provider === 'gemini' || aiResult.provider === 'local-rules', 'AI provider selected correctly');

  // 8. Delivery Management Hierarchy (Sprint 3)
  console.log('\n--- 8. Delivery Management Entities & Repositories ---');
  const { EpicRepository } = await import('../server/repositories/epicRepository');
  const { FeatureRepository } = await import('../server/repositories/featureRepository');
  const { StoryRepository } = await import('../server/repositories/storyRepository');
  const { TaskRepository } = await import('../server/repositories/taskRepository');
  const { SubtaskRepository } = await import('../server/repositories/subtaskRepository');
  const { DeliveryService } = await import('../server/services/deliveryService');
  const { TraceabilityRepository } = await import('../server/repositories/traceabilityRepository');

  const epics = await EpicRepository.findAll();
  assert(epics.length >= 3, `EpicRepository returned seeded epics (count: ${epics.length})`);
  assert(epics.some((e) => e.code === 'EPC-101'), 'Epic EPC-101 correctly loaded');

  const features = await FeatureRepository.findAll();
  assert(features.length >= 3, `FeatureRepository returned seeded features (count: ${features.length})`);
  assert(features.some((f) => f.code === 'FEAT-101' && f.epicId === 'epic_1'), 'Feature FEAT-101 correctly linked to epic_1');

  const stories = await StoryRepository.findAll();
  assert(stories.length >= 3, `StoryRepository returned seeded stories (count: ${stories.length})`);
  assert(stories.some((s) => s.code === 'STR-101' && s.featureId === 'feat_1'), 'Story STR-101 linked to feat_1 with user story details');

  const tasks = await TaskRepository.findAll();
  assert(tasks.length >= 4, `TaskRepository returned seeded tasks (count: ${tasks.length})`);
  assert(tasks.some((t) => t.code === 'TSK-101' && t.storyId === 'story_1'), 'Task TSK-101 linked to story_1');

  const subtasks = await SubtaskRepository.findAll();
  assert(subtasks.length >= 3, `SubtaskRepository returned seeded subtasks (count: ${subtasks.length})`);
  assert(subtasks.some((st) => st.taskId === 'task_1'), 'Subtask correctly linked to task_1');

  // 9. Traceability Chain Navigation
  console.log('\n--- 9. Full Upward & Downward Traceability Chain ---');
  const subtaskTrace = await TraceabilityRepository.getTraceabilityChain('subtask', 'sub_1');
  assert(subtaskTrace !== null, 'Traceability chain found for subtask sub_1');
  if (subtaskTrace) {
    const ancestorTypes = subtaskTrace.ancestors.map((a) => a.type);
    assert(ancestorTypes.includes('task'), 'Subtask ancestor chain contains Task');
    assert(ancestorTypes.includes('story'), 'Subtask ancestor chain contains Story');
    assert(ancestorTypes.includes('feature'), 'Subtask ancestor chain contains Feature');
    assert(ancestorTypes.includes('epic'), 'Subtask ancestor chain contains Epic');
    assert(ancestorTypes.includes('project'), 'Subtask ancestor chain contains Project');
    assert(ancestorTypes.includes('product'), 'Subtask ancestor chain contains Product');
    assert(ancestorTypes.includes('portfolio'), 'Subtask ancestor chain contains Portfolio');
  }

  const epicTrace = await TraceabilityRepository.getTraceabilityChain('epic', 'epic_1');
  assert(epicTrace !== null, 'Traceability chain found for epic epic_1');
  if (epicTrace) {
    assert((epicTrace.children || []).length >= 2, 'Epic child features traversed downward successfully');
  }

  // 10. Automated Progress Rollup
  console.log('\n--- 10. Automated Progress Rollup Calculations ---');
  const actor = {
    id: 'usr_admin_1',
    name: 'Surya Prashanth',
    firstName: 'Surya',
    lastName: 'Prashanth',
    email: 'admin@surya-pms.internal',
    role: 'admin' as const,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };

  const testTask = await DeliveryService.createTask(
    {
      title: 'Automated Rollup Test Task',
      projectId: 'PRJ-101',
      status: 'in-progress',
    },
    actor
  );
  assert(testTask.id.startsWith('task_'), 'Test task created for progress rollup verification');

  const subA = await DeliveryService.createSubtask(
    {
      taskId: testTask.id,
      title: 'Rollup Subtask A',
      status: 'done',
    },
    actor
  );

  const subB = await DeliveryService.createSubtask(
    {
      taskId: testTask.id,
      title: 'Rollup Subtask B',
      status: 'in-progress',
    },
    actor
  );

  // Re-fetch parent task to verify rollup
  const refreshedTask = await TaskRepository.findById(testTask.id);
  assert(refreshedTask?.progress === 50, `Task progress rolled up to 50% based on 1 of 2 done subtasks (actual: ${refreshedTask?.progress}%)`);

  // Complete second subtask and verify 100%
  await DeliveryService.updateSubtask(subB.id, { status: 'done' }, actor);
  const completedTask = await TaskRepository.findById(testTask.id);
  assert(completedTask?.progress === 100, `Task progress rolled up to 100% when all subtasks completed (actual: ${completedTask?.progress}%)`);

  // Clean up test items
  await DeliveryService.deleteTask(testTask.id, actor);

  // 11. Delivery Summary Metrics
  console.log('\n--- 11. Delivery Summary Metrics ---');
  const summary = await DeliveryService.getDeliverySummary();
  assert(summary.totals.epics >= 3, `Delivery summary aggregates epics correctly (${summary.totals.epics})`);
  assert(summary.totals.allItems >= 15, `Delivery summary aggregates all work items (${summary.totals.allItems})`);
  assert(summary.statusDistribution.inProgress >= 1, 'Status distribution accurately classifies in-progress work');

  // 12. Sprints & Sprint Lifecycle (Sprint 4)
  console.log('\n--- 12. Sprints & Sprint Lifecycle ---');
  const { SprintRepository } = await import('../server/repositories/sprintRepository');
  const { SprintService } = await import('../server/services/sprintService');
  const { VelocityRepository } = await import('../server/repositories/velocityRepository');
  const { VelocityService } = await import('../server/services/velocityService');

  const initialSprints = await SprintRepository.findAll();
  assert(initialSprints.length >= 1, `SprintRepository loaded seeded sprints (count: ${initialSprints.length})`);

  // Create new sprint
  const newSprint = await SprintService.createSprint(
    {
      name: 'Sprint 99 — Test Automation',
      projectId: 'proj_1',
      goal: 'Automated verification test sprint',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      capacityPoints: 35,
      capacityHours: 140,
    },
    actor
  );
  assert(newSprint.id.startsWith('spr_'), `Sprint created with generated ID: ${newSprint.id}`);
  assert(newSprint.status === 'planning', `New sprint initialized in planning status (status: ${newSprint.status})`);

  // Start sprint
  const startedSprint = await SprintService.startSprint(newSprint.id, actor);
  assert(startedSprint.status === 'active', 'Sprint successfully transitioned to active');

  // 13. Backlog Management (Sprint 4)
  console.log('\n--- 13. Backlog Management ---');
  const { BacklogService } = await import('../server/services/backlogService');

  const backlogItems = await BacklogService.getBacklog({ projectId: 'proj_1' });
  assert(Array.isArray(backlogItems), 'BacklogService returned list of unassigned backlog items');

  // Create backlog item
  const backlogStory = await BacklogService.createBacklogItem(
    {
      type: 'story',
      title: 'Backlog Story for Sprint Move',
      projectId: 'proj_1',
      storyPoints: 5,
      priority: 'high',
    },
    actor
  );
  assert(backlogStory.id !== undefined, 'Backlog item created successfully');

  // Move item to sprint
  await BacklogService.moveToSprint(backlogStory.id, 'story', newSprint.id, actor);
  const updatedStory = await StoryRepository.findById(backlogStory.id);
  assert(updatedStory?.sprintId === newSprint.id, 'Backlog item successfully moved to sprint scope');

  // 14. Agile Capacity & Burndown Calculations (Sprint 4)
  console.log('\n--- 14. Agile Capacity & Burndown Calculations ---');
  const { CapacityService } = await import('../server/services/capacityService');
  const { BurndownService } = await import('../server/services/burndownService');

  const capacity = await CapacityService.calculateSprintCapacity(newSprint.id);
  assert(capacity.availableHours > 0, `Sprint capacity calculated available team hours: ${capacity.availableHours}h`);
  assert(capacity.committedPoints >= 5, `Sprint capacity detected committed points: ${capacity.committedPoints} pts`);
  assert(Array.isArray(capacity.memberBreakdown), 'Member breakdown calculated with individual allocations');

  const burndown = await BurndownService.calculateBurndown(newSprint.id);
  assert(burndown.days.length > 0, `Burndown timeline generated with ${burndown.days.length} daily data points`);
  assert(burndown.totalPoints >= 5, `Burndown reflects committed points: ${burndown.totalPoints} pts`);

  // 15. Sprint Completion & Velocity Tracking (Sprint 4)
  console.log('\n--- 15. Sprint Completion & Velocity Tracking ---');
  const completeResult = await SprintService.completeSprint(
    newSprint.id,
    { carryoverAction: 'backlog' },
    actor
  );
  assert(completeResult.sprint.status === 'completed', 'Sprint marked completed');
  assert(completeResult.velocity !== undefined, 'Velocity record generated upon sprint completion');

  const velocityRecords = await VelocityService.getVelocityRecords('proj_1');
  assert(velocityRecords.length >= 1, `Velocity records retrieved for project (count: ${velocityRecords.length})`);

  // 16. My Work Aggregation (Sprint 4)
  console.log('\n--- 16. My Work Personal Queue ---');
  const { MyWorkService } = await import('../server/services/myWorkService');

  const myWork = await MyWorkService.getMyWork(actor.id);
  assert(myWork.summary !== undefined, 'MyWork summarized personal deliverables');
  assert(Array.isArray(myWork.stories) && Array.isArray(myWork.tasks), 'MyWork returned stories and tasks for user');

  // 17. V2 Risk Management Foundation (Sprint 5A)
  console.log('\n--- 17. V2 Risk Management Foundation ---');
  const { RiskService, calculateRiskScoreAndSeverity } = await import('../server/services/riskService');
  const { RiskRepository } = await import('../server/repositories/riskRepository');

  // Formula & Severity Band Unit Checks
  const scoreLow = calculateRiskScoreAndSeverity(2, 2);
  assert(scoreLow.riskScore === 4 && scoreLow.severity === 'Low', 'Risk Score 4 correctly categorised as Low (1–4)');

  const scoreMed = calculateRiskScoreAndSeverity(3, 3);
  assert(scoreMed.riskScore === 9 && scoreMed.severity === 'Medium', 'Risk Score 9 correctly categorised as Medium (5–9)');

  const scoreHigh = calculateRiskScoreAndSeverity(4, 4);
  assert(scoreHigh.riskScore === 16 && scoreHigh.severity === 'High', 'Risk Score 16 correctly categorised as High (10–16)');

  const scoreCrit = calculateRiskScoreAndSeverity(5, 5);
  assert(scoreCrit.riskScore === 25 && scoreCrit.severity === 'Critical', 'Risk Score 25 correctly categorised as Critical (17–25)');

  // Seeded Risks in DB
  const seededRisks = await RiskRepository.findAll();
  assert(seededRisks.length >= 3, `RiskRepository loaded seeded enterprise risks (count: ${seededRisks.length})`);
  assert(seededRisks.every(r => r.riskScore === r.probability * r.impact), 'All loaded risks have riskScore = probability × impact');

  // Create Risk with Server-Side Enforcement (ignores client-provided riskScore: 999)
  const createdRisk = await RiskService.createRisk(
    {
      title: 'Automated CI/CD Pipeline Flakiness Risk',
      projectId: 'PRJ-101',
      category: 'Technical',
      probability: 4,
      impact: 5,
      // @ts-ignore - simulate client attempting to pass spoofed score
      riskScore: 999,
      // @ts-ignore - simulate client attempting to pass spoofed severity
      severity: 'Low',
      mitigationPlan: 'Implement parallel runner isolates and test retries',
      contingencyPlan: 'Revert to staging build runner pool',
      triggerCondition: 'Failure rate exceeds 10% on main branch',
    },
    { id: actor.id, name: actor.name }
  );

  assert(createdRisk.id.startsWith('rsk_'), `Risk created with generated ID: ${createdRisk.id}`);
  assert(createdRisk.code.startsWith('RSK-'), `Risk assigned formatted enterprise code: ${createdRisk.code}`);
  assert(createdRisk.riskScore === 20, `Server correctly calculated riskScore = 4 × 5 = 20 (spoofed 999 ignored)`);
  assert(createdRisk.severity === 'Critical', `Server assigned Critical severity for score 20 (spoofed Low ignored)`);

  // Validation enforcement
  let validationCaught = false;
  try {
    await RiskService.createRisk({ title: '', projectId: 'PRJ-101', probability: 3, impact: 3 });
  } catch {
    validationCaught = true;
  }
  assert(validationCaught, 'Empty title rejected by server validation');

  let invalidScaleCaught = false;
  try {
    await RiskService.createRisk({ title: 'Invalid Scale Test', projectId: 'PRJ-101', probability: 6, impact: 3 });
  } catch {
    invalidScaleCaught = true;
  }
  assert(invalidScaleCaught, 'Probability out of range (6) rejected by server validation');

  // Update Risk & Recalculate Score
  const updatedRisk = await RiskService.updateRisk(
    createdRisk.id,
    {
      probability: 2,
      impact: 3,
      status: 'Mitigating',
    },
    { id: actor.id, name: actor.name }
  );
  assert(updatedRisk.riskScore === 6, `Updated risk recalculated score to 2 × 3 = 6 (actual: ${updatedRisk.riskScore})`);
  assert(updatedRisk.severity === 'Medium', `Updated risk severity band changed to Medium (actual: ${updatedRisk.severity})`);
  assert(updatedRisk.status === 'Mitigating', 'Risk status successfully updated to Mitigating');

  // Pagination & Filtering
  const paginated = await RiskService.getPaginatedRisks({ page: 1, limit: 2, projectId: 'PRJ-101' });
  assert(paginated.risks.length <= 2, `Paginated risks obeyed limit=2 (actual: ${paginated.risks.length})`);
  assert(paginated.total >= 1, `Paginated total count returned (${paginated.total})`);
  assert(paginated.risks.every(r => r.projectId === 'PRJ-101'), 'Project filter correctly filtered returned risks');

  // Heatmap calculation
  const heatmap = await RiskService.getHeatmap();
  assert(heatmap.matrix.length === 5 && heatmap.matrix[0].length === 5, 'Heatmap generates 5x5 matrix');
  assert(heatmap.summary.totalRisks >= 4, `Heatmap summary aggregates total enterprise risks (${heatmap.summary.totalRisks})`);
  assert(heatmap.summary.averageRiskScore > 0, `Heatmap summary calculates average risk score (${heatmap.summary.averageRiskScore})`);

  // Activity Log verification
  const recentActivities = await ActivityRepository.findRecent(15);
  const riskCreatedLog = recentActivities.find(a => a.entityId === createdRisk.id && a.action === 'create');
  assert(riskCreatedLog !== undefined, 'Risk creation recorded in enterprise activity log');

  // Deletion
  await RiskService.deleteRisk(createdRisk.id, { id: actor.id, name: actor.name });
  const deletedCheck = await RiskService.getRiskById(createdRisk.id);
  assert(deletedCheck === null, 'Risk successfully deleted from repository');

  // 18. V2 Issue Management Foundation (Sprint 5B)
  console.log('\n--- 18. V2 Issue Management Foundation ---');
  const { IssueService } = await import('../server/services/issueService');
  const { IssueRepository } = await import('../server/repositories/issueRepository');

  // Seeded Issues in DB
  const seededIssues = await IssueRepository.findAll();
  assert(seededIssues.length >= 3, `IssueRepository loaded seeded enterprise issues (count: ${seededIssues.length})`);
  assert(seededIssues.some(i => i.code === 'ISS-101' || i.code?.startsWith('ISS-')), 'Issues assigned formatted enterprise code (e.g. ISS-101)');

  // Field mapping checks on seeded issues
  const sampleIssue = seededIssues[0];
  assert(sampleIssue.rootCauseCategory !== undefined, 'Issue schema contains canonical rootCauseCategory field');
  assert(sampleIssue.reportedBy !== undefined, 'Issue schema contains canonical reportedBy field');

  // Create Issue with Server-Side Validation & Enrichment
  const createdIssue = await IssueService.createIssue(
    {
      title: 'Database connection pool exhaustion under stress',
      description: 'Connection pool runs dry during concurrent sprint simulations',
      projectId: 'PRJ-101',
      severity: 'Critical',
      priority: 'High',
      category: 'Technical',
      rootCauseCategory: 'Technical',
      rootCauseNotes: 'Connection leaks in batch processing workers',
      targetResolutionDate: '2026-10-15T00:00:00.000Z',
      reportedBy: 'usr_pm_2',
      assigneeId: 'usr_dev_3',
    },
    { id: actor.id, name: actor.name }
  );

  assert(createdIssue.id.startsWith('iss_'), `Issue created with generated ID: ${createdIssue.id}`);
  assert(createdIssue.code.startsWith('ISS-'), `Issue assigned formatted code: ${createdIssue.code}`);
  assert(createdIssue.status === 'Open', 'New issue correctly defaulted to Open status');
  assert(createdIssue.rootCauseCategory === 'Technical', 'Root cause category preserved accurately');
  assert(createdIssue.reportedBy === 'usr_pm_2', 'Reporter ID correctly stored in reportedBy');
  assert(createdIssue.targetResolutionDate?.includes('2026-10-15'), 'Target resolution date correctly stored');

  // Validation enforcement
  let issueValidationCaught = false;
  try {
    await IssueService.createIssue({ title: '', projectId: 'PRJ-101' }, { id: actor.id, name: actor.name });
  } catch {
    issueValidationCaught = true;
  }
  assert(issueValidationCaught, 'Empty issue title rejected by server validation');

  let invalidStatusCaught = false;
  try {
    // @ts-ignore
    await IssueService.createIssue({ title: 'Invalid Status', projectId: 'PRJ-101', status: 'NonExistent' });
  } catch {
    invalidStatusCaught = true;
  }
  assert(invalidStatusCaught, 'Invalid status rejected by server validation');

  let invalidSeverityCaught = false;
  try {
    // @ts-ignore
    await IssueService.createIssue({ title: 'Invalid Severity', projectId: 'PRJ-101', severity: 'Catastrophic' });
  } catch {
    invalidSeverityCaught = true;
  }
  assert(invalidSeverityCaught, 'Invalid severity rejected by server validation');

  // Pagination & Filtering
  const paginatedIssues = await IssueService.getPaginatedIssues({ page: 1, limit: 2, projectId: 'PRJ-101' });
  assert(paginatedIssues.issues.length <= 2, `Paginated issues obeyed limit=2 (actual: ${paginatedIssues.issues.length})`);
  assert(paginatedIssues.total >= 1, `Paginated issues total count returned (${paginatedIssues.total})`);
  assert(paginatedIssues.issues.every(i => i.projectId === 'PRJ-101'), 'Project filter correctly filtered returned issues');

  // Lifecycle transitions: Resolve issue
  const resolvedIssue = await IssueService.updateIssue(
    createdIssue.id,
    {
      status: 'Resolved',
      resolution: 'Increased pg pool max clients and added connection timeout handling',
    },
    { id: actor.id, name: actor.name }
  );
  assert(resolvedIssue !== null && resolvedIssue.status === 'Resolved', 'Issue successfully updated to Resolved status');
  assert(resolvedIssue?.resolvedAt !== undefined && resolvedIssue.resolvedAt !== null, 'resolvedAt automatically populated on resolution');
  assert(resolvedIssue?.resolvedDate === resolvedIssue?.resolvedAt, 'resolvedDate synchronized with resolvedAt');
  assert(resolvedIssue?.resolution?.includes('pg pool'), 'Resolution notes persisted');

  // Lifecycle transitions: Re-open issue (clears resolvedAt)
  const reopenedIssue = await IssueService.updateIssue(
    createdIssue.id,
    {
      status: 'In Progress',
    },
    { id: actor.id, name: actor.name }
  );
  assert(reopenedIssue !== null && reopenedIssue.status === 'In Progress', 'Issue re-opened to In Progress');
  assert(reopenedIssue?.resolvedAt === undefined || reopenedIssue.resolvedAt === null, 'resolvedAt cleared when re-opening issue');

  // Activity Log verification
  const recentActivitiesIssues = await ActivityRepository.findRecent(20);
  const issueCreatedLog = recentActivitiesIssues.find(a => a.entityId === createdIssue.id && a.action === 'create');
  assert(issueCreatedLog !== undefined, 'Issue creation recorded in enterprise activity log');

  const issueResolvedLog = recentActivitiesIssues.find(a => a.entityId === createdIssue.id && a.action === 'resolve');
  assert(issueResolvedLog !== undefined, 'Issue resolution recorded in enterprise activity log');

  // Notifications verification
  const devNotifs = await NotificationRepository.findByUserId('usr_dev_3');
  const issueAssignedNotif = devNotifs.find(n => n.type === 'issue_assigned' && n.title.includes(createdIssue.code));
  assert(issueAssignedNotif !== undefined, 'Notification generated and delivered for issue assignee');

  // RBAC permissions check
  assert(hasPermission('admin', ['project-manager']), 'Admin has permission for Issue management');
  assert(hasPermission('project-manager', ['project-manager', 'team-member']), 'PM has permission for Issue management');
  assert(!hasPermission('viewer', ['project-manager']), 'Viewer role is denied write permissions for Issue management');

  // Deletion
  await IssueService.deleteIssue(createdIssue.id, { id: actor.id, name: actor.name });
  const deletedIssueCheck = await IssueService.getIssueById(createdIssue.id);
  assert(deletedIssueCheck === null, 'Issue successfully deleted from repository');

  // 19. V2 Dependency Management Foundation (Sprint 5C)
  console.log('\n--- 19. V2 Dependency Management Foundation ---');
  const { DependencyService } = await import('../server/services/dependencyService');
  const { DependencyRepository } = await import('../server/repositories/dependencyRepository');

  // Seeded Dependencies in DB
  const seededDeps = await DependencyRepository.findAll();
  assert(seededDeps.length >= 2, `DependencyRepository loaded seeded enterprise dependencies (count: ${seededDeps.length})`);
  assert(seededDeps.some(d => d.code === 'DEP-101' || d.code?.startsWith('DEP-')), 'Dependencies assigned formatted enterprise code (e.g. DEP-101)');

  // Schema & Field verification
  const sampleDep = seededDeps[0];
  assert(sampleDep.criticality !== undefined, 'Dependency schema contains canonical criticality field');
  assert(sampleDep.dependencyType !== undefined, 'Dependency schema contains canonical dependencyType field');
  assert(sampleDep.sourceEntityType !== undefined && sampleDep.targetEntityType !== undefined, 'Dependency schema tracks source and target entity types');

  // 1. Self-Dependency Rejection
  let selfDepFailed = false;
  try {
    await DependencyService.createDependency({
      sourceEntityType: 'project',
      sourceEntityId: 'PRJ-101',
      targetEntityType: 'project',
      targetEntityId: 'PRJ-101',
      dependencyType: 'Blocks',
    }, { id: actor.id, name: actor.name });
  } catch (err: any) {
    selfDepFailed = true;
    assert(err.message.includes('itself'), 'Self-dependency correctly rejected with descriptive error');
  }
  assert(selfDepFailed, 'Attempt to create self-dependency was blocked');

  // 2. Direct 2-hop Cycle Detection (A -> B, then trying B -> A)
  // Let's create node A -> node B
  const depAtoB = await DependencyService.createDependency({
    sourceEntityType: 'story',
    sourceEntityId: 'STR-TEST-A',
    sourceEntityName: 'Test Story A',
    targetEntityType: 'story',
    targetEntityId: 'STR-TEST-B',
    targetEntityName: 'Test Story B',
    dependencyType: 'Blocks',
    criticality: 'High',
    status: 'Open',
    projectId: 'PRJ-101',
  }, { id: actor.id, name: actor.name });
  assert(depAtoB !== null && depAtoB.id !== undefined, 'Created initial dependency A -> B');

  let directCycleFailed = false;
  try {
    // Attempt B -> A (blocks)
    await DependencyService.createDependency({
      sourceEntityType: 'story',
      sourceEntityId: 'STR-TEST-B',
      sourceEntityName: 'Test Story B',
      targetEntityType: 'story',
      targetEntityId: 'STR-TEST-A',
      targetEntityName: 'Test Story A',
      dependencyType: 'Blocks',
    }, { id: actor.id, name: actor.name });
  } catch (err: any) {
    directCycleFailed = true;
    assert(err.message.includes('Circular') || err.message.includes('cycle'), 'Direct 2-hop cycle correctly rejected by cycle detector');
  }
  assert(directCycleFailed, 'Direct circular dependency was blocked');

  // 3. Indirect 3-hop Cycle Detection (A -> B -> C, then trying C -> A)
  const depBtoC = await DependencyService.createDependency({
    sourceEntityType: 'story',
    sourceEntityId: 'STR-TEST-B',
    sourceEntityName: 'Test Story B',
    targetEntityType: 'story',
    targetEntityId: 'STR-TEST-C',
    targetEntityName: 'Test Story C',
    dependencyType: 'Blocks',
    criticality: 'Medium',
    status: 'Open',
    projectId: 'PRJ-101',
  }, { id: actor.id, name: actor.name });
  assert(depBtoC !== null, 'Created intermediate dependency B -> C');

  let indirectCycleFailed = false;
  try {
    // Attempt C -> A (blocks)
    await DependencyService.createDependency({
      sourceEntityType: 'story',
      sourceEntityId: 'STR-TEST-C',
      sourceEntityName: 'Test Story C',
      targetEntityType: 'story',
      targetEntityId: 'STR-TEST-A',
      targetEntityName: 'Test Story A',
      dependencyType: 'Blocks',
    }, { id: actor.id, name: actor.name });
  } catch (err: any) {
    indirectCycleFailed = true;
    assert(err.message.includes('Circular') || err.message.includes('cycle'), 'Indirect 3-hop cycle (A->B->C->A) correctly rejected');
  }
  assert(indirectCycleFailed, 'Indirect multi-hop circular dependency was blocked');

  // 4. Duplicate Relationship Rejection
  let duplicateFailed = false;
  try {
    await DependencyService.createDependency({
      sourceEntityType: 'story',
      sourceEntityId: 'STR-TEST-A',
      targetEntityType: 'story',
      targetEntityId: 'STR-TEST-B',
      dependencyType: 'Blocks',
    }, { id: actor.id, name: actor.name });
  } catch (err: any) {
    duplicateFailed = true;
    assert(err.message.includes('already exists') || err.message.includes('Duplicate'), 'Duplicate relationship correctly prevented');
  }
  assert(duplicateFailed, 'Duplicate dependency was blocked');

  // 5. Creation with full validation & critical path
  const createdDep = await DependencyService.createDependency({
    sourceEntityType: 'feature',
    sourceEntityId: 'FEAT-101',
    sourceEntityName: 'Authentication Architecture',
    targetEntityType: 'feature',
    targetEntityId: 'FEAT-102',
    targetEntityName: 'User Profile Settings',
    dependencyType: 'Requires',
    criticality: 'Critical',
    status: 'Open',
    isCriticalPath: true,
    lagDays: 3,
    targetDate: '2026-08-30',
    description: 'Profile settings requires authentication tokens from Auth module',
    projectId: 'PRJ-101',
  }, { id: actor.id, name: actor.name });

  assert(createdDep.code.startsWith('DEP-'), 'Created dependency assigned canonical DEP- code format');
  assert(createdDep.criticality === 'Critical', 'Criticality persisted as Critical');
  assert(createdDep.isCritical === true || createdDep.isCriticalPath === true, 'Critical path flag active');
  assert(createdDep.lagDays === 3, 'Lag days persisted correctly (3 days)');
  assert(createdDep.targetDate === '2026-08-30', 'Target date persisted');
  assert(createdDep.dueDate === createdDep.targetDate, 'dueDate synchronized with targetDate');

  // 6. Querying & Filtering
  const projDeps = await DependencyService.getDependencies({ projectId: 'PRJ-101' });
  assert(projDeps.length >= 1, `Dependencies queried by projectId (count: ${projDeps.length})`);

  const criticalDeps = await DependencyService.getDependencies({ criticality: 'Critical' });
  assert(criticalDeps.some(d => d.id === createdDep.id), 'Dependencies queried by criticality filter');

  const paginatedDeps = await DependencyService.getPaginatedDependencies({ page: 1, limit: 5 });
  assert(paginatedDeps.dependencies.length <= 5, 'Paginated dependencies obeyed limit');
  assert(paginatedDeps.total >= 3, `Paginated total count accurate (${paginatedDeps.total})`);

  // 7. Chain, Graph & KPIs
  const chain = await DependencyService.getChain('STR-TEST-B');
  assert(chain.entityId === 'STR-TEST-B', 'getChain returned correct target entity');
  assert(chain.upstream.some(u => u.entityId === 'STR-TEST-A'), 'Chain upstream correctly identified STR-TEST-A as blocker');
  assert(chain.downstream.some(d => d.entityId === 'STR-TEST-C'), 'Chain downstream correctly identified STR-TEST-C as blocked');

  const graph = await DependencyService.getGraph({ projectId: 'PRJ-101' });
  assert(graph.nodes.length > 0, `Dependency graph returned nodes (${graph.nodes.length})`);
  assert(graph.edges.length > 0, `Dependency graph returned edges (${graph.edges.length})`);
  assert(graph.summary !== undefined, 'Dependency graph returned summary metrics');

  const kpis = await DependencyService.getKPIs('PRJ-101');
  assert(kpis.total > 0, `KPIs returned total dependencies (${kpis.total})`);
  assert(kpis.criticalCount >= 1, `KPIs returned critical count (${kpis.criticalCount})`);
  assert(kpis.byStatus !== undefined && kpis.byCriticality !== undefined, 'KPIs grouped by status and criticality');

  // 8. Lifecycle Transitions: Resolve Dependency
  const resolvedDep = await DependencyService.updateDependency(
    createdDep.id,
    {
      status: 'Resolved',
      resolutionNotes: 'Auth module deployed and tested successfully',
    },
    { id: actor.id, name: actor.name }
  );
  assert(resolvedDep !== null && resolvedDep.status === 'Resolved', 'Dependency status transitioned to Resolved');
  assert(resolvedDep?.resolvedAt !== undefined && resolvedDep.resolvedAt !== null, 'resolvedAt automatically populated');
  assert(resolvedDep?.resolutionDate === resolvedDep?.resolvedAt, 'resolutionDate synchronized with resolvedAt');
  assert(resolvedDep?.resolutionNotes?.includes('Auth module'), 'Resolution notes persisted');

  // Lifecycle Transitions: Re-open Dependency (clears resolvedAt)
  const reopenedDep = await DependencyService.updateDependency(
    createdDep.id,
    {
      status: 'In Progress',
    },
    { id: actor.id, name: actor.name }
  );
  assert(reopenedDep !== null && reopenedDep.status === 'In Progress', 'Dependency re-opened to In Progress');
  assert(reopenedDep?.resolvedAt === undefined || reopenedDep.resolvedAt === null, 'resolvedAt cleared when re-opening dependency');

  // 9. Activity Log & Notifications verification
  const recentActivitiesDeps = await ActivityRepository.findRecent(25);
  const depCreatedLog = recentActivitiesDeps.find(a => a.entityId === createdDep.id && a.action === 'create');
  assert(depCreatedLog !== undefined, 'Dependency creation recorded in enterprise activity log');

  const depResolvedLog = recentActivitiesDeps.find(a => a.entityId === createdDep.id && a.action === 'resolve');
  assert(depResolvedLog !== undefined, 'Dependency resolution recorded in enterprise activity log');

  const adminNotifs = await NotificationRepository.findByUserId('usr_admin_1');
  const depNotif = adminNotifs.find(n => n.type === 'dependency_blocked' || n.type === 'dependency_critical');
  assert(depNotif !== undefined, 'Notification generated for critical/blocked dependency');

  // 10. RBAC permissions check
  assert(hasPermission('admin', ['project-manager']), 'Admin has permission for Dependency management');
  assert(hasPermission('project-manager', ['project-manager', 'team-member']), 'PM has permission for Dependency management');
  assert(hasPermission('product-manager', ['product-manager']), 'Product Manager has permission for Dependency management');
  assert(!hasPermission('viewer', ['project-manager']), 'Viewer role is denied write permissions for Dependency management');

  // 11. Cleanup test dependencies
  await DependencyService.deleteDependency(depAtoB.id, { id: actor.id, name: actor.name });
  await DependencyService.deleteDependency(depBtoC.id, { id: actor.id, name: actor.name });
  await DependencyService.deleteDependency(createdDep.id, { id: actor.id, name: actor.name });

  const deletedDepCheck = await DependencyService.getDependencyById(createdDep.id);
  assert(deletedDepCheck === null, 'Dependency successfully deleted from repository');

  // Summary
  console.log('\n========================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
