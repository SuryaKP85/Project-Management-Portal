import { Dependency } from '../models/types';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { ActivityService } from './activityService';
import { NotificationService } from './notificationService';

export interface DependencyGraphNode {
  id: string;
  code: string;
  name: string;
  type: string;
  isCritical: boolean;
  isOverdue: boolean;
}

export interface DependencyGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  status: string;
}

export const DependencyService = {
  async getAllDependencies(filter?: {
    entityId?: string;
    entityType?: string;
    dependencyType?: string;
    status?: string;
    isOverdue?: boolean;
    isCritical?: boolean;
    search?: string;
  }): Promise<Dependency[]> {
    return DependencyRepository.findAll(filter);
  },

  async getDependencyById(id: string): Promise<Dependency | null> {
    return DependencyRepository.findById(id);
  },

  async getDependencyChain(entityId: string): Promise<{
    blockingThisItem: Dependency[];
    thisItemBlocks: Dependency[];
  }> {
    return DependencyRepository.getDependencyChain(entityId);
  },

  async createDependency(
    data: Partial<Dependency>,
    actor?: { id: string; name: string }
  ): Promise<{ dependency?: Dependency; error?: string }> {
    const res = await DependencyRepository.create({
      ...data,
      createdBy: actor?.id || 'usr_admin_1',
      updatedBy: actor?.id || 'usr_admin_1',
    });

    if (res.error) {
      return res;
    }

    const dep = res.dependency!;

    await ActivityService.logActivity({
      entityType: 'dependency',
      entityId: dep.id,
      action: 'created',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: dep.code,
        source: dep.sourceEntityName,
        target: dep.targetEntityName,
        type: dep.dependencyType,
        status: dep.status,
      },
    });

    // Notify if dependency is blocking or critical
    if (dep.dependencyType === 'Blocks' || dep.status === 'At Risk') {
      await NotificationService.sendNotification({
        userId: dep.ownerId || 'usr_admin_1',
        title: `Blocking Dependency Linked: [${dep.code}]`,
        message: `"${dep.sourceEntityName}" blocks "${dep.targetEntityName}".`,
        type: 'DEPENDENCY_BLOCKED',
        link: `/pm-portal/index.html?view=governance&tab=dependencies&id=${dep.id}`,
        isRead: false,
      });
    }

    return { dependency: dep };
  },

  async updateDependency(
    id: string,
    updates: Partial<Dependency>,
    actor?: { id: string; name: string }
  ): Promise<{ dependency?: Dependency; error?: string }> {
    const current = await DependencyRepository.findById(id);
    if (!current) return { error: 'Dependency not found' };

    const res = await DependencyRepository.update(id, {
      ...updates,
      updatedBy: actor?.id || 'usr_admin_1',
    });

    if (res.error) return res;
    const updated = res.dependency!;

    let action: any = 'updated';
    if (updates.status === 'Resolved') action = 'resolved';
    if (updates.status === 'At Risk' || (updates.dependencyType === 'Blocks' && current.dependencyType !== 'Blocks')) {
      action = 'blocked';
    }

    await ActivityService.logActivity({
      entityType: 'dependency',
      entityId: updated.id,
      action,
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: updated.code,
        previousStatus: current.status,
        newStatus: updated.status,
      },
    });

    if (updated.status === 'At Risk' && current.status !== 'At Risk') {
      await NotificationService.sendNotification({
        userId: updated.ownerId || 'usr_admin_1',
        title: `Dependency At Risk: [${updated.code}]`,
        message: `Cross-team dependency between "${updated.sourceEntityName}" and "${updated.targetEntityName}" flagged at risk.`,
        type: 'DEPENDENCY_BLOCKED',
        link: `/pm-portal/index.html?view=governance&tab=dependencies&id=${updated.id}`,
        isRead: false,
      });
    }

    return { dependency: updated };
  },

  async deleteDependency(id: string, actor?: { id: string; name: string }): Promise<boolean> {
    const current = await DependencyRepository.findById(id);
    if (!current) return false;

    const deleted = await DependencyRepository.delete(id);
    if (deleted) {
      await ActivityService.logActivity({
        entityType: 'dependency',
        entityId: id,
        action: 'deleted',
        actorId: actor?.id || 'usr_admin_1',
        actorName: actor?.name || 'Admin User',
        details: { code: current.code, source: current.sourceEntityName, target: current.targetEntityName },
      });
    }
    return deleted;
  },

  async getDependencyGraph(filter?: { search?: string }): Promise<{
    nodes: DependencyGraphNode[];
    edges: DependencyGraphEdge[];
    criticalCount: number;
    overdueCount: number;
  }> {
    const deps = await DependencyRepository.findAll(filter);
    const nodeMap = new Map<string, DependencyGraphNode>();
    const edges: DependencyGraphEdge[] = [];

    let criticalCount = 0;
    let overdueCount = 0;

    for (const d of deps) {
      if (d.isCritical) criticalCount++;
      if (d.isOverdue) overdueCount++;

      if (!nodeMap.has(d.sourceEntityId)) {
        nodeMap.set(d.sourceEntityId, {
          id: d.sourceEntityId,
          code: d.sourceEntityCode || d.sourceEntityId,
          name: d.sourceEntityName,
          type: d.sourceEntityType,
          isCritical: d.isCritical,
          isOverdue: d.isOverdue,
        });
      }

      if (!nodeMap.has(d.targetEntityId)) {
        nodeMap.set(d.targetEntityId, {
          id: d.targetEntityId,
          code: d.targetEntityCode || d.targetEntityId,
          name: d.targetEntityName,
          type: d.targetEntityType,
          isCritical: d.isCritical,
          isOverdue: d.isOverdue,
        });
      }

      edges.push({
        id: d.id,
        source: d.sourceEntityId,
        target: d.targetEntityId,
        type: d.dependencyType,
        status: d.status,
      });
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges,
      criticalCount,
      overdueCount,
    };
  },
};
