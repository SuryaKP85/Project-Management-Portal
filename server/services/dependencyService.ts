import {
  Dependency,
  DependencyEntityType,
  DependencyStatus,
  DependencyType,
  DependencyCriticality,
} from '../models/types';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { ActivityService } from './activityService';
import { NotificationService } from './notificationService';
import { PortfolioRepository } from '../repositories/portfolioRepository';
import { ProductRepository } from '../repositories/productRepository';
import { ProjectRepository } from '../repositories/projectRepository';
import { EpicRepository } from '../repositories/epicRepository';
import { FeatureRepository } from '../repositories/featureRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';
import { SubtaskRepository } from '../repositories/subtaskRepository';
import { SprintRepository } from '../repositories/sprintRepository';
import { RiskRepository } from '../repositories/riskRepository';
import { IssueRepository } from '../repositories/issueRepository';
import { MilestoneRepository } from '../repositories/milestoneRepository';
import { ReleaseRepository } from '../repositories/releaseRepository';
import { UserRepository } from '../repositories/userRepository';

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
  criticality: string;
}

export const VALID_ENTITY_TYPES: DependencyEntityType[] = [
  'portfolio',
  'product',
  'project',
  'epic',
  'feature',
  'story',
  'task',
  'subtask',
  'sprint',
  'risk',
  'issue',
  'milestone',
  'release',
];

export const VALID_DEPENDENCY_TYPES: DependencyType[] = [
  'Blocks',
  'Blocked By',
  'Depends On',
  'Required By',
  'Related To',
  'Predecessor',
  'Successor',
  'External',
];

export const VALID_STATUSES: DependencyStatus[] = [
  'Open',
  'In Progress',
  'At Risk',
  'Blocked',
  'Resolved',
  'Closed',
  'Cancelled',
];

export const VALID_CRITICALITIES: DependencyCriticality[] = [
  'Low',
  'Medium',
  'High',
  'Critical',
];

async function resolveEntity(
  type: string,
  id: string,
  fallbackName?: string,
  fallbackCode?: string
): Promise<{ exists: boolean; name: string; code?: string; projectId?: string }> {
  const normType = type.toLowerCase() as DependencyEntityType;

  switch (normType) {
    case 'portfolio': {
      let p = await PortfolioRepository.findById(id);
      if (!p) {
        const all = await PortfolioRepository.findAll();
        p = all.find((item) => item.code === id || item.id === id) || null;
      }
      if (p) return { exists: true, name: p.name, code: p.code };
      break;
    }
    case 'product': {
      let prod = await ProductRepository.findById(id);
      if (!prod) {
        const all = await ProductRepository.findAll();
        prod = all.find((item) => item.code === id || item.id === id) || null;
      }
      if (prod) return { exists: true, name: prod.name, code: prod.code };
      break;
    }
    case 'project': {
      let proj = await ProjectRepository.findById(id);
      if (!proj) {
        const all = await ProjectRepository.findAll();
        proj = all.find((p) => p.code === id || p.id === id) || null;
      }
      if (proj) return { exists: true, name: proj.name, code: proj.code, projectId: proj.id };
      break;
    }
    case 'epic': {
      let epic = await EpicRepository.findById(id);
      if (!epic) {
        const all = await EpicRepository.findAll();
        epic = all.find((e) => e.code === id || e.id === id) || null;
      }
      if (epic) return { exists: true, name: (epic as any).title || epic.name, code: epic.code, projectId: epic.projectId };
      break;
    }
    case 'feature': {
      let feat = await FeatureRepository.findById(id);
      if (!feat) {
        const all = await FeatureRepository.findAll();
        feat = all.find((f) => f.code === id || f.id === id) || null;
      }
      if (feat) return { exists: true, name: (feat as any).title || feat.name, code: feat.code, projectId: feat.projectId };
      break;
    }
    case 'story': {
      let story = await StoryRepository.findById(id);
      if (!story) {
        const all = await StoryRepository.findAll();
        story = all.find((s) => s.code === id || s.id === id) || null;
      }
      if (story) return { exists: true, name: story.title, code: story.code, projectId: story.projectId };
      break;
    }
    case 'task': {
      let task = await TaskRepository.findById(id);
      if (!task) {
        const all = await TaskRepository.findAll();
        task = all.find((t) => t.code === id || t.id === id) || null;
      }
      if (task) return { exists: true, name: task.title, code: task.code, projectId: task.projectId };
      break;
    }
    case 'subtask': {
      let subtask = await SubtaskRepository.findById(id);
      if (!subtask) {
        const all = await SubtaskRepository.findAll();
        subtask = all.find((s) => s.code === id || s.id === id) || null;
      }
      if (subtask) return { exists: true, name: subtask.title, code: subtask.code, projectId: subtask.projectId };
      break;
    }
    case 'sprint': {
      let sprint = await SprintRepository.findById(id);
      if (!sprint) {
        const all = await SprintRepository.findAll();
        sprint = all.find((s) => s.code === id || s.id === id) || null;
      }
      if (sprint) return { exists: true, name: sprint.name, code: sprint.code, projectId: sprint.projectId };
      break;
    }
    case 'risk': {
      let risk = await RiskRepository.findById(id);
      if (!risk) {
        const all = await RiskRepository.findAll();
        risk = all.find((r) => r.code === id || r.id === id) || null;
      }
      if (risk) return { exists: true, name: risk.title, code: risk.code, projectId: risk.projectId };
      break;
    }
    case 'issue': {
      let issue = await IssueRepository.findById(id);
      if (!issue) {
        const all = await IssueRepository.findAll();
        issue = all.find((i) => i.code === id || i.id === id) || null;
      }
      if (issue) return { exists: true, name: issue.title, code: issue.code, projectId: issue.projectId };
      break;
    }
    case 'milestone': {
      let mls = await MilestoneRepository.findById(id);
      if (!mls) {
        const all = await MilestoneRepository.findAll();
        mls = all.find((m) => m.code === id || m.id === id) || null;
      }
      if (mls) return { exists: true, name: mls.name, code: mls.code, projectId: mls.projectId };
      break;
    }
    case 'release': {
      let rel = await ReleaseRepository.findById(id);
      if (!rel) {
        const all = await ReleaseRepository.findAll();
        rel = all.find((r) => r.code === id || r.id === id) || null;
      }
      if (rel) return { exists: true, name: rel.name, code: rel.code, projectId: rel.projectId };
      break;
    }
    default:
      break;
  }

  if (fallbackName) {
    return { exists: true, name: fallbackName, code: fallbackCode || id };
  }
  return { exists: false, name: '' };
}

export const DependencyService = {
  async getAllDependencies(filter?: {
    projectId?: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    targetEntityType?: string;
    targetEntityId?: string;
    entityId?: string;
    entityType?: string;
    dependencyType?: string;
    status?: string;
    criticality?: string;
    ownerId?: string;
    search?: string;
    page?: number;
    limit?: number;
    isOverdue?: boolean;
    isCritical?: boolean;
  }): Promise<{ dependencies: Dependency[]; total: number; page?: number; limit?: number }> {
    const dependencies = await DependencyRepository.findAll(filter);
    const total = await DependencyRepository.count(filter);
    return {
      dependencies,
      total,
      page: filter?.page ? Number(filter.page) : undefined,
      limit: filter?.limit ? Number(filter.limit) : undefined,
    };
  },

  async getDependencies(filter?: {
    projectId?: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    targetEntityType?: string;
    targetEntityId?: string;
    entityId?: string;
    entityType?: string;
    dependencyType?: string;
    status?: string;
    criticality?: string;
    ownerId?: string;
    search?: string;
    isOverdue?: boolean;
    isCritical?: boolean;
  }): Promise<Dependency[]> {
    return DependencyRepository.findAll(filter);
  },

  async getDependencyById(id: string): Promise<Dependency | null> {
    return DependencyRepository.findById(id);
  },

  async getDependenciesByEntity(entityType: string, entityId: string): Promise<Dependency[]> {
    return DependencyRepository.findByEntity(entityType, entityId);
  },

  async getDependenciesByProject(projectId: string): Promise<Dependency[]> {
    return DependencyRepository.findByProject(projectId);
  },

  async getDependencyChain(entityId: string): Promise<{
    blockingThisItem: Dependency[];
    thisItemBlocks: Dependency[];
  }> {
    return DependencyRepository.getDependencyChain(entityId);
  },

  async getChain(entityId: string): Promise<{
    blockingThisItem: Dependency[];
    thisItemBlocks: Dependency[];
  }> {
    return DependencyRepository.getDependencyChain(entityId);
  },

  async createDependency(
    data: Partial<Dependency>,
    actor?: { id: string; name: string }
  ): Promise<Dependency> {
    // 1. Validate required entity identifiers
    if (!data.sourceEntityType || !data.sourceEntityId) {
      throw new Error('Source entity type and ID are required');
    }
    if (!data.targetEntityType || !data.targetEntityId) {
      throw new Error('Target entity type and ID are required');
    }

    const normSourceType = data.sourceEntityType.toLowerCase() as DependencyEntityType;
    const normTargetType = data.targetEntityType.toLowerCase() as DependencyEntityType;

    if (!VALID_ENTITY_TYPES.includes(normSourceType)) {
      throw new Error(`Invalid source entity type: "${data.sourceEntityType}". Supported types: ${VALID_ENTITY_TYPES.join(', ')}`);
    }
    if (!VALID_ENTITY_TYPES.includes(normTargetType)) {
      throw new Error(`Invalid target entity type: "${data.targetEntityType}". Supported types: ${VALID_ENTITY_TYPES.join(', ')}`);
    }

    // 2. Self-dependency protection
    if (normSourceType === normTargetType && data.sourceEntityId === data.targetEntityId) {
      throw new Error('Self-dependency is not allowed: An entity cannot depend on itself');
    }

    // 3. Validate entity existence
    const sourceInfo = await resolveEntity(normSourceType, data.sourceEntityId, data.sourceEntityName, data.sourceEntityCode);
    if (!sourceInfo.exists) {
      throw new Error(`Invalid source entity: ${data.sourceEntityType} with ID "${data.sourceEntityId}" does not exist`);
    }

    const targetInfo = await resolveEntity(normTargetType, data.targetEntityId, data.targetEntityName, data.targetEntityCode);
    if (!targetInfo.exists) {
      throw new Error(`Invalid target entity: ${data.targetEntityType} with ID "${data.targetEntityId}" does not exist`);
    }

    // 4. Validate dependency type
    const depType = (data.dependencyType || 'Blocks') as DependencyType;
    if (!VALID_DEPENDENCY_TYPES.map((t) => t.toLowerCase()).includes(depType.toLowerCase())) {
      throw new Error(`Invalid dependency type: "${data.dependencyType}". Supported types: ${VALID_DEPENDENCY_TYPES.join(', ')}`);
    }
    // Match canonical casing
    const canonicalDepType = VALID_DEPENDENCY_TYPES.find((t) => t.toLowerCase() === depType.toLowerCase()) || 'Blocks';

    // 5. Validate status
    const status = (data.status || 'Open') as DependencyStatus;
    if (!VALID_STATUSES.map((s) => s.toLowerCase()).includes(status.toLowerCase())) {
      throw new Error(`Invalid status: "${data.status}". Supported statuses: ${VALID_STATUSES.join(', ')}`);
    }
    const canonicalStatus = VALID_STATUSES.find((s) => s.toLowerCase() === status.toLowerCase()) || 'Open';

    // 6. Validate criticality
    let criticality = (data.criticality || 'Medium') as DependencyCriticality;
    if (!VALID_CRITICALITIES.map((c) => c.toLowerCase()).includes(criticality.toLowerCase())) {
      throw new Error(`Invalid criticality: "${data.criticality}". Supported values: ${VALID_CRITICALITIES.join(', ')}`);
    }
    criticality = VALID_CRITICALITIES.find((c) => c.toLowerCase() === criticality.toLowerCase()) || 'Medium';

    // 7. Validate owner
    let ownerName = data.ownerName;
    if (data.ownerId) {
      const user = await UserRepository.findById(data.ownerId);
      if (!user) {
        throw new Error(`Invalid owner: User with ID "${data.ownerId}" does not exist`);
      }
      ownerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email;
    }

    const projectId = data.projectId || sourceInfo.projectId || targetInfo.projectId;

    const payload: Partial<Dependency> = {
      ...data,
      sourceEntityType: normSourceType,
      sourceEntityName: data.sourceEntityName || sourceInfo.name,
      sourceEntityCode: data.sourceEntityCode || sourceInfo.code,
      targetEntityType: normTargetType,
      targetEntityName: data.targetEntityName || targetInfo.name,
      targetEntityCode: data.targetEntityCode || targetInfo.code,
      dependencyType: canonicalDepType,
      status: canonicalStatus,
      criticality,
      ownerId: data.ownerId,
      ownerName,
      projectId,
      createdBy: actor?.id || 'usr_admin_1',
      updatedBy: actor?.id || 'usr_admin_1',
    };

    const res = await DependencyRepository.create(payload);
    if (res.error) {
      throw new Error(res.error);
    }

    const dep = res.dependency!;

    // Log Activity
    await ActivityService.logActivity({
      entityType: 'dependency',
      entityId: dep.id,
      action: 'create',
      actorId: actor?.id || 'usr_admin_1',
      actorName: actor?.name || 'Admin User',
      details: {
        code: dep.code,
        source: dep.sourceEntityName,
        target: dep.targetEntityName,
        type: dep.dependencyType,
        status: dep.status,
        criticality: dep.criticality,
      },
    });

    // Notifications
    const recipient = dep.ownerId || actor?.id || 'usr_admin_1';

    if (dep.criticality === 'Critical') {
      await NotificationService.sendNotification({
        userId: recipient,
        title: `Critical Dependency Linked: [${dep.code}]`,
        message: `High-impact dependency established between "${dep.sourceEntityName}" and "${dep.targetEntityName}".`,
        type: 'dependency_critical',
        link: `/pm-portal/index.html?view=governance&tab=dependencies&id=${dep.id}`,
        isRead: false,
      });
    } else if (dep.status === 'Blocked' || dep.status === 'At Risk' || dep.dependencyType === 'Blocks') {
      await NotificationService.sendNotification({
        userId: recipient,
        title: `Blocking Dependency Linked: [${dep.code}]`,
        message: `"${dep.sourceEntityName}" blocks "${dep.targetEntityName}".`,
        type: 'dependency_blocked',
        link: `/pm-portal/index.html?view=governance&tab=dependencies&id=${dep.id}`,
        isRead: false,
      });
    }

    if (dep.ownerId && dep.ownerId !== actor?.id) {
      await NotificationService.sendNotification({
        userId: dep.ownerId,
        title: `Dependency Assigned: [${dep.code}]`,
        message: `You were assigned as owner of dependency [${dep.code}] (${dep.sourceEntityName} -> ${dep.targetEntityName}).`,
        type: 'dependency_assigned',
        link: `/pm-portal/index.html?view=governance&tab=dependencies&id=${dep.id}`,
        isRead: false,
      });
    }

    return dep;
  },

  async updateDependency(
    id: string,
    updates: Partial<Dependency>,
    actor?: { id: string; name: string }
  ): Promise<Dependency> {
    const current = await DependencyRepository.findById(id);
    if (!current) throw new Error('Dependency not found');

    // 1. Entity type validation if supplied
    if (updates.sourceEntityType) {
      const norm = updates.sourceEntityType.toLowerCase() as DependencyEntityType;
      if (!VALID_ENTITY_TYPES.includes(norm)) {
        throw new Error(`Invalid source entity type: "${updates.sourceEntityType}". Supported types: ${VALID_ENTITY_TYPES.join(', ')}`);
      }
      updates.sourceEntityType = norm;
    }
    if (updates.targetEntityType) {
      const norm = updates.targetEntityType.toLowerCase() as DependencyEntityType;
      if (!VALID_ENTITY_TYPES.includes(norm)) {
        throw new Error(`Invalid target entity type: "${updates.targetEntityType}". Supported types: ${VALID_ENTITY_TYPES.join(', ')}`);
      }
      updates.targetEntityType = norm;
    }

    const nextSourceType = updates.sourceEntityType || current.sourceEntityType;
    const nextSourceId = updates.sourceEntityId || current.sourceEntityId;
    const nextTargetType = updates.targetEntityType || current.targetEntityType;
    const nextTargetId = updates.targetEntityId || current.targetEntityId;

    // 2. Self-dependency protection
    if (nextSourceType.toLowerCase() === nextTargetType.toLowerCase() && nextSourceId === nextTargetId) {
      throw new Error('Self-dependency is not allowed: An entity cannot depend on itself');
    }

    // 3. Validate entity existence if changed
    if (updates.sourceEntityId || updates.sourceEntityType) {
      const sourceInfo = await resolveEntity(nextSourceType, nextSourceId, updates.sourceEntityName, updates.sourceEntityCode);
      if (!sourceInfo.exists) {
        throw new Error(`Invalid source entity: ${nextSourceType} with ID "${nextSourceId}" does not exist`);
      }
      updates.sourceEntityName = updates.sourceEntityName || sourceInfo.name;
      updates.sourceEntityCode = updates.sourceEntityCode || sourceInfo.code;
    }
    if (updates.targetEntityId || updates.targetEntityType) {
      const targetInfo = await resolveEntity(nextTargetType, nextTargetId, updates.targetEntityName, updates.targetEntityCode);
      if (!targetInfo.exists) {
        throw new Error(`Invalid target entity: ${nextTargetType} with ID "${nextTargetId}" does not exist`);
      }
      updates.targetEntityName = updates.targetEntityName || targetInfo.name;
      updates.targetEntityCode = updates.targetEntityCode || targetInfo.code;
    }

    // 4. Validate dependency type
    if (updates.dependencyType) {
      const canonical = VALID_DEPENDENCY_TYPES.find((t) => t.toLowerCase() === updates.dependencyType!.toLowerCase());
      if (!canonical) {
        throw new Error(`Invalid dependency type: "${updates.dependencyType}". Supported types: ${VALID_DEPENDENCY_TYPES.join(', ')}`);
      }
      updates.dependencyType = canonical;
    }

    // 5. Validate status
    if (updates.status) {
      const canonical = VALID_STATUSES.find((s) => s.toLowerCase() === updates.status!.toLowerCase());
      if (!canonical) {
        throw new Error(`Invalid status: "${updates.status}". Supported statuses: ${VALID_STATUSES.join(', ')}`);
      }
      updates.status = canonical;
    }

    // 6. Validate criticality
    if (updates.criticality) {
      const canonical = VALID_CRITICALITIES.find((c) => c.toLowerCase() === updates.criticality!.toLowerCase());
      if (!canonical) {
        throw new Error(`Invalid criticality: "${updates.criticality}". Supported values: ${VALID_CRITICALITIES.join(', ')}`);
      }
      updates.criticality = canonical;
    }

    // 7. Validate owner
    if (updates.ownerId) {
      const user = await UserRepository.findById(updates.ownerId);
      if (!user) {
        throw new Error(`Invalid owner: User with ID "${updates.ownerId}" does not exist`);
      }
      updates.ownerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email;
    }

    const res = await DependencyRepository.update(id, {
      ...updates,
      updatedBy: actor?.id || 'usr_admin_1',
    });

    if (res.error) {
      throw new Error(res.error);
    }
    const updated = res.dependency!;

    // Determine activity action
    let action: any = 'update';
    if (updates.status && updates.status !== current.status) {
      action = updates.status === 'Resolved' || updates.status === 'Closed' ? 'resolve' : 'status_change';
    } else if (updates.criticality && updates.criticality !== current.criticality) {
      action = 'severity_change';
    } else if (updates.ownerId && updates.ownerId !== current.ownerId) {
      action = 'assign';
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
        previousCriticality: current.criticality,
        newCriticality: updated.criticality,
      },
    });

    // Dispatch notifications
    const recipient = updated.ownerId || actor?.id || 'usr_admin_1';

    if (updated.criticality === 'Critical' && current.criticality !== 'Critical') {
      await NotificationService.sendNotification({
        userId: recipient,
        title: `Dependency Escalated to Critical: [${updated.code}]`,
        message: `Dependency [${updated.code}] between "${updated.sourceEntityName}" and "${updated.targetEntityName}" marked Critical.`,
        type: 'dependency_critical',
        link: `/pm-portal/index.html?view=governance&tab=dependencies&id=${updated.id}`,
        isRead: false,
      });
    }

    if ((updated.status === 'Blocked' || updated.status === 'At Risk') && (current.status !== 'Blocked' && current.status !== 'At Risk')) {
      await NotificationService.sendNotification({
        userId: recipient,
        title: `Dependency Blocked Alert: [${updated.code}]`,
        message: `Dependency [${updated.code}] flagged as ${updated.status}. Action required.`,
        type: 'dependency_blocked',
        link: `/pm-portal/index.html?view=governance&tab=dependencies&id=${updated.id}`,
        isRead: false,
      });
    }

    if (updates.ownerId && updates.ownerId !== current.ownerId) {
      await NotificationService.sendNotification({
        userId: updates.ownerId,
        title: `Dependency Assigned: [${updated.code}]`,
        message: `You were assigned as owner of dependency [${updated.code}].`,
        type: 'dependency_assigned',
        link: `/pm-portal/index.html?view=governance&tab=dependencies&id=${updated.id}`,
        isRead: false,
      });
    }

    return updated;
  },

  async deleteDependency(id: string, actor?: { id: string; name: string }): Promise<boolean> {
    const current = await DependencyRepository.findById(id);
    if (!current) return false;

    const deleted = await DependencyRepository.delete(id);
    if (deleted) {
      await ActivityService.logActivity({
        entityType: 'dependency',
        entityId: id,
        action: 'delete',
        actorId: actor?.id || 'usr_admin_1',
        actorName: actor?.name || 'Admin User',
        details: { code: current.code, source: current.sourceEntityName, target: current.targetEntityName },
      });
    }
    return deleted;
  },

  async getDependencyGraph(filter?: { search?: string; projectId?: string }): Promise<{
    nodes: DependencyGraphNode[];
    edges: DependencyGraphEdge[];
    criticalCount: number;
    overdueCount: number;
    totalCount: number;
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
          isCritical: d.isCritical || false,
          isOverdue: d.isOverdue || false,
        });
      }

      if (!nodeMap.has(d.targetEntityId)) {
        nodeMap.set(d.targetEntityId, {
          id: d.targetEntityId,
          code: d.targetEntityCode || d.targetEntityId,
          name: d.targetEntityName,
          type: d.targetEntityType,
          isCritical: d.isCritical || false,
          isOverdue: d.isOverdue || false,
        });
      }

      edges.push({
        id: d.id,
        source: d.sourceEntityId,
        target: d.targetEntityId,
        type: d.dependencyType,
        status: d.status,
        criticality: d.criticality,
      });
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges,
      criticalCount,
      overdueCount,
      totalCount: deps.length,
    };
  },

  async getKPIs(projectId?: string): Promise<{
    total: number;
    critical: number;
    blocked: number;
    inProgress: number;
    resolved: number;
    overdue: number;
  }> {
    const all = await DependencyRepository.findAll(projectId ? { projectId } : undefined);
    const critical = all.filter((d) => d.criticality === 'Critical' || d.isCritical).length;
    const blocked = all.filter((d) => d.status === 'Blocked' || d.status === 'At Risk').length;
    const inProgress = all.filter((d) => d.status === 'In Progress' || d.status === 'Open').length;
    const resolved = all.filter((d) => d.status === 'Resolved' || d.status === 'Closed').length;
    const overdue = all.filter((d) => d.isOverdue).length;

    return {
      total: all.length,
      critical,
      blocked,
      inProgress,
      resolved,
      overdue,
    };
  },
};
