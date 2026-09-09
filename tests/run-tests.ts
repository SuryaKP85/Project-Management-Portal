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
