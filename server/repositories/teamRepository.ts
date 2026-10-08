import { Team, TeamMember } from '../models/types';
import { persistentMap, skipDemoSeed } from '../config/persistence';
import { isDbConnected, query, withTransaction } from '../config/database';

// Sprint 20: restored from / saved to the embedded data file in persistent mode.
const memoryTeams = persistentMap<Team>('teams');

function seedDefaultTeams() {
  if (memoryTeams.size > 0 || skipDemoSeed()) return;
  const defaultTeams: Team[] = [
    {
      id: 'team_1',
      name: 'Core Platform & Architecture',
      department: 'Engineering',
      leadId: 'usr_admin_1',
      leadName: 'Surya Prashanth',
      capacityHrs: 320,
      allocatedHrs: 240,
      memberCount: 5,
      members: [
        { userId: 'usr_admin_1', userName: 'Surya Prashanth', roleInTeam: 'Team Lead', allocatedHrs: 40 },
        { userId: 'usr_pm_2', userName: 'Alex Morgan', roleInTeam: 'Senior Architect', allocatedHrs: 40 },
        { userId: 'usr_dev_3', userName: 'Bob Johnson', roleInTeam: 'Lead Developer', allocatedHrs: 40 },
        { userId: 'usr_qa_4', userName: 'David Miller', roleInTeam: 'Lead QA', allocatedHrs: 40 },
        { userId: 'usr_ba_5', userName: 'Sarah Connor', roleInTeam: 'Lead BA', allocatedHrs: 40 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'team_2',
      name: 'Enterprise AI & Automation',
      department: 'Product',
      leadId: 'usr_admin_1',
      leadName: 'Surya Prashanth',
      capacityHrs: 160,
      allocatedHrs: 120,
      memberCount: 3,
      members: [
        { userId: 'usr_admin_1', userName: 'Surya Prashanth', roleInTeam: 'Team Lead', allocatedHrs: 40 },
        { userId: 'usr_dev_6', userName: 'Alice Walker', roleInTeam: 'AI Engineer', allocatedHrs: 40 },
        { userId: 'usr_qa_7', userName: 'Emma Watson', roleInTeam: 'Automation QA', allocatedHrs: 40 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'team_3',
      name: 'Flight Mission Control',
      department: 'Avionics',
      leadId: 'usr_pm_2',
      leadName: 'Alex Morgan',
      capacityHrs: 160,
      allocatedHrs: 140,
      memberCount: 2,
      members: [
        { userId: 'usr_pm_2', userName: 'Alex Morgan', roleInTeam: 'Flight Operations Lead', allocatedHrs: 40 },
        { userId: 'usr_dev_3', userName: 'Bob Johnson', roleInTeam: 'Avionics Specialist', allocatedHrs: 40 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  defaultTeams.forEach((t) => memoryTeams.set(t.id, t));
}

seedDefaultTeams();

/**
 * Sprint 24 — in PostgreSQL mode team membership lives in team_members (one
 * row per person per team, UNIQUE(team_id, user_id)); memberCount is the
 * number of those rows and allocatedHrs their sum. The embedded store keeps
 * members on the team record, as before.
 */
async function loadMembers(teamIds: string[]): Promise<Map<string, TeamMember[]>> {
  const byTeam = new Map<string, TeamMember[]>();
  if (teamIds.length === 0) return byTeam;
  const res = await query(
    `SELECT tm.team_id, tm.user_id, tm.role_in_team, tm.allocated_hrs, u.first_name, u.last_name, u.email
       FROM team_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ANY($1)
      ORDER BY tm.created_at ASC, tm.id ASC`,
    [teamIds]
  );
  for (const r of res.rows) {
    const list = byTeam.get(r.team_id) || [];
    list.push({
      userId: r.user_id,
      userName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
      userEmail: r.email,
      roleInTeam: r.role_in_team || 'Member',
      allocatedHrs: Number(r.allocated_hrs ?? 0),
    });
    byTeam.set(r.team_id, list);
  }
  return byTeam;
}

function teamFromRow(r: any, members: TeamMember[]): Team {
  return {
    id: r.id,
    name: r.name,
    department: r.department,
    leadId: r.lead_id,
    capacityHrs: parseFloat(r.capacity_hrs || '0'),
    allocatedHrs: members.reduce((sum, m) => sum + (Number(m.allocatedHrs) || 0), 0),
    memberCount: members.length,
    members,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function writeMember(teamId: string, member: TeamMember): Promise<void> {
  await query(
    `INSERT INTO team_members (id, team_id, user_id, role_in_team, allocated_hrs)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (team_id, user_id) DO UPDATE SET role_in_team = EXCLUDED.role_in_team, allocated_hrs = EXCLUDED.allocated_hrs`,
    [`tm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, teamId, member.userId, member.roleInTeam || 'Member', member.allocatedHrs ?? 40]
  );
}

export const TeamRepository = {
  async findAll(): Promise<Team[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM teams ORDER BY name ASC');
      const members = await loadMembers(res.rows.map((r) => r.id));
      return res.rows.map((r) => teamFromRow(r, members.get(r.id) || []));
    }
    return Array.from(memoryTeams.values());
  },

  async findById(id: string): Promise<Team | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM teams WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const members = await loadMembers([id]);
      return teamFromRow(res.rows[0], members.get(id) || []);
    }
    return memoryTeams.get(id) || null;
  },

  async create(teamData: Partial<Team>): Promise<Team> {
    const id = teamData.id || `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const newTeam: Team = {
      id,
      name: teamData.name || 'Untitled Team',
      department: teamData.department || 'Engineering',
      leadId: teamData.leadId, // Sprint 24: no demo lead (the service supplies one)
      leadName: teamData.leadName,
      capacityHrs: teamData.capacityHrs || 160,
      allocatedHrs: teamData.allocatedHrs || 0,
      memberCount: teamData.members ? teamData.members.length : 0,
      members: teamData.members || [],
      createdAt: now,
      updatedAt: now,
    };

    if (isDbConnected()) {
      // Sprint 24: the team and its members are one unit.
      await withTransaction(async () => {
        await query(
          `INSERT INTO teams (id, name, department, lead_id, capacity_hrs, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [newTeam.id, newTeam.name, newTeam.department, newTeam.leadId || null, newTeam.capacityHrs, newTeam.createdAt, newTeam.updatedAt]
        );
        for (const member of newTeam.members || []) await writeMember(newTeam.id, member);
      });
      return (await this.findById(newTeam.id)) as Team;
    }
    memoryTeams.set(newTeam.id, newTeam);
    return newTeam;
  },

  async update(id: string, updates: Partial<Team>): Promise<Team | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: Team = {
      ...existing,
      ...updates,
      memberCount: updates.members ? updates.members.length : existing.memberCount,
      updatedAt: new Date().toISOString(),
    };

    if (isDbConnected()) {
      // Sprint 24: the team row and (when given) its member list change together; the row count is authoritative.
      const changed = await withTransaction(async () => {
        const res = await query(
          `UPDATE teams SET name = $1, department = $2, lead_id = $3, capacity_hrs = $4, updated_at = $5 WHERE id = $6`,
          [updated.name, updated.department, updated.leadId || null, updated.capacityHrs, updated.updatedAt, id]
        );
        if (!res.rowCount) return false;
        if (updates.members) {
          await query('DELETE FROM team_members WHERE team_id = $1', [id]);
          for (const member of updates.members) await writeMember(id, member);
        }
        return true;
      });
      return changed ? this.findById(id) : null;
    }
    memoryTeams.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    // Sprint 24: the database's row count is the result in PostgreSQL mode (members cascade).
    if (isDbConnected()) {
      const res = await query('DELETE FROM teams WHERE id = $1', [id]);
      return !!res.rowCount;
    }
    return memoryTeams.delete(id);
  },

  async addMember(teamId: string, member: TeamMember): Promise<Team | null> {
    const team = await this.findById(teamId);
    if (!team) return null;

    if (isDbConnected()) {
      await writeMember(teamId, member);
      return this.findById(teamId);
    }

    const members = team.members ? [...team.members] : [];
    const existsIdx = members.findIndex((m) => m.userId === member.userId);
    if (existsIdx >= 0) {
      members[existsIdx] = member;
    } else {
      members.push(member);
    }

    return this.update(teamId, { members, memberCount: members.length });
  },

  async removeMember(teamId: string, userId: string): Promise<Team | null> {
    const team = await this.findById(teamId);
    if (!team) return null;

    if (isDbConnected()) {
      await query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
      return this.findById(teamId);
    }

    const members = (team.members || []).filter((m) => m.userId !== userId);
    return this.update(teamId, { members, memberCount: members.length });
  },
};
