import { Team, TeamMember } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryTeams: Map<string, Team> = new Map();

function seedDefaultTeams() {
  if (memoryTeams.size > 0) return;
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

export const TeamRepository = {
  async findAll(): Promise<Team[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM teams ORDER BY name ASC');
      return res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        department: r.department,
        leadId: r.lead_id,
        capacityHrs: parseFloat(r.capacity_hrs || '0'),
        memberCount: parseInt(r.member_count || '1', 10),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }
    return Array.from(memoryTeams.values());
  },

  async findById(id: string): Promise<Team | null> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM teams WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        name: r.name,
        department: r.department,
        leadId: r.lead_id,
        capacityHrs: parseFloat(r.capacity_hrs || '0'),
        memberCount: parseInt(r.member_count || '1', 10),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }
    return memoryTeams.get(id) || null;
  },

  async create(teamData: Partial<Team>): Promise<Team> {
    const id = teamData.id || `team_${Date.now()}`;
    const now = new Date().toISOString();

    const newTeam: Team = {
      id,
      name: teamData.name || 'Untitled Team',
      department: teamData.department || 'Engineering',
      leadId: teamData.leadId || 'usr_admin_1',
      leadName: teamData.leadName || 'Surya Prashanth',
      capacityHrs: teamData.capacityHrs || 160,
      allocatedHrs: teamData.allocatedHrs || 0,
      memberCount: teamData.members ? teamData.members.length : 1,
      members: teamData.members || [],
      createdAt: now,
      updatedAt: now,
    };

    if (isDbConnected()) {
      await query(
        `INSERT INTO teams (id, name, department, lead_id, capacity_hrs, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newTeam.id, newTeam.name, newTeam.department, newTeam.leadId || null, newTeam.capacityHrs, newTeam.createdAt, newTeam.updatedAt]
      );
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
      await query(
        `UPDATE teams SET name = $1, department = $2, lead_id = $3, capacity_hrs = $4, updated_at = $5 WHERE id = $6`,
        [updated.name, updated.department, updated.leadId || null, updated.capacityHrs, updated.updatedAt, id]
      );
    }
    memoryTeams.set(id, updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    if (isDbConnected()) {
      await query('DELETE FROM teams WHERE id = $1', [id]);
    }
    return memoryTeams.delete(id);
  },

  async addMember(teamId: string, member: TeamMember): Promise<Team | null> {
    const team = await this.findById(teamId);
    if (!team) return null;

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

    const members = (team.members || []).filter((m) => m.userId !== userId);
    return this.update(teamId, { members, memberCount: members.length });
  },
};
