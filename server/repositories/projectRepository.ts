import { Project } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryProjects: Map<string, Project> = new Map();

function seedDefaultProjects() {
  if (memoryProjects.size > 0) return;
  const defaultProjects: Project[] = [
    {
      id: 'PRJ-101',
      code: 'PRJ-101',
      name: 'Ares Flight Control Firmware',
      client: 'SpaceX Commercial',
      managerId: 'usr_admin_1',
      managerName: 'Surya Prashanth',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      members: [
        { userId: 'usr_admin_1', name: 'Surya Prashanth', role: 'Project Manager' },
        { userId: 'usr_pm_2', name: 'Alex Morgan', role: 'Lead Architect' },
        { name: 'Bob Johnson', role: 'Lead Developer' },
        { name: 'David Miller', role: 'QA Analyst' },
        { name: 'Sarah Connor', role: 'Business Analyst' },
      ],
      status: 'in-progress',
      risk: 'Medium',
      progress: 68,
      budget: 450000,
      sprint: 'Sprint 24',
      startDate: '2026-01-10',
      endDate: '2026-09-30',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      sowStatus: 'Signed',
      poc: 'Dr. G. Vance',
      developer: 'Bob Johnson',
      qa: 'David Miller',
      ba: 'Sarah Connor',
      remarks: 'Trajectory matrix benchmark completed. Flight software release 4.2 scheduled.',
      month: 'August',
      quarter: 'Q3',
      year: '2026',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'PRJ-102',
      code: 'PRJ-102',
      name: 'Titan Cryogenic Propulsion Telemetry',
      client: 'NASA JPL',
      managerId: 'usr_pm_2',
      managerName: 'Alex Morgan',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      members: [
        { userId: 'usr_pm_2', name: 'Alex Morgan', role: 'Project Manager' },
        { name: 'Bob Johnson', role: 'Developer' },
        { name: 'David Miller', role: 'QA' },
      ],
      status: 'in-progress',
      risk: 'High',
      progress: 42,
      budget: 820000,
      sprint: 'Sprint 18',
      startDate: '2026-02-01',
      endDate: '2026-11-15',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      sowStatus: 'Signed',
      poc: 'Sarah Jenkins',
      developer: 'Bob Johnson',
      qa: 'David Miller',
      ba: 'Sarah Connor',
      remarks: 'Cryo-valving telemetry calibration in progress.',
      month: 'August',
      quarter: 'Q3',
      year: '2026',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'PRJ-103',
      code: 'PRJ-103',
      name: 'Orion Life Support Automation',
      client: 'Lockheed Martin',
      managerId: 'usr_admin_1',
      managerName: 'Surya Prashanth',
      teamId: 'team_2',
      teamName: 'Enterprise AI & Automation',
      members: [
        { userId: 'usr_admin_1', name: 'Surya Prashanth', role: 'Project Manager' },
        { name: 'Alice Walker', role: 'Lead Developer' },
      ],
      status: 'awaiting-sow-sign-off',
      risk: 'Critical',
      progress: 15,
      budget: 350000,
      sprint: 'Sprint 4',
      startDate: '2026-04-01',
      endDate: '2026-12-20',
      productId: 'prod_1',
      productName: 'Ares Autonomous Flight Stack',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      sowStatus: 'Pending Executive Sign-off',
      poc: 'Marcus Vance',
      developer: 'Alice Walker',
      qa: 'David Miller',
      ba: 'Sarah Connor',
      remarks: 'Pending executive sign-off on safety envelope specifications.',
      month: 'August',
      quarter: 'Q3',
      year: '2026',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'PRJ-104',
      code: 'PRJ-104',
      name: 'Artemis Deep Space Optical Comms',
      client: 'Blue Origin',
      managerId: 'usr_pm_2',
      managerName: 'Alex Morgan',
      teamId: 'team_1',
      teamName: 'Core Platform & Architecture',
      members: [
        { userId: 'usr_pm_2', name: 'Alex Morgan', role: 'Project Manager' },
        { name: 'Bob Johnson', role: 'Developer' },
      ],
      status: 'in-progress',
      risk: 'Low',
      progress: 89,
      budget: 280000,
      sprint: 'Sprint 31',
      startDate: '2025-11-01',
      endDate: '2026-08-30',
      productId: 'prod_2',
      productName: 'Helios Deep Space Telemetry Suite',
      portfolioId: 'port_1',
      portfolioName: 'Aerospace & Mission Systems',
      sowStatus: 'Signed',
      poc: 'Col. T. Reynolds',
      developer: 'Bob Johnson',
      qa: 'David Miller',
      ba: 'Sarah Connor',
      remarks: 'Laser ground terminal locked on target.',
      month: 'July',
      quarter: 'Q3',
      year: '2026',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  defaultProjects.forEach((p) => memoryProjects.set(p.id, p));
}

seedDefaultProjects();

export const ProjectRepository = {
  async findAll(): Promise<Project[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM projects ORDER BY created_at DESC');
      return res.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        client: r.client,
        managerId: r.manager_id,
        teamId: r.team_id,
        members: typeof r.members === 'string' ? JSON.parse(r.members) : r.members || [],
        status: r.status,
        risk: r.risk,
        progress: parseInt(r.progress || '0', 10),
        budget: parseFloat(r.budget || '0'),
        sprint: r.sprint,
        startDate: r.start_date,
        endDate: r.end_date,
        productId: r.product_id,
        portfolioId: r.portfolio_id,
        sowStatus: r.sow_status,
        poc: r.poc,
        developer: r.developer,
        qa: r.qa,
        ba: r.ba,
        remarks: r.remarks,
        month: r.month,
        quarter: r.quarter,
        year: r.year,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }
    return Array.from(memoryProjects.values());
  },

  async findById(id: string): Promise<Project | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM projects WHERE id = $1 OR code = $1', [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        client: r.client,
        managerId: r.manager_id,
        teamId: r.team_id,
        members: typeof r.members === 'string' ? JSON.parse(r.members) : r.members || [],
        status: r.status,
        risk: r.risk,
        progress: parseInt(r.progress || '0', 10),
        budget: parseFloat(r.budget || '0'),
        sprint: r.sprint,
        startDate: r.start_date,
        endDate: r.end_date,
        productId: r.product_id,
        portfolioId: r.portfolio_id,
        sowStatus: r.sow_status,
        poc: r.poc,
        developer: r.developer,
        qa: r.qa,
        ba: r.ba,
        remarks: r.remarks,
        month: r.month,
        quarter: r.quarter,
        year: r.year,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memoryProjects.get(id) || null;
  },

  async create(project: Partial<Project>): Promise<Project> {
    const id = project.id || project.code || `PRJ-${Date.now().toString().slice(-4)}`;
    const code = project.code || id;
    const now = new Date().toISOString();

    const newProject: Project = {
      id,
      code,
      name: project.name || 'Untitled Project',
      client: project.client || 'Enterprise Client',
      managerId: project.managerId || 'usr_admin_1',
      managerName: project.managerName || 'Surya Prashanth',
      teamId: project.teamId,
      teamName: project.teamName,
      members: project.members || [],
      status: project.status || 'planning',
      risk: project.risk || 'Low',
      progress: Number(project.progress) || 0,
      budget: Number(project.budget) || 0,
      sprint: project.sprint,
      startDate: project.startDate,
      endDate: project.endDate,
      productId: project.productId,
      productName: project.productName,
      portfolioId: project.portfolioId,
      portfolioName: project.portfolioName,
      sowStatus: project.sowStatus,
      poc: project.poc,
      developer: project.developer,
      qa: project.qa,
      ba: project.ba,
      remarks: project.remarks,
      month: project.month,
      quarter: project.quarter,
      year: project.year,
      createdAt: now,
      updatedAt: now,
    };

    if (isDbConnected()) {
      await query(
        `INSERT INTO projects (id, code, name, client, manager_id, team_id, members, status, risk, progress, budget, sprint, start_date, end_date, product_id, portfolio_id, sow_status, poc, developer, qa, ba, remarks, month, quarter, year, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
        [
          newProject.id,
          newProject.code,
          newProject.name,
          newProject.client,
          newProject.managerId || null,
          newProject.teamId || null,
          JSON.stringify(newProject.members || []),
          newProject.status,
          newProject.risk,
          newProject.progress,
          newProject.budget,
          newProject.sprint || null,
          newProject.startDate || null,
          newProject.endDate || null,
          newProject.productId || null,
          newProject.portfolioId || null,
          newProject.sowStatus || null,
          newProject.poc || null,
          newProject.developer || null,
          newProject.qa || null,
          newProject.ba || null,
          newProject.remarks || null,
          newProject.month || null,
          newProject.quarter || null,
          newProject.year || null,
          newProject.createdAt,
          newProject.updatedAt,
        ]
      );
    }
    memoryProjects.set(newProject.id, newProject);
    return newProject;
  },

  async update(id: string, updates: Partial<Project>): Promise<Project | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: Project = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (isDbConnected()) {
      await query(
        `UPDATE projects SET
           name = $1, client = $2, manager_id = $3, team_id = $4, members = $5,
           status = $6, risk = $7, progress = $8, budget = $9, sprint = $10,
           start_date = $11, end_date = $12, product_id = $13, portfolio_id = $14,
           sow_status = $15, poc = $16, developer = $17, qa = $18, ba = $19,
           remarks = $20, month = $21, quarter = $22, year = $23, updated_at = $24
         WHERE id = $25`,
        [
          updated.name,
          updated.client,
          updated.managerId || null,
          updated.teamId || null,
          JSON.stringify(updated.members || []),
          updated.status,
          updated.risk,
          updated.progress,
          updated.budget,
          updated.sprint || null,
          updated.startDate || null,
          updated.endDate || null,
          updated.productId || null,
          updated.portfolioId || null,
          updated.sowStatus || null,
          updated.poc || null,
          updated.developer || null,
          updated.qa || null,
          updated.ba || null,
          updated.remarks || null,
          updated.month || null,
          updated.quarter || null,
          updated.year || null,
          updated.updatedAt,
          id,
        ]
      );
    }
    memoryProjects.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      const res = await query('DELETE FROM projects WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    }
    return memoryProjects.delete(id);
  },

  /**
   * Safe migration of LocalStorage projects into V2 database / repository
   * Avoids duplicates by matching id/code
   */
  async migrateFromLocal(localProjects: Partial<Project>[]): Promise<{
    total: number;
    imported: number;
    skipped: number;
    projects: Project[];
  }> {
    let imported = 0;
    let skipped = 0;

    for (const proj of localProjects) {
      if (!proj || (!proj.id && !proj.name)) {
        skipped++;
        continue;
      }
      const existingId = proj.id || proj.code;
      if (existingId) {
        const existing = await this.findById(existingId);
        if (existing) {
          skipped++;
          continue;
        }
      }

      await this.create(proj);
      imported++;
    }

    const all = await this.findAll();
    return {
      total: localProjects.length,
      imported,
      skipped,
      projects: all,
    };
  },
};
