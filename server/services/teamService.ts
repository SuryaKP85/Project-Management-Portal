import { TeamRepository } from '../repositories/teamRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { NotificationRepository } from '../repositories/notificationRepository';
import { SafeUser, Team, TeamMember } from '../models/types';
import crypto from 'crypto';

export const TeamService = {
  async getAllTeams(): Promise<Team[]> {
    return TeamRepository.findAll();
  },

  async getTeamById(id: string): Promise<Team | null> {
    return TeamRepository.findById(id);
  },

  async createTeam(data: Partial<Team>, actorUser?: SafeUser): Promise<Team> {
    const newTeam: Partial<Team> = {
      ...data,
      id: data.id || `team_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    };

    const created = await TeamRepository.create(newTeam);

    if (actorUser) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'team',
        entityId: created.id,
        action: 'create',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { name: created.name, department: created.department, capacityHrs: created.capacityHrs },
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updateTeam(id: string, updates: Partial<Team>, actorUser?: SafeUser): Promise<Team | null> {
    const existing = await TeamRepository.findById(id);
    if (!existing) return null;

    const updated = await TeamRepository.update(id, updates);
    if (updated && actorUser) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'team',
        entityId: id,
        action: 'update',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: updates,
        createdAt: new Date().toISOString(),
      });
    }
    return updated;
  },

  async deleteTeam(id: string, actorUser?: SafeUser): Promise<boolean> {
    const existing = await TeamRepository.findById(id);
    if (!existing) return false;

    const success = await TeamRepository.delete(id);
    if (success && actorUser) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'team',
        entityId: id,
        action: 'delete',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { name: existing.name },
        createdAt: new Date().toISOString(),
      });
    }
    return success;
  },

  async addMember(teamId: string, member: TeamMember, actorUser?: SafeUser): Promise<Team | null> {
    const team = await TeamRepository.addMember(teamId, member);
    if (team && actorUser) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'team',
        entityId: teamId,
        action: 'member_change',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { action: 'add_member', memberName: member.userName, roleInTeam: member.roleInTeam },
        createdAt: new Date().toISOString(),
      });

      if (member.userId) {
        await NotificationRepository.create({
          id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: member.userId,
          title: 'Team Assignment',
          message: `You have been added to team ${team.name} as ${member.roleInTeam}.`,
          type: 'team_change',
          isRead: false,
          link: `/PM-Portal/index.html#resource-planner`,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return team;
  },

  async removeMember(teamId: string, userId: string, actorUser?: SafeUser): Promise<Team | null> {
    const team = await TeamRepository.removeMember(teamId, userId);
    if (team && actorUser) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'team',
        entityId: teamId,
        action: 'member_change',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { action: 'remove_member', userId },
        createdAt: new Date().toISOString(),
      });
    }
    return team;
  },
};
