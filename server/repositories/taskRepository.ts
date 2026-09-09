import { Task } from '../models/types';
import { isDbConnected, query } from '../config/database';
import { SubtaskRepository } from './subtaskRepository';
import { calculateTaskProgress } from '../services/progressCalculator';

const memoryTasks: Map<string, Task> = new Map();

function seedDefaultTasks() {
  if (memoryTasks.size > 0) return;
  const defaults: Task[] = [
    {
      id: 'task_1',
      code: 'TSK-101',
      title: 'Implement Attitude Sensor Matrix Calibration',
      description: 'Program real-time IMU bias matrix inversion filter in RTOS task loop.',
      storyId: 'story_1',
      storyTitle: 'Automated Trajectory Drift Correction on Orbital Insertion',
      featureId: 'feat_1',
      featureName: 'Autonomous Real-time Trajectory Engine',
      epicId: 'epic_1',
      epicName: 'Ares Flight Guidance & Attitude Determination Core',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      assigneeId: 'usr_dev_3',
      assigneeName: 'Bob Johnson',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'in-progress',
      priority: 'high',
      dueDate: '2026-09-18',
      estimatedEffortHrs: 16,
      actualEffortHrs: 8,
      startDate: '2026-09-01',
      sprint: 'Sprint 24',
      progress: 50,
      subtaskCount: 2,
      createdAt: '2026-09-01T08:00:00Z',
      updatedAt: '2026-09-06T14:00:00Z',
    },
    {
      id: 'task_2',
      code: 'TSK-102',
      title: 'Calibrate Pulse-Width Modulation for Cold Gas Thrusters',
      description: 'Integrate hardware timer counter PWM duty cycle profiles for thruster solenoids.',
      storyId: 'story_1',
      storyTitle: 'Automated Trajectory Drift Correction on Orbital Insertion',
      featureId: 'feat_1',
      featureName: 'Autonomous Real-time Trajectory Engine',
      epicId: 'epic_1',
      epicName: 'Ares Flight Guidance & Attitude Determination Core',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      assigneeId: 'usr_dev_3',
      assigneeName: 'Bob Johnson',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'ready',
      priority: 'medium',
      dueDate: '2026-09-25',
      estimatedEffortHrs: 12,
      actualEffortHrs: 2,
      startDate: '2026-09-05',
      sprint: 'Sprint 24',
      progress: 10,
      subtaskCount: 1,
      createdAt: '2026-09-02T08:00:00Z',
      updatedAt: '2026-09-02T08:00:00Z',
    },
    {
      id: 'task_3',
      code: 'TSK-103',
      title: 'Design Fail-Safe Watchdog for IMU Communication Failure',
      description: 'Hardware interrupt service routine fallback to redundant star-tracker navigation.',
      storyId: 'story_2',
      storyTitle: 'Real-time Telemetry Health State Packet Broadcasting',
      featureId: 'feat_2',
      featureName: 'Redundant Sensor Bus Multiplexer',
      epicId: 'epic_1',
      epicName: 'Ares Flight Guidance & Attitude Determination Core',
      projectId: 'PRJ-101',
      projectName: 'Ares Flight Control Firmware',
      assigneeId: 'usr_qa_4',
      assigneeName: 'David Miller',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'testing',
      priority: 'critical',
      dueDate: '2026-09-22',
      estimatedEffortHrs: 20,
      actualEffortHrs: 18,
      startDate: '2026-08-28',
      sprint: 'Sprint 24',
      progress: 80,
      subtaskCount: 0,
      createdAt: '2026-08-28T09:00:00Z',
      updatedAt: '2026-09-05T16:00:00Z',
    },
    {
      id: 'task_4',
      code: 'TSK-104',
      title: 'Cryo-Tank Pressure Gradient Threshold Verification',
      description: 'Verify dynamic relief valve pressure sensor reading telemetry stream.',
      featureId: 'feat_3',
      featureName: 'Cryogenic Fluid Pressure Regulation Pipeline',
      epicId: 'epic_2',
      epicName: 'Propulsion Cryogenic Manifold Management',
      projectId: 'PRJ-102',
      projectName: 'Titan Cryogenic Propulsion Telemetry',
      assigneeId: 'usr_pm_2',
      assigneeName: 'Alex Morgan',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      status: 'in-progress',
      priority: 'high',
      dueDate: '2026-10-01',
      estimatedEffortHrs: 24,
      actualEffortHrs: 10,
      startDate: '2026-09-01',
      sprint: 'Sprint 18',
      progress: 50,
      subtaskCount: 0,
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-06T11:00:00Z',
    },
  ];
  defaults.forEach((t) => memoryTasks.set(t.id, t));
}

seedDefaultTasks();

export const TaskRepository = {
  async findAll(filter?: {
    storyId?: string;
    featureId?: string;
    epicId?: string;
    projectId?: string;
    assigneeId?: string;
    teamId?: string;
    status?: string;
    priority?: string;
    sprint?: string;
    sprintId?: string;
    search?: string;
  }): Promise<Task[]> {
    if (isDbConnected()) {
      let q = `
        SELECT t.*,
               p.name as project_name,
               e.name as epic_name,
               f.name as feature_name,
               s.title as story_title,
               u.first_name || ' ' || u.last_name as assignee_name,
               tm.name as team_name,
               (SELECT COUNT(*) FROM subtasks sub WHERE sub.task_id = t.id) as subtask_count
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN epics e ON t.epic_id = e.id
        LEFT JOIN features f ON t.feature_id = f.id
        LEFT JOIN stories s ON t.story_id = s.id
        LEFT JOIN users u ON t.assignee_id = u.id
        LEFT JOIN teams tm ON t.team_id = tm.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (filter?.storyId) {
        params.push(filter.storyId);
        q += ` AND t.story_id = $${params.length}`;
      }
      if (filter?.featureId) {
        params.push(filter.featureId);
        q += ` AND t.feature_id = $${params.length}`;
      }
      if (filter?.epicId) {
        params.push(filter.epicId);
        q += ` AND t.epic_id = $${params.length}`;
      }
      if (filter?.projectId) {
        params.push(filter.projectId);
        q += ` AND t.project_id = $${params.length}`;
      }
      if (filter?.assigneeId) {
        params.push(filter.assigneeId);
        q += ` AND t.assignee_id = $${params.length}`;
      }
      if (filter?.teamId) {
        params.push(filter.teamId);
        q += ` AND t.team_id = $${params.length}`;
      }
      if (filter?.status) {
        params.push(filter.status);
        q += ` AND t.status = $${params.length}`;
      }
      if (filter?.priority) {
        params.push(filter.priority);
        q += ` AND t.priority = $${params.length}`;
      }
      if (filter?.sprint) {
        params.push(filter.sprint);
        q += ` AND t.sprint = $${params.length}`;
      }
      if (filter?.sprintId) {
        params.push(filter.sprintId);
        q += ` AND t.sprint_id = $${params.length}`;
      }
      if (filter?.search) {
        params.push(`%${filter.search.toLowerCase()}%`);
        q += ` AND (LOWER(t.title) LIKE $${params.length} OR LOWER(t.code) LIKE $${params.length} OR LOWER(t.description) LIKE $${params.length})`;
      }
      q += ' ORDER BY t.created_at DESC';
      const res = await query(q, params);
      return res.rows.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        description: r.description,
        storyId: r.story_id,
        storyTitle: r.story_title,
        featureId: r.feature_id,
        featureName: r.feature_name,
        epicId: r.epic_id,
        epicName: r.epic_name,
        projectId: r.project_id,
        projectName: r.project_name,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        teamId: r.team_id,
        teamName: r.team_name,
        status: r.status,
        priority: r.priority,
        dueDate: r.due_date,
        estimatedEffortHrs: parseFloat(r.estimated_effort_hrs) || 0,
        actualEffortHrs: parseFloat(r.actual_effort_hrs) || 0,
        startDate: r.start_date,
        completionDate: r.completion_date,
        sprint: r.sprint,
        sprintId: r.sprint_id,
        progress: parseInt(r.progress, 10) || 0,
        subtaskCount: parseInt(r.subtask_count, 10) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    let list = Array.from(memoryTasks.values());
    if (filter?.storyId) list = list.filter((t) => t.storyId === filter.storyId);
    if (filter?.featureId) list = list.filter((t) => t.featureId === filter.featureId);
    if (filter?.epicId) list = list.filter((t) => t.epicId === filter.epicId);
    if (filter?.projectId) list = list.filter((t) => t.projectId === filter.projectId);
    if (filter?.assigneeId) list = list.filter((t) => t.assigneeId === filter.assigneeId);
    if (filter?.teamId) list = list.filter((t) => t.teamId === filter.teamId);
    if (filter?.status) list = list.filter((t) => t.status === filter.status);
    if (filter?.priority) list = list.filter((t) => t.priority === filter.priority);
    if (filter?.sprint) list = list.filter((t) => t.sprint === filter.sprint);
    if (filter?.sprintId) list = list.filter((t) => t.sprintId === filter.sprintId || t.sprint === filter.sprintId);
    if (filter?.search) {
      const s = filter.search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(s) ||
          t.code.toLowerCase().includes(s) ||
          (t.description && t.description.toLowerCase().includes(s))
      );
    }
    return list;
  },

  async findById(id: string): Promise<Task | null> {
    if (isDbConnected()) {
      const q = `
        SELECT t.*,
               p.name as project_name,
               e.name as epic_name,
               f.name as feature_name,
               s.title as story_title,
               u.first_name || ' ' || u.last_name as assignee_name,
               tm.name as team_name,
               (SELECT COUNT(*) FROM subtasks sub WHERE sub.task_id = t.id) as subtask_count
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN epics e ON t.epic_id = e.id
        LEFT JOIN features f ON t.feature_id = f.id
        LEFT JOIN stories s ON t.story_id = s.id
        LEFT JOIN users u ON t.assignee_id = u.id
        LEFT JOIN teams tm ON t.team_id = tm.id
        WHERE t.id = $1
      `;
      const res = await query(q, [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        code: r.code,
        title: r.title,
        description: r.description,
        storyId: r.story_id,
        storyTitle: r.story_title,
        featureId: r.feature_id,
        featureName: r.feature_name,
        epicId: r.epic_id,
        epicName: r.epic_name,
        projectId: r.project_id,
        projectName: r.project_name,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        teamId: r.team_id,
        teamName: r.team_name,
        status: r.status,
        priority: r.priority,
        dueDate: r.due_date,
        estimatedEffortHrs: parseFloat(r.estimated_effort_hrs) || 0,
        actualEffortHrs: parseFloat(r.actual_effort_hrs) || 0,
        startDate: r.start_date,
        completionDate: r.completion_date,
        sprint: r.sprint,
        progress: parseInt(r.progress, 10) || 0,
        subtaskCount: parseInt(r.subtask_count, 10) || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memoryTasks.get(id) || null;
  },

  async create(task: Task): Promise<Task> {
    if (isDbConnected()) {
      const q = `
        INSERT INTO tasks (
          id, code, title, description, story_id, feature_id, epic_id, project_id,
          assignee_id, team_id, status, priority, due_date, estimated_effort_hrs,
          actual_effort_hrs, start_date, completion_date, sprint, progress, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21
        ) RETURNING *
      `;
      await query(q, [
        task.id,
        task.code,
        task.title,
        task.description || null,
        task.storyId || null,
        task.featureId || null,
        task.epicId || null,
        task.projectId,
        task.assigneeId || null,
        task.teamId || null,
        task.status || 'backlog',
        task.priority || 'medium',
        task.dueDate || null,
        task.estimatedEffortHrs || 0,
        task.actualEffortHrs || 0,
        task.startDate || null,
        task.completionDate || null,
        task.sprint || null,
        task.progress || 0,
        task.createdAt || new Date().toISOString(),
        task.updatedAt || new Date().toISOString(),
      ]);
    }
    memoryTasks.set(task.id, task);
    return task;
  },

  async update(id: string, updates: Partial<Task>): Promise<Task | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged: Task = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (merged.status === 'done' && !merged.completionDate) {
      merged.completionDate = new Date().toISOString();
      merged.progress = 100;
    } else if (merged.status !== 'done') {
      merged.completionDate = undefined;
    }

    if (isDbConnected()) {
      const q = `
        UPDATE tasks SET
          title = $1, description = $2, story_id = $3, feature_id = $4, epic_id = $5,
          project_id = $6, assignee_id = $7, team_id = $8, status = $9, priority = $10,
          due_date = $11, estimated_effort_hrs = $12, actual_effort_hrs = $13,
          start_date = $14, completion_date = $15, sprint = $16, progress = $17, updated_at = $18
        WHERE id = $19
      `;
      await query(q, [
        merged.title,
        merged.description || null,
        merged.storyId || null,
        merged.featureId || null,
        merged.epicId || null,
        merged.projectId,
        merged.assigneeId || null,
        merged.teamId || null,
        merged.status,
        merged.priority,
        merged.dueDate || null,
        merged.estimatedEffortHrs || 0,
        merged.actualEffortHrs || 0,
        merged.startDate || null,
        merged.completionDate || null,
        merged.sprint || null,
        merged.progress || 0,
        merged.updatedAt,
        id,
      ]);
    }
    memoryTasks.set(id, merged);
    return merged;
  },

  async recalculateProgress(taskId: string): Promise<number> {
    const task = await this.findById(taskId);
    if (!task) return 0;
    const subtasks = await SubtaskRepository.findAll({ taskId });
    const progress = calculateTaskProgress(task.status, subtasks);
    await this.update(taskId, { progress });
    return progress;
  },

  async delete(id: string): Promise<boolean> {
    await SubtaskRepository.deleteByTaskId(id);
    if (isDbConnected()) {
      const res = await query('DELETE FROM tasks WHERE id = $1', [id]);
      const deleted = (res.rowCount || 0) > 0;
      memoryTasks.delete(id);
      return deleted;
    }
    return memoryTasks.delete(id);
  },
};
