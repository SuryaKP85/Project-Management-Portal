import { UserStory } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { TaskRepository } from './taskRepository';
import { calculateStoryProgress } from '../services/progressCalculator';

const memoryStories: Map<string, UserStory> = new Map();

function seedDefaultStories() {
  if (memoryStories.size > 0) return;
  const defaults: UserStory[] = [
    {
      id: 'story_1',
      code: 'STR-101',
      title: 'Automated Trajectory Drift Correction on Orbital Insertion',
      description: 'System must continuously read inertial reference frame sensors and automatically actuate cold gas thruster bursts when position delta exceeds 0.05m.',
      userStory: {
        asA: 'Guidance & Navigation Engineer',
        iWant: 'the autonomous guidance system to fire micro-burst thruster pulses when orbital injection drift exceeds 0.05 meters',
        soThat: 'the upper stage can reach nominal orbit without manual mission-control telecommand delays',
      },
      acceptanceCriteria: [
        { id: 'crit_1', text: 'Sensor polling rate maintained at ≥ 200 Hz', completed: true },
        { id: 'crit_2', text: 'Thruster pulse timing calibrated within ±2 microseconds', completed: false },
        { id: 'crit_3', text: 'Telemetry packet broadcast on each course correction firing', completed: false },
      ],
      featureId: 'feat_1',
      featureName: 'Autonomous Real-time Trajectory Engine',
      epicId: 'epic_1',
      epicName: 'Ares Flight Guidance & Attitude Determination Core',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      storyPoints: 8,
      priority: 'high',
      status: 'in-progress',
      assigneeId: 'usr_dev_3',
      assigneeName: 'Bob Johnson',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      reporterId: 'usr_admin_1',
      reporterName: 'Surya Prashanth',
      sprint: 'Sprint 24',
      targetRelease: '2026-Q4',
      dueDate: '2026-09-25',
      progress: 30,
      taskCount: 2,
      createdAt: '2026-08-25T08:00:00Z',
      updatedAt: '2026-09-06T14:00:00Z',
    },
    {
      id: 'story_2',
      code: 'STR-102',
      title: 'Real-time Telemetry Health State Packet Broadcasting',
      description: 'Broadcast flight avionics health state telemetry packets over SpaceWire bus to redundant secondary computer.',
      userStory: {
        asA: 'Flight Operations Controller',
        iWant: 'heartbeat and IMU sensor health telemetry streamed over SpaceWire at 50ms intervals',
        soThat: 'avionics anomalies trigger immediate switchover to the secondary hot-standby computer',
      },
      acceptanceCriteria: [
        { id: 'crit_4', text: 'SpaceWire packet serialization latency under 5ms', completed: true },
        { id: 'crit_5', text: 'Secondary computer acknowledgement within 10ms', completed: true },
        { id: 'crit_6', text: 'Zero packet loss under simulated bus noise conditions', completed: false },
      ],
      featureId: 'feat_2',
      featureName: 'Redundant Sensor Bus Multiplexer',
      epicId: 'epic_1',
      epicName: 'Ares Flight Guidance & Attitude Determination Core',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      storyPoints: 5,
      priority: 'critical',
      status: 'testing',
      assigneeId: 'usr_qa_4',
      assigneeName: 'David Miller',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      reporterId: 'usr_pm_2',
      reporterName: 'Alex Morgan',
      sprint: 'Sprint 24',
      targetRelease: '2026-Q4',
      dueDate: '2026-09-22',
      progress: 80,
      taskCount: 1,
      createdAt: '2026-08-26T09:00:00Z',
      updatedAt: '2026-09-05T16:00:00Z',
    },
    {
      id: 'story_3',
      code: 'STR-103',
      title: 'Cryogenic Tank Pressure Safety Relief Valve Actuation',
      description: 'Automated pressure threshold monitoring and pneumatic venting valve control.',
      userStory: {
        asA: 'Propulsion Specialist',
        iWant: 'automatic relief valve actuation when cryo-tank pressure exceeds 320 bar',
        soThat: 'overpressure catastrophic failure is prevented during staging burns',
      },
      acceptanceCriteria: [
        { id: 'crit_7', text: 'Sensor redundancy quorum of 2 out of 3 pressure transducers', completed: true },
        { id: 'crit_8', text: 'Relief valve full open state verified in under 120ms', completed: false },
      ],
      featureId: 'feat_3',
      featureName: 'Cryogenic Fluid Pressure Regulation Pipeline',
      epicId: 'epic_2',
      epicName: 'Propulsion Cryogenic Manifold Management',
      projectId: 'PRJ-102',
      projectName: 'Titan Cryogenic Propulsion Telemetry',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      storyPoints: 13,
      priority: 'high',
      status: 'in-progress',
      assigneeId: 'usr_pm_2',
      assigneeName: 'Alex Morgan',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      reporterId: 'usr_admin_1',
      reporterName: 'Surya Prashanth',
      sprint: 'Sprint 18',
      targetRelease: '2026-Q3',
      dueDate: '2026-10-05',
      progress: 50,
      taskCount: 1,
      createdAt: '2026-08-28T10:00:00Z',
      updatedAt: '2026-09-06T11:00:00Z',
    },
  ];
  defaults.forEach((s) => memoryStories.set(s.id, s));
}

seedDefaultStories();

export const StoryRepository = {
  async findAll(filter?: {
    featureId?: string;
    epicId?: string;
    projectId?: string;
    productId?: string;
    assigneeId?: string;
    teamId?: string;
    status?: string;
    priority?: string;
    sprint?: string;
    sprintId?: string;
    search?: string;
  }): Promise<UserStory[]> {
    if (isDbConnected()) {
      let q = `
        SELECT s.*,
               p.name as project_name,
               pr.name as product_name,
               e.name as epic_name,
               f.name as feature_name,
               u.first_name || ' ' || u.last_name as assignee_name,
               r.first_name || ' ' || r.last_name as reporter_name,
               tm.name as team_name,
               (SELECT COUNT(*) FROM tasks t WHERE t.story_id = s.id) as task_count
        FROM stories s
        LEFT JOIN projects p ON s.project_id = p.id
        LEFT JOIN products pr ON s.product_id = pr.id
        LEFT JOIN epics e ON s.epic_id = e.id
        LEFT JOIN features f ON s.feature_id = f.id
        LEFT JOIN users u ON s.assignee_id = u.id
        LEFT JOIN users r ON s.reporter_id = r.id
        LEFT JOIN teams tm ON s.team_id = tm.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (filter?.featureId) {
        params.push(filter.featureId);
        q += ` AND s.feature_id = $${params.length}`;
      }
      if (filter?.epicId) {
        params.push(filter.epicId);
        q += ` AND s.epic_id = $${params.length}`;
      }
      if (filter?.projectId) {
        params.push(filter.projectId);
        q += ` AND s.project_id = $${params.length}`;
      }
      if (filter?.productId) {
        params.push(filter.productId);
        q += ` AND s.product_id = $${params.length}`;
      }
      if (filter?.assigneeId) {
        params.push(filter.assigneeId);
        q += ` AND s.assignee_id = $${params.length}`;
      }
      if (filter?.teamId) {
        params.push(filter.teamId);
        q += ` AND s.team_id = $${params.length}`;
      }
      if (filter?.status) {
        params.push(filter.status);
        q += ` AND s.status = $${params.length}`;
      }
      if (filter?.priority) {
        params.push(filter.priority);
        q += ` AND s.priority = $${params.length}`;
      }
      if (filter?.sprint) {
        params.push(filter.sprint);
        q += ` AND s.sprint = $${params.length}`;
      }
      if (filter?.sprintId) {
        params.push(filter.sprintId);
        q += ` AND s.sprint_id = $${params.length}`;
      }
      if (filter?.search) {
        params.push(`%${filter.search.toLowerCase()}%`);
        q += ` AND (LOWER(s.title) LIKE $${params.length} OR LOWER(s.code) LIKE $${params.length} OR LOWER(s.description) LIKE $${params.length})`;
      }
      q += ' ORDER BY s.created_at DESC';
      const res = await query(q, params);
      return res.rows.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        description: r.description,
        userStory: r.user_story,
        acceptanceCriteria: r.acceptance_criteria || [],
        featureId: r.feature_id,
        featureName: r.feature_name,
        epicId: r.epic_id,
        epicName: r.epic_name,
        projectId: r.project_id,
        projectName: r.project_name,
        productId: r.product_id,
        productName: r.product_name,
        storyPoints: parseInt(r.story_points, 10) || 0,
        priority: r.priority,
        status: r.status,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        teamId: r.team_id,
        teamName: r.team_name,
        reporterId: r.reporter_id,
        reporterName: r.reporter_name,
        sprint: r.sprint,
        sprintId: r.sprint_id,
        targetRelease: r.target_release,
        dueDate: r.due_date,
        progress: parseInt(r.progress, 10) || 0,
        taskCount: parseInt(r.task_count, 10) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    let list = Array.from(memoryStories.values());
    if (filter?.featureId) list = list.filter((s) => s.featureId === filter.featureId);
    if (filter?.epicId) list = list.filter((s) => s.epicId === filter.epicId);
    if (filter?.projectId) list = list.filter((s) => s.projectId === filter.projectId);
    if (filter?.productId) list = list.filter((s) => s.productId === filter.productId);
    if (filter?.assigneeId) list = list.filter((s) => s.assigneeId === filter.assigneeId);
    if (filter?.teamId) list = list.filter((s) => s.teamId === filter.teamId);
    if (filter?.status) list = list.filter((s) => s.status === filter.status);
    if (filter?.priority) list = list.filter((s) => s.priority === filter.priority);
    if (filter?.sprint) list = list.filter((s) => s.sprint === filter.sprint);
    if (filter?.sprintId) list = list.filter((s) => s.sprintId === filter.sprintId || s.sprint === filter.sprintId);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q))
      );
    }
    return list;
  },

  async findById(id: string): Promise<UserStory | null> {
    if (isDbConnected()) {
      const q = `
        SELECT s.*,
               p.name as project_name,
               pr.name as product_name,
               e.name as epic_name,
               f.name as feature_name,
               u.first_name || ' ' || u.last_name as assignee_name,
               r.first_name || ' ' || r.last_name as reporter_name,
               tm.name as team_name,
               (SELECT COUNT(*) FROM tasks t WHERE t.story_id = s.id) as task_count
        FROM stories s
        LEFT JOIN projects p ON s.project_id = p.id
        LEFT JOIN products pr ON s.product_id = pr.id
        LEFT JOIN epics e ON s.epic_id = e.id
        LEFT JOIN features f ON s.feature_id = f.id
        LEFT JOIN users u ON s.assignee_id = u.id
        LEFT JOIN users r ON s.reporter_id = r.id
        LEFT JOIN teams tm ON s.team_id = tm.id
        WHERE s.id = $1
      `;
      const res = await query(q, [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        code: r.code,
        title: r.title,
        description: r.description,
        userStory: r.user_story,
        acceptanceCriteria: r.acceptance_criteria || [],
        featureId: r.feature_id,
        featureName: r.feature_name,
        epicId: r.epic_id,
        epicName: r.epic_name,
        projectId: r.project_id,
        projectName: r.project_name,
        productId: r.product_id,
        productName: r.product_name,
        storyPoints: parseInt(r.story_points, 10) || 0,
        priority: r.priority,
        status: r.status,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        teamId: r.team_id,
        teamName: r.team_name,
        reporterId: r.reporter_id,
        reporterName: r.reporter_name,
        sprint: r.sprint,
        targetRelease: r.target_release,
        dueDate: r.due_date,
        progress: parseInt(r.progress, 10) || 0,
        taskCount: parseInt(r.task_count, 10) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memoryStories.get(id) || null;
  },

  async create(story: UserStory): Promise<UserStory> {
    if (isDbConnected()) {
      const q = `
        INSERT INTO stories (
          id, code, title, description, user_story, acceptance_criteria,
          feature_id, epic_id, project_id, product_id, story_points, priority,
          status, assignee_id, team_id, reporter_id, sprint, target_release,
          due_date, progress, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22
        ) RETURNING *
      `;
      await query(q, [
        story.id,
        story.code,
        story.title,
        story.description || null,
        JSON.stringify(story.userStory || {}),
        JSON.stringify(story.acceptanceCriteria || []),
        story.featureId || null,
        story.epicId || null,
        story.projectId,
        story.productId || null,
        story.storyPoints || 3,
        story.priority || 'medium',
        story.status || 'backlog',
        story.assigneeId || null,
        story.teamId || null,
        story.reporterId || null,
        story.sprint || null,
        story.targetRelease || null,
        story.dueDate || null,
        story.progress || 0,
        story.createdAt || new Date().toISOString(),
        story.updatedAt || new Date().toISOString(),
      ]);
    }
    memoryStories.set(story.id, story);
    return story;
  },

  async update(id: string, updates: Partial<UserStory>): Promise<UserStory | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged: UserStory = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (merged.status === 'done') {
      merged.progress = 100;
    }

    if (isDbConnected()) {
      const q = `
        UPDATE stories SET
          title = $1, description = $2, user_story = $3, acceptance_criteria = $4,
          feature_id = $5, epic_id = $6, project_id = $7, product_id = $8,
          story_points = $9, priority = $10, status = $11, assignee_id = $12,
          team_id = $13, reporter_id = $14, sprint = $15, target_release = $16,
          due_date = $17, progress = $18, updated_at = $19
        WHERE id = $20
      `;
      await query(q, [
        merged.title,
        merged.description || null,
        JSON.stringify(merged.userStory || {}),
        JSON.stringify(merged.acceptanceCriteria || []),
        merged.featureId || null,
        merged.epicId || null,
        merged.projectId,
        merged.productId || null,
        merged.storyPoints || 0,
        merged.priority,
        merged.status,
        merged.assigneeId || null,
        merged.teamId || null,
        merged.reporterId || null,
        merged.sprint || null,
        merged.targetRelease || null,
        merged.dueDate || null,
        merged.progress || 0,
        merged.updatedAt,
        id,
      ]);
    }
    memoryStories.set(id, merged);
    return merged;
  },

  async recalculateProgress(storyId: string): Promise<number> {
    const story = await this.findById(storyId);
    if (!story) return 0;
    const tasks = await TaskRepository.findAll({ storyId });
    const progress = calculateStoryProgress(story.status, tasks);
    await this.update(storyId, { progress });
    return progress;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      const res = await query('DELETE FROM stories WHERE id = $1', [id]);
      const deleted = (res.rowCount || 0) > 0;
      memoryStories.delete(id);
      return deleted;
    }
    return memoryStories.delete(id);
  },
};
