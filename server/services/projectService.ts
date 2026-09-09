import { ProjectRepository } from '../repositories/projectRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { NotificationRepository } from '../repositories/notificationRepository';
import { Project, SafeUser } from '../models/types';
import crypto from 'crypto';

export const ProjectService = {
  async getAllProjects(): Promise<Project[]> {
    return ProjectRepository.findAll();
  },

  async getProjectById(id: string): Promise<Project | null> {
    return ProjectRepository.findById(id);
  },

  async createProject(data: Partial<Project>, actorUser: SafeUser): Promise<Project> {
    const newProject: Partial<Project> = {
      ...data,
      id: data.id || data.code || `PRJ-${Date.now().toString().slice(-4)}`,
      code: data.code || data.id || `PRJ-${Date.now().toString().slice(-4)}`,
    };

    const created = await ProjectRepository.create(newProject);

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'project',
      entityId: created.id,
      action: 'create',
      actorId: actorUser.id,
      actorName: `${actorUser.firstName} ${actorUser.lastName}`,
      details: {
        code: created.code,
        name: created.name,
        client: created.client,
        budget: created.budget,
        productId: created.productId,
        teamId: created.teamId,
      },
      createdAt: new Date().toISOString(),
    });

    if (created.managerId && created.managerId !== actorUser.id) {
      await NotificationRepository.create({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: created.managerId,
        title: 'Project Assignment',
        message: `You have been assigned as the Project Manager for ${created.name}.`,
        type: 'task_assigned',
        isRead: false,
        link: `/PM-Portal/index.html#projects`,
        createdAt: new Date().toISOString(),
      });
    }

    return created;
  },

  async updateProject(id: string, updates: Partial<Project>, actorUser: SafeUser): Promise<Project | null> {
    const existing = await ProjectRepository.findById(id);
    if (!existing) return null;

    const updated = await ProjectRepository.update(id, updates);
    if (updated) {
      const isStatusChange = updates.status && updates.status !== existing.status;
      const isOwnerChange = updates.managerId && updates.managerId !== existing.managerId;
      const isTeamChange = updates.teamId && updates.teamId !== existing.teamId;

      let action = 'update';
      if (isStatusChange) action = 'status_change';
      else if (isOwnerChange) action = 'owner_change';
      else if (isTeamChange) action = 'member_change';

      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'project',
        entityId: id,
        action: action as any,
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { previousStatus: existing.status, ...updates },
        createdAt: new Date().toISOString(),
      });

      // If owner changed, notify new owner
      if (isOwnerChange && updates.managerId && updates.managerId !== actorUser.id) {
        await NotificationRepository.create({
          id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: updates.managerId,
          title: 'Project Ownership Transferred',
          message: `You have been assigned as owner/manager of project ${updated.name}.`,
          type: 'ownership_change',
          isRead: false,
          link: `/PM-Portal/index.html#projects`,
          createdAt: new Date().toISOString(),
        });
      }

      // If Critical risk triggered, alert PM
      if (updates.risk === 'Critical' && existing.risk !== 'Critical') {
        if (existing.managerId) {
          await NotificationRepository.create({
            id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            userId: existing.managerId,
            title: 'Critical Risk Alert',
            message: `Project ${existing.name} risk level escalated to Critical.`,
            type: 'risk_alert',
            isRead: false,
            link: `/PM-Portal/index.html#projects`,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // If completed or milestone reached
      if (updates.status === 'completed' && existing.status !== 'completed') {
        if (existing.managerId) {
          await NotificationRepository.create({
            id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            userId: existing.managerId,
            title: 'Project Completed',
            message: `Project ${existing.name} has been marked as completed!`,
            type: 'milestone_alert',
            isRead: false,
            link: `/PM-Portal/index.html#projects`,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
    return updated;
  },

  async deleteProject(id: string, actorUser: SafeUser): Promise<boolean> {
    const existing = await ProjectRepository.findById(id);
    if (!existing) return false;

    const success = await ProjectRepository.delete(id);
    if (success) {
      await ActivityRepository.create({
        id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        entityType: 'project',
        entityId: id,
        action: 'delete',
        actorId: actorUser.id,
        actorName: `${actorUser.firstName} ${actorUser.lastName}`,
        details: { name: existing.name, code: existing.code },
        createdAt: new Date().toISOString(),
      });
    }
    return success;
  },

  async migrateLocalProjects(
    projects: Partial<Project>[],
    actorUser: SafeUser
  ): Promise<{ total: number; imported: number; skipped: number; projects: Project[] }> {
    const result = await ProjectRepository.migrateFromLocal(projects);

    await ActivityRepository.create({
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      entityType: 'project',
      entityId: 'batch_migration',
      action: 'migrate',
      actorId: actorUser.id,
      actorName: `${actorUser.firstName} ${actorUser.lastName}`,
      details: {
        totalReceived: result.total,
        importedCount: result.imported,
        skippedCount: result.skipped,
      },
      createdAt: new Date().toISOString(),
    });

    return result;
  },
};
