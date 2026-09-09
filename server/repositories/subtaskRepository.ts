import { Subtask } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memorySubtasks: Map<string, Subtask> = new Map();

function seedDefaultSubtasks() {
  if (memorySubtasks.size > 0) return;
  const defaults: Subtask[] = [
    {
      id: 'sub_1',
      taskId: 'task_1',
      taskTitle: 'Implement Attitude Sensor Matrix Calibration',
      title: 'Configure SPI clock rate and DMA transfer buffers',
      assigneeId: 'usr_dev_3',
      assigneeName: 'Bob Johnson',
      status: 'done',
      priority: 'high',
      estimateHrs: 4,
      dueDate: '2026-09-12',
      completedAt: '2026-09-06T14:00:00Z',
      createdAt: '2026-09-01T09:00:00Z',
      updatedAt: '2026-09-06T14:00:00Z',
    },
    {
      id: 'sub_2',
      taskId: 'task_1',
      taskTitle: 'Implement Attitude Sensor Matrix Calibration',
      title: 'Run zero-g gyro drift compensation test',
      assigneeId: 'usr_qa_4',
      assigneeName: 'David Miller',
      status: 'in-progress',
      priority: 'high',
      estimateHrs: 6,
      dueDate: '2026-09-15',
      createdAt: '2026-09-01T09:00:00Z',
      updatedAt: '2026-09-07T10:00:00Z',
    },
    {
      id: 'sub_3',
      taskId: 'task_2',
      taskTitle: 'Calibrate Pulse-Width Modulation for Cold Gas Thrusters',
      title: 'Bench-test solenoid microsecond response curve',
      assigneeId: 'usr_dev_3',
      assigneeName: 'Bob Johnson',
      status: 'ready',
      priority: 'medium',
      estimateHrs: 5,
      dueDate: '2026-09-20',
      createdAt: '2026-09-02T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z',
    },
  ];
  defaults.forEach((s) => memorySubtasks.set(s.id, s));
}

seedDefaultSubtasks();

export const SubtaskRepository = {
  async findAll(filter?: { taskId?: string; assigneeId?: string; status?: string }): Promise<Subtask[]> {
    if (isDbConnected()) {
      let q = `
        SELECT s.*, t.title as task_title,
               u.first_name || ' ' || u.last_name as assignee_name
        FROM subtasks s
        LEFT JOIN tasks t ON s.task_id = t.id
        LEFT JOIN users u ON s.assignee_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];
      if (filter?.taskId) {
        params.push(filter.taskId);
        q += ` AND s.task_id = $${params.length}`;
      }
      if (filter?.assigneeId) {
        params.push(filter.assigneeId);
        q += ` AND s.assignee_id = $${params.length}`;
      }
      if (filter?.status) {
        params.push(filter.status);
        q += ` AND s.status = $${params.length}`;
      }
      q += ' ORDER BY s.created_at ASC';
      const res = await query(q, params);
      return res.rows.map((r) => ({
        id: r.id,
        taskId: r.task_id,
        taskTitle: r.task_title,
        title: r.title,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        status: r.status,
        priority: r.priority,
        estimateHrs: parseFloat(r.estimate_hrs) || 0,
        dueDate: r.due_date,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }

    let list = Array.from(memorySubtasks.values());
    if (filter?.taskId) list = list.filter((s) => s.taskId === filter.taskId);
    if (filter?.assigneeId) list = list.filter((s) => s.assigneeId === filter.assigneeId);
    if (filter?.status) list = list.filter((s) => s.status === filter.status);
    return list;
  },

  async findById(id: string): Promise<Subtask | null> {
    if (isDbConnected()) {
      const q = `
        SELECT s.*, t.title as task_title,
               u.first_name || ' ' || u.last_name as assignee_name
        FROM subtasks s
        LEFT JOIN tasks t ON s.task_id = t.id
        LEFT JOIN users u ON s.assignee_id = u.id
        WHERE s.id = $1
      `;
      const res = await query(q, [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        taskId: r.task_id,
        taskTitle: r.task_title,
        title: r.title,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        status: r.status,
        priority: r.priority,
        estimateHrs: parseFloat(r.estimate_hrs) || 0,
        dueDate: r.due_date,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memorySubtasks.get(id) || null;
  },

  async create(subtask: Subtask): Promise<Subtask> {
    if (isDbConnected()) {
      const q = `
        INSERT INTO subtasks (id, task_id, title, assignee_id, status, priority, estimate_hrs, due_date, completed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;
      await query(q, [
        subtask.id,
        subtask.taskId,
        subtask.title,
        subtask.assigneeId || null,
        subtask.status || 'backlog',
        subtask.priority || 'medium',
        subtask.estimateHrs || 0,
        subtask.dueDate || null,
        subtask.completedAt || null,
        subtask.createdAt || new Date().toISOString(),
        subtask.updatedAt || new Date().toISOString(),
      ]);
    }
    memorySubtasks.set(subtask.id, subtask);
    return subtask;
  },

  async update(id: string, updates: Partial<Subtask>): Promise<Subtask | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const merged: Subtask = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (merged.status === 'done' && !merged.completedAt) {
      merged.completedAt = new Date().toISOString();
    } else if (merged.status !== 'done') {
      merged.completedAt = undefined;
    }

    if (isDbConnected()) {
      const q = `
        UPDATE subtasks
        SET title = $1, assignee_id = $2, status = $3, priority = $4, estimate_hrs = $5, due_date = $6, completed_at = $7, updated_at = $8
        WHERE id = $9
      `;
      await query(q, [
        merged.title,
        merged.assigneeId || null,
        merged.status,
        merged.priority,
        merged.estimateHrs || 0,
        merged.dueDate || null,
        merged.completedAt || null,
        merged.updatedAt,
        id,
      ]);
    }
    memorySubtasks.set(id, merged);
    return merged;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      const res = await query('DELETE FROM subtasks WHERE id = $1', [id]);
      const deleted = (res.rowCount || 0) > 0;
      memorySubtasks.delete(id);
      return deleted;
    }
    return memorySubtasks.delete(id);
  },

  async deleteByTaskId(taskId: string): Promise<void> {
    if (isDbConnected()) {
      await query('DELETE FROM subtasks WHERE task_id = $1', [taskId]);
    }
    for (const [id, s] of memorySubtasks.entries()) {
      if (s.taskId === taskId) {
        memorySubtasks.delete(id);
      }
    }
  },
};
