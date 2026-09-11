import { Dependency, DependencyEntityType, DependencyStatus, DependencyType, DependencyCriticality } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryDependencies: Map<string, Dependency> = new Map();

/**
 * Checks if adding or updating an active dependency edge creates a cycle in the directed dependency graph.
 */
export function wouldCreateCycle(
  sourceId: string,
  targetId: string,
  dependencyType: DependencyType,
  allDependencies: Dependency[],
  ignoreId?: string
): boolean {
  // If identical entity, immediately circular
  if (sourceId === targetId) return true;

  // We only check cycles for directional blocking/depending/predecessor relationships
  const isDirectional =
    dependencyType === 'Blocks' ||
    dependencyType === 'Depends On' ||
    dependencyType === 'Blocked By' ||
    dependencyType === 'Required By' ||
    dependencyType === 'Requires' ||
    dependencyType === 'Predecessor' ||
    dependencyType === 'Successor';

  if (!isDirectional) return false;

  // Standardize directional edge: From blocker/predecessor to blocked/successor
  // If A 'Blocks' B => A must happen before B, edge A -> B
  // If A 'Predecessor' B => edge A -> B
  // If A 'Required By' B => edge A -> B
  // If A 'Depends On' B => B must happen before A, edge B -> A
  // If A 'Requires' B => B must happen before A, edge B -> A
  // If A 'Blocked By' B => edge B -> A
  // If A 'Successor' B => edge B -> A
  let fromNode = sourceId;
  let toNode = targetId;
  if (
    dependencyType === 'Depends On' ||
    dependencyType === 'Blocked By' ||
    dependencyType === 'Requires' ||
    dependencyType === 'Successor'
  ) {
    fromNode = targetId;
    toNode = sourceId;
  }

  // If after mapping, fromNode and toNode are identical
  if (fromNode === toNode) return true;

  // Build adjacency list of active/blocking dependencies
  const adj = new Map<string, string[]>();
  for (const dep of allDependencies) {
    if (ignoreId && dep.id === ignoreId) continue;
    if (dep.status === 'Resolved' || dep.status === 'Closed' || dep.status === 'Cancelled') continue;

    let u = dep.sourceEntityId;
    let v = dep.targetEntityId;

    if (
      dep.dependencyType === 'Depends On' ||
      dep.dependencyType === 'Blocked By' ||
      dep.dependencyType === 'Requires' ||
      dep.dependencyType === 'Successor'
    ) {
      u = dep.targetEntityId;
      v = dep.sourceEntityId;
    } else if (
      dep.dependencyType !== 'Blocks' &&
      dep.dependencyType !== 'Required By' &&
      dep.dependencyType !== 'Predecessor'
    ) {
      // Non-directional (Related To, External) - skip cycle graph
      continue;
    }

    if (!adj.has(u)) adj.set(u, []);
    adj.get(u)!.push(v);
  }

  // Check if we can reach fromNode starting from toNode (which would complete a cycle if we add fromNode -> toNode)
  const visited = new Set<string>();
  const queue = [toNode];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === fromNode) return true;
    if (!visited.has(curr)) {
      visited.add(curr);
      const neighbors = adj.get(curr) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n);
      }
    }
  }

  return false;
}

/**
 * Checks for duplicate direct or inverse relationships
 */
export function isDuplicateRelationship(
  sourceId: string,
  sourceType: string,
  targetId: string,
  targetType: string,
  depType: string,
  allDependencies: Dependency[],
  ignoreId?: string
): boolean {
  const normSourceType = sourceType.toLowerCase();
  const normTargetType = targetType.toLowerCase();

  for (const dep of allDependencies) {
    if (ignoreId && dep.id === ignoreId) continue;

    const existingSrcType = dep.sourceEntityType.toLowerCase();
    const existingTgtType = dep.targetEntityType.toLowerCase();

    // Direct identical relationship
    if (
      dep.sourceEntityId === sourceId &&
      existingSrcType === normSourceType &&
      dep.targetEntityId === targetId &&
      existingTgtType === normTargetType &&
      dep.dependencyType.toLowerCase() === depType.toLowerCase()
    ) {
      return true;
    }

    // Inverse logical duplicates:
    // (A Blocks B) is equivalent to (B Blocked By A)
    // (A Depends On B) is equivalent to (B Required By A)
    // (A Predecessor B) is equivalent to (B Successor A)
    // (A Related To B) is equivalent to (B Related To A)
    const isDirectInversePair =
      (dep.sourceEntityId === targetId &&
        existingSrcType === normTargetType &&
        dep.targetEntityId === sourceId &&
        existingTgtType === normSourceType);

    if (isDirectInversePair) {
      const d1 = dep.dependencyType;
      const d2 = depType;
      if (
        (d1 === 'Blocks' && d2 === 'Blocked By') ||
        (d1 === 'Blocked By' && d2 === 'Blocks') ||
        (d1 === 'Depends On' && d2 === 'Required By') ||
        (d1 === 'Required By' && d2 === 'Depends On') ||
        (d1 === 'Predecessor' && d2 === 'Successor') ||
        (d1 === 'Successor' && d2 === 'Predecessor') ||
        (d1 === 'Related To' && d2 === 'Related To')
      ) {
        return true;
      }
    }
  }

  return false;
}

function seedDefaultDependencies() {
  if (memoryDependencies.size > 0) return;
  const defaults: Dependency[] = [
    {
      id: 'dep_1',
      code: 'DEP-101',
      sourceEntityId: 'feat_1',
      sourceEntityType: 'feature',
      sourceEntityName: 'Quaternion Inertial State Estimation',
      sourceEntityCode: 'FEAT-101',
      targetEntityId: 'feat_2',
      targetEntityType: 'feature',
      targetEntityName: 'Cryogenic Propellant Mass Flow Sensor Array',
      targetEntityCode: 'FEAT-102',
      dependencyType: 'Blocks',
      status: 'Open',
      criticality: 'High',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      projectId: 'PRJ-101',
      description: 'GN&C attitude determination filter required before telemetry valve calibration logic can fire.',
      targetDate: '2026-09-20',
      dueDate: '2026-09-20',
      isOverdue: false,
      isCritical: true,
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-09-01T12:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_admin_1',
    },
    {
      id: 'dep_2',
      code: 'DEP-102',
      sourceEntityId: 'task_1',
      sourceEntityType: 'task',
      sourceEntityName: 'Derive 6-DOF Quaternion Matrix Filter',
      sourceEntityCode: 'TSK-101',
      targetEntityId: 'task_2',
      targetEntityType: 'task',
      targetEntityName: 'Flash Microcode to Hardware Emulator',
      targetEntityCode: 'TSK-102',
      dependencyType: 'Blocks',
      status: 'In Progress',
      criticality: 'Critical',
      ownerId: 'usr_dev_1',
      ownerName: 'Sarah Chen',
      projectId: 'PRJ-101',
      description: 'Algorithm math verification must pass before flashing microcode to hardware bench.',
      targetDate: '2026-09-12',
      dueDate: '2026-09-12',
      isOverdue: false,
      isCritical: true,
      createdAt: '2026-08-05T09:00:00Z',
      updatedAt: '2026-09-05T09:00:00Z',
      createdBy: 'usr_dev_1',
      updatedBy: 'usr_dev_1',
    },
    {
      id: 'dep_3',
      code: 'DEP-103',
      sourceEntityId: 'PRJ-101',
      sourceEntityType: 'project',
      sourceEntityName: 'Ares Flight Control Firmware',
      sourceEntityCode: 'PRJ-101',
      targetEntityId: 'PRJ-104',
      targetEntityType: 'project',
      targetEntityName: 'Orbital Insertion Guidance OS',
      targetEntityCode: 'PRJ-104',
      dependencyType: 'Blocks',
      status: 'At Risk',
      criticality: 'Critical',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      projectId: 'PRJ-101',
      description: 'Stage 1 control firmware API telemetry protocol freeze needed for orbital OS staging handoff.',
      targetDate: '2026-09-05',
      dueDate: '2026-09-05',
      isOverdue: true,
      isCritical: true,
      createdAt: '2026-08-10T14:00:00Z',
      updatedAt: '2026-09-06T09:00:00Z',
      createdBy: 'usr_pm_2',
      updatedBy: 'usr_pm_2',
    },
    {
      id: 'dep_4',
      code: 'DEP-104',
      sourceEntityId: 'rel_1',
      sourceEntityType: 'release',
      sourceEntityName: 'Ares Flight OS v2.0-Alpha',
      sourceEntityCode: 'REL-101',
      targetEntityId: 'mls_1',
      targetEntityType: 'milestone',
      targetEntityName: 'Sub-Orbital Guidance Certification',
      targetEntityCode: 'MLS-101',
      dependencyType: 'Depends On',
      status: 'In Progress',
      criticality: 'Medium',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      projectId: 'PRJ-101',
      description: 'Release 2.0-Alpha deployment requires formal signoff of Milestone 101 safety envelope.',
      targetDate: '2026-10-15',
      dueDate: '2026-10-15',
      isOverdue: false,
      isCritical: false,
      createdAt: '2026-08-15T11:00:00Z',
      updatedAt: '2026-08-15T11:00:00Z',
      createdBy: 'usr_admin_1',
      updatedBy: 'usr_admin_1',
    },
  ];
  for (const d of defaults) {
    memoryDependencies.set(d.id, d);
  }
}

seedDefaultDependencies();

export const DependencyRepository = {
  async findAll(filter?: {
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
  }): Promise<Dependency[]> {
    seedDefaultDependencies();
    let deps: Dependency[] = [];

    const page = filter?.page && filter.page > 0 ? Number(filter.page) : undefined;
    const limit = filter?.limit && filter.limit > 0 ? Number(filter.limit) : undefined;
    const offset = page && limit ? (page - 1) * limit : 0;

    if (isDbConnected()) {
      try {
        let queryStr = `
          SELECT id, code, source_entity_id as "sourceEntityId",
                 source_entity_type as "sourceEntityType", source_entity_name as "sourceEntityName",
                 source_entity_code as "sourceEntityCode", target_entity_id as "targetEntityId",
                 target_entity_type as "targetEntityType", target_entity_name as "targetEntityName",
                 target_entity_code as "targetEntityCode", dependency_type as "dependencyType",
                 status, criticality, owner_id as "ownerId", project_id as "projectId",
                 description, target_date as "targetDate", due_date as "dueDate",
                 resolved_at as "resolvedAt", resolution_date as "resolutionDate",
                 created_by as "createdBy", updated_by as "updatedBy",
                 created_at as "createdAt", updated_at as "updatedAt"
          FROM dependencies
          WHERE 1=1
        `;
        const params: any[] = [];
        let pIndex = 1;

        if (filter?.projectId) {
          queryStr += ` AND (project_id = $${pIndex} OR source_entity_id = $${pIndex} OR target_entity_id = $${pIndex})`;
          params.push(filter.projectId);
          pIndex++;
        }
        if (filter?.entityId) {
          queryStr += ` AND (source_entity_id = $${pIndex} OR target_entity_id = $${pIndex})`;
          params.push(filter.entityId);
          pIndex++;
        }
        if (filter?.entityType) {
          queryStr += ` AND (source_entity_type ILIKE $${pIndex} OR target_entity_type ILIKE $${pIndex})`;
          params.push(filter.entityType);
          pIndex++;
        }
        if (filter?.sourceEntityId) {
          queryStr += ` AND source_entity_id = $${pIndex++}`;
          params.push(filter.sourceEntityId);
        }
        if (filter?.sourceEntityType) {
          queryStr += ` AND source_entity_type ILIKE $${pIndex++}`;
          params.push(filter.sourceEntityType);
        }
        if (filter?.targetEntityId) {
          queryStr += ` AND target_entity_id = $${pIndex++}`;
          params.push(filter.targetEntityId);
        }
        if (filter?.targetEntityType) {
          queryStr += ` AND target_entity_type ILIKE $${pIndex++}`;
          params.push(filter.targetEntityType);
        }
        if (filter?.dependencyType && filter.dependencyType !== 'all') {
          queryStr += ` AND dependency_type = $${pIndex++}`;
          params.push(filter.dependencyType);
        }
        if (filter?.status && filter.status !== 'all') {
          queryStr += ` AND status = $${pIndex++}`;
          params.push(filter.status);
        }
        if (filter?.criticality && filter.criticality !== 'all') {
          queryStr += ` AND criticality = $${pIndex++}`;
          params.push(filter.criticality);
        }
        if (filter?.ownerId) {
          queryStr += ` AND owner_id = $${pIndex++}`;
          params.push(filter.ownerId);
        }
        if (filter?.search) {
          queryStr += ` AND (source_entity_name ILIKE $${pIndex} OR target_entity_name ILIKE $${pIndex} OR code ILIKE $${pIndex} OR description ILIKE $${pIndex})`;
          params.push(`%${filter.search}%`);
          pIndex++;
        }

        queryStr += ` ORDER BY CASE criticality WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 ELSE 5 END, created_at DESC`;

        if (limit !== undefined) {
          queryStr += ` LIMIT $${pIndex++} OFFSET $${pIndex++}`;
          params.push(limit, offset);
        }

        const res = await query(queryStr, params);
        deps = res.rows;
      } catch (err) {
        console.warn('DB error in DependencyRepository.findAll, fallback to memory:', err);
        deps = Array.from(memoryDependencies.values());
      }
    } else {
      deps = Array.from(memoryDependencies.values());
    }

    if (!isDbConnected() && filter) {
      if (filter.projectId) {
        deps = deps.filter(
          (d) =>
            d.projectId === filter.projectId ||
            d.sourceEntityId === filter.projectId ||
            d.targetEntityId === filter.projectId
        );
      }
      if (filter.entityId) {
        deps = deps.filter((d) => d.sourceEntityId === filter.entityId || d.targetEntityId === filter.entityId);
      }
      if (filter.entityType) {
        deps = deps.filter(
          (d) =>
            d.sourceEntityType.toLowerCase() === filter.entityType!.toLowerCase() ||
            d.targetEntityType.toLowerCase() === filter.entityType!.toLowerCase()
        );
      }
      if (filter.sourceEntityId) {
        deps = deps.filter((d) => d.sourceEntityId === filter.sourceEntityId);
      }
      if (filter.sourceEntityType) {
        deps = deps.filter((d) => d.sourceEntityType.toLowerCase() === filter.sourceEntityType!.toLowerCase());
      }
      if (filter.targetEntityId) {
        deps = deps.filter((d) => d.targetEntityId === filter.targetEntityId);
      }
      if (filter.targetEntityType) {
        deps = deps.filter((d) => d.targetEntityType.toLowerCase() === filter.targetEntityType!.toLowerCase());
      }
      if (filter.status && filter.status !== 'all') {
        deps = deps.filter((d) => d.status.toLowerCase() === filter.status!.toLowerCase());
      }
      if (filter.criticality && filter.criticality !== 'all') {
        deps = deps.filter((d) => d.criticality.toLowerCase() === filter.criticality!.toLowerCase());
      }
      if (filter.dependencyType && filter.dependencyType !== 'all') {
        deps = deps.filter((d) => d.dependencyType.toLowerCase() === filter.dependencyType!.toLowerCase());
      }
      if (filter.ownerId) {
        deps = deps.filter((d) => d.ownerId === filter.ownerId);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        deps = deps.filter(
          (d) =>
            d.sourceEntityName.toLowerCase().includes(q) ||
            d.targetEntityName.toLowerCase().includes(q) ||
            d.code.toLowerCase().includes(q) ||
            (d.description && d.description.toLowerCase().includes(q))
        );
      }

      const critOrder: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
      deps.sort((a, b) => (critOrder[a.criticality?.toLowerCase()] || 5) - (critOrder[b.criticality?.toLowerCase()] || 5));

      if (limit !== undefined) {
        deps = deps.slice(offset, offset + limit);
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    return deps.map((d) => {
      const dateToCheck = d.targetDate || d.dueDate;
      const isOverdue = !!(dateToCheck && dateToCheck < todayStr && d.status !== 'Resolved' && d.status !== 'Closed' && d.status !== 'Cancelled');
      const isCritical = d.criticality === 'Critical' || d.dependencyType === 'Blocks' || d.status === 'At Risk' || d.status === 'Blocked' || isOverdue;
      return {
        ...d,
        criticality: d.criticality || (isCritical ? 'Critical' : 'Medium'),
        targetDate: d.targetDate || d.dueDate,
        dueDate: d.dueDate || d.targetDate,
        resolvedAt: d.resolvedAt || d.resolutionDate,
        resolutionDate: d.resolutionDate || d.resolvedAt,
        isOverdue,
        isCritical,
      };
    });
  },

  async count(filter?: {
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
  }): Promise<number> {
    seedDefaultDependencies();
    if (isDbConnected()) {
      try {
        let queryStr = `SELECT COUNT(*)::int as count FROM dependencies WHERE 1=1`;
        const params: any[] = [];
        let pIndex = 1;

        if (filter?.projectId) {
          queryStr += ` AND (project_id = $${pIndex} OR source_entity_id = $${pIndex} OR target_entity_id = $${pIndex})`;
          params.push(filter.projectId);
          pIndex++;
        }
        if (filter?.entityId) {
          queryStr += ` AND (source_entity_id = $${pIndex} OR target_entity_id = $${pIndex})`;
          params.push(filter.entityId);
          pIndex++;
        }
        if (filter?.status && filter.status !== 'all') {
          queryStr += ` AND status = $${pIndex++}`;
          params.push(filter.status);
        }
        if (filter?.criticality && filter.criticality !== 'all') {
          queryStr += ` AND criticality = $${pIndex++}`;
          params.push(filter.criticality);
        }
        if (filter?.dependencyType && filter.dependencyType !== 'all') {
          queryStr += ` AND dependency_type = $${pIndex++}`;
          params.push(filter.dependencyType);
        }
        if (filter?.ownerId) {
          queryStr += ` AND owner_id = $${pIndex++}`;
          params.push(filter.ownerId);
        }
        if (filter?.search) {
          queryStr += ` AND (source_entity_name ILIKE $${pIndex} OR target_entity_name ILIKE $${pIndex} OR code ILIKE $${pIndex} OR description ILIKE $${pIndex})`;
          params.push(`%${filter.search}%`);
          pIndex++;
        }

        const res = await query(queryStr, params);
        return res.rows[0]?.count || 0;
      } catch (err) {
        console.warn('DB error in DependencyRepository.count, fallback to memory:', err);
      }
    }

    let deps = Array.from(memoryDependencies.values());
    if (filter) {
      if (filter.projectId) {
        deps = deps.filter(
          (d) =>
            d.projectId === filter.projectId ||
            d.sourceEntityId === filter.projectId ||
            d.targetEntityId === filter.projectId
        );
      }
      if (filter.entityId) {
        deps = deps.filter((d) => d.sourceEntityId === filter.entityId || d.targetEntityId === filter.entityId);
      }
      if (filter.status && filter.status !== 'all') {
        deps = deps.filter((d) => d.status.toLowerCase() === filter.status!.toLowerCase());
      }
      if (filter.criticality && filter.criticality !== 'all') {
        deps = deps.filter((d) => d.criticality.toLowerCase() === filter.criticality!.toLowerCase());
      }
      if (filter.dependencyType && filter.dependencyType !== 'all') {
        deps = deps.filter((d) => d.dependencyType.toLowerCase() === filter.dependencyType!.toLowerCase());
      }
      if (filter.ownerId) {
        deps = deps.filter((d) => d.ownerId === filter.ownerId);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        deps = deps.filter(
          (d) =>
            d.sourceEntityName.toLowerCase().includes(q) ||
            d.targetEntityName.toLowerCase().includes(q) ||
            d.code.toLowerCase().includes(q) ||
            (d.description && d.description.toLowerCase().includes(q))
        );
      }
    }
    return deps.length;
  },

  async findById(id: string): Promise<Dependency | null> {
    seedDefaultDependencies();
    let dep: Dependency | null = null;
    if (isDbConnected()) {
      try {
        const res = await query(
          `SELECT id, code, source_entity_id as "sourceEntityId",
                  source_entity_type as "sourceEntityType", source_entity_name as "sourceEntityName",
                  source_entity_code as "sourceEntityCode", target_entity_id as "targetEntityId",
                  target_entity_type as "targetEntityType", target_entity_name as "targetEntityName",
                  target_entity_code as "targetEntityCode", dependency_type as "dependencyType",
                  status, criticality, owner_id as "ownerId", project_id as "projectId",
                  description, target_date as "targetDate", due_date as "dueDate",
                  resolved_at as "resolvedAt", resolution_date as "resolutionDate",
                  created_by as "createdBy", updated_by as "updatedBy",
                  created_at as "createdAt", updated_at as "updatedAt"
           FROM dependencies
           WHERE id = $1`,
          [id]
        );
        if (res.rows.length > 0) dep = res.rows[0];
      } catch (err) {
        console.warn('DB error in DependencyRepository.findById:', err);
      }
    }
    if (!dep) {
      dep = memoryDependencies.get(id) || null;
    }
    if (dep) {
      const todayStr = new Date().toISOString().split('T')[0];
      const dateToCheck = dep.targetDate || dep.dueDate;
      dep.isOverdue = !!(dateToCheck && dateToCheck < todayStr && dep.status !== 'Resolved' && dep.status !== 'Closed' && dep.status !== 'Cancelled');
      dep.isCritical = dep.criticality === 'Critical' || dep.dependencyType === 'Blocks' || dep.status === 'At Risk' || dep.status === 'Blocked' || dep.isOverdue;
      dep.targetDate = dep.targetDate || dep.dueDate;
      dep.dueDate = dep.dueDate || dep.targetDate;
      dep.resolvedAt = dep.resolvedAt || dep.resolutionDate;
      dep.resolutionDate = dep.resolutionDate || dep.resolvedAt;
    }
    return dep;
  },

  async findBySource(sourceEntityType: string, sourceEntityId: string): Promise<Dependency[]> {
    return this.findAll({ sourceEntityType, sourceEntityId });
  },

  async findByTarget(targetEntityType: string, targetEntityId: string): Promise<Dependency[]> {
    return this.findAll({ targetEntityType, targetEntityId });
  },

  async findByEntity(entityType: string, entityId: string): Promise<Dependency[]> {
    return this.findAll({ entityId, entityType });
  },

  async findByProject(projectId: string): Promise<Dependency[]> {
    return this.findAll({ projectId });
  },

  async create(data: Partial<Dependency>): Promise<{ dependency?: Dependency; error?: string }> {
    seedDefaultDependencies();
    if (!data.sourceEntityId || !data.targetEntityId) {
      return { error: 'Source and target entity identifiers are required' };
    }

    const sourceType = (data.sourceEntityType as DependencyEntityType) || 'feature';
    const targetType = (data.targetEntityType as DependencyEntityType) || 'feature';

    // Self-dependency check
    if (sourceType.toLowerCase() === targetType.toLowerCase() && data.sourceEntityId === data.targetEntityId) {
      return { error: 'Self-dependency is not allowed: An entity cannot depend on itself' };
    }

    const allDeps = await this.findAll();

    // Duplicate check
    const isDup = isDuplicateRelationship(
      data.sourceEntityId,
      sourceType,
      data.targetEntityId,
      targetType,
      data.dependencyType || 'Blocks',
      allDeps
    );
    if (isDup) {
      return { error: 'Duplicate dependency relationship already exists' };
    }

    // Cycle detection
    const createsCycle = wouldCreateCycle(
      data.sourceEntityId,
      data.targetEntityId,
      (data.dependencyType as DependencyType) || 'Blocks',
      allDeps
    );
    if (createsCycle) {
      return {
        error: `Circular dependency detected between ${data.sourceEntityName || data.sourceEntityId} and ${data.targetEntityName || data.targetEntityId}`,
      };
    }

    const id = data.id || `dep_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const count = memoryDependencies.size + 101;
    const code = data.code || `DEP-${count}`;
    const targetDate = data.targetDate || data.dueDate;
    const todayStr = new Date().toISOString().split('T')[0];
    const status = (data.status as DependencyStatus) || 'Open';
    const isOverdue = !!(targetDate && targetDate < todayStr && status !== 'Resolved' && status !== 'Closed' && status !== 'Cancelled');
    const criticality = (data.criticality as DependencyCriticality) || (data.dependencyType === 'Blocks' ? 'High' : 'Medium');
    const isCritical = criticality === 'Critical' || data.dependencyType === 'Blocks' || status === 'At Risk' || status === 'Blocked' || isOverdue;

    let resolvedAt = data.resolvedAt || data.resolutionDate;
    if (status === 'Resolved' || status === 'Closed') {
      if (!resolvedAt) resolvedAt = new Date().toISOString();
    } else {
      resolvedAt = undefined;
    }

    const newDep: Dependency = {
      id,
      code,
      sourceEntityId: data.sourceEntityId,
      sourceEntityType: sourceType,
      sourceEntityName: data.sourceEntityName || 'Source Entity',
      sourceEntityCode: data.sourceEntityCode,
      targetEntityId: data.targetEntityId,
      targetEntityType: targetType,
      targetEntityName: data.targetEntityName || 'Target Entity',
      targetEntityCode: data.targetEntityCode,
      dependencyType: (data.dependencyType as DependencyType) || 'Blocks',
      status,
      criticality,
      ownerId: data.ownerId || 'usr_admin_1',
      ownerName: data.ownerName || 'Admin User',
      projectId: data.projectId,
      description: data.description || '',
      targetDate,
      dueDate: targetDate,
      resolvedAt,
      resolutionDate: resolvedAt,
      isOverdue,
      isCritical,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: data.createdBy || 'system',
      updatedBy: data.updatedBy || 'system',
    };

    memoryDependencies.set(id, newDep);

    if (isDbConnected()) {
      try {
        await query(
          `INSERT INTO dependencies (
            id, code, source_entity_id, source_entity_type, source_entity_name,
            source_entity_code, target_entity_id, target_entity_type, target_entity_name,
            target_entity_code, dependency_type, status, criticality, owner_id, project_id,
            description, target_date, due_date, resolved_at, resolution_date,
            created_by, updated_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
          [
            newDep.id,
            newDep.code,
            newDep.sourceEntityId,
            newDep.sourceEntityType,
            newDep.sourceEntityName,
            newDep.sourceEntityCode || null,
            newDep.targetEntityId,
            newDep.targetEntityType,
            newDep.targetEntityName,
            newDep.targetEntityCode || null,
            newDep.dependencyType,
            newDep.status,
            newDep.criticality,
            newDep.ownerId || null,
            newDep.projectId || null,
            newDep.description || null,
            newDep.targetDate || null,
            newDep.dueDate || null,
            newDep.resolvedAt || null,
            newDep.resolutionDate || null,
            newDep.createdBy || null,
            newDep.updatedBy || null,
            newDep.createdAt,
            newDep.updatedAt,
          ]
        );
      } catch (err) {
        console.warn('DB error inserting dependency:', err);
      }
    }

    return { dependency: newDep };
  },

  async update(id: string, updates: Partial<Dependency>): Promise<{ dependency?: Dependency; error?: string }> {
    seedDefaultDependencies();
    const existing = await this.findById(id);
    if (!existing) return { error: 'Dependency not found' };

    const nextSourceId = updates.sourceEntityId || existing.sourceEntityId;
    const nextSourceType = (updates.sourceEntityType as DependencyEntityType) || existing.sourceEntityType;
    const nextTargetId = updates.targetEntityId || existing.targetEntityId;
    const nextTargetType = (updates.targetEntityType as DependencyEntityType) || existing.targetEntityType;
    const nextType = (updates.dependencyType as DependencyType) || existing.dependencyType;

    // Self-dependency check
    if (nextSourceType.toLowerCase() === nextTargetType.toLowerCase() && nextSourceId === nextTargetId) {
      return { error: 'Self-dependency is not allowed: An entity cannot depend on itself' };
    }

    const allDeps = await this.findAll();

    // Duplicate check if endpoints changed
    if (
      updates.sourceEntityId ||
      updates.sourceEntityType ||
      updates.targetEntityId ||
      updates.targetEntityType ||
      updates.dependencyType
    ) {
      const isDup = isDuplicateRelationship(
        nextSourceId,
        nextSourceType,
        nextTargetId,
        nextTargetType,
        nextType,
        allDeps,
        id
      );
      if (isDup) {
        return { error: 'Duplicate dependency relationship already exists' };
      }

      const createsCycle = wouldCreateCycle(nextSourceId, nextTargetId, nextType, allDeps, id);
      if (createsCycle) {
        return {
          error: `Circular dependency detected between ${existing.sourceEntityName} and ${existing.targetEntityName}`,
        };
      }
    }

    let resolvedAt = existing.resolvedAt || existing.resolutionDate;
    const nextStatus = (updates.status as DependencyStatus) || existing.status;
    if (nextStatus === 'Resolved' || nextStatus === 'Closed') {
      if (!resolvedAt) resolvedAt = new Date().toISOString();
    } else {
      // Reopening clears resolved timestamp
      resolvedAt = undefined;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = updates.targetDate !== undefined ? updates.targetDate : updates.dueDate !== undefined ? updates.dueDate : (existing.targetDate || existing.dueDate);
    const criticality = (updates.criticality as DependencyCriticality) || existing.criticality || 'Medium';
    const isOverdue = !!(targetDate && targetDate < todayStr && nextStatus !== 'Resolved' && nextStatus !== 'Closed' && nextStatus !== 'Cancelled');
    const isCritical = criticality === 'Critical' || nextType === 'Blocks' || nextStatus === 'At Risk' || nextStatus === 'Blocked' || isOverdue;

    const updated: Dependency = {
      ...existing,
      ...updates,
      sourceEntityId: nextSourceId,
      sourceEntityType: nextSourceType,
      targetEntityId: nextTargetId,
      targetEntityType: nextTargetType,
      dependencyType: nextType,
      status: nextStatus,
      criticality,
      targetDate,
      dueDate: targetDate,
      resolvedAt,
      resolutionDate: resolvedAt,
      isOverdue,
      isCritical,
      updatedAt: new Date().toISOString(),
    };

    memoryDependencies.set(id, updated);

    if (isDbConnected()) {
      try {
        await query(
          `UPDATE dependencies SET
            source_entity_id = $1, source_entity_type = $2, source_entity_name = $3,
            source_entity_code = $4, target_entity_id = $5, target_entity_type = $6,
            target_entity_name = $7, target_entity_code = $8, dependency_type = $9,
            status = $10, criticality = $11, owner_id = $12, project_id = $13,
            description = $14, target_date = $15, due_date = $16,
            resolved_at = $17, resolution_date = $18, updated_by = $19, updated_at = $20
           WHERE id = $21`,
          [
            updated.sourceEntityId,
            updated.sourceEntityType,
            updated.sourceEntityName,
            updated.sourceEntityCode || null,
            updated.targetEntityId,
            updated.targetEntityType,
            updated.targetEntityName,
            updated.targetEntityCode || null,
            updated.dependencyType,
            updated.status,
            updated.criticality,
            updated.ownerId || null,
            updated.projectId || null,
            updated.description || null,
            updated.targetDate || null,
            updated.dueDate || null,
            updated.resolvedAt || null,
            updated.resolutionDate || null,
            updated.updatedBy || null,
            updated.updatedAt,
            id,
          ]
        );
      } catch (err) {
        console.warn('DB error updating dependency:', err);
      }
    }

    return { dependency: updated };
  },

  async delete(id: string): Promise<boolean> {
    seedDefaultDependencies();
    const removed = memoryDependencies.delete(id);
    if (isDbConnected()) {
      try {
        await query(`DELETE FROM dependencies WHERE id = $1`, [id]);
      } catch (err) {
        console.warn('DB error deleting dependency:', err);
      }
    }
    return removed;
  },

  async getDependencyChain(entityId: string): Promise<{
    blockingThisItem: Dependency[];
    thisItemBlocks: Dependency[];
  }> {
    const all = await this.findAll();
    // What blocks this item?
    // 1. Items where targetEntityId = entityId and type is 'Blocks', 'Required By', 'Predecessor'
    // 2. Items where sourceEntityId = entityId and type is 'Depends On', 'Blocked By', 'Successor'
    const blockingThisItem = all.filter(
      (d) =>
        (d.targetEntityId === entityId &&
          (d.dependencyType === 'Blocks' || d.dependencyType === 'Required By' || d.dependencyType === 'Predecessor')) ||
        (d.sourceEntityId === entityId &&
          (d.dependencyType === 'Depends On' || d.dependencyType === 'Blocked By' || d.dependencyType === 'Successor'))
    );

    // What does this item block?
    // 1. Items where sourceEntityId = entityId and type is 'Blocks', 'Required By', 'Predecessor'
    // 2. Items where targetEntityId = entityId and type is 'Depends On', 'Blocked By', 'Successor'
    const thisItemBlocks = all.filter(
      (d) =>
        (d.sourceEntityId === entityId &&
          (d.dependencyType === 'Blocks' || d.dependencyType === 'Required By' || d.dependencyType === 'Predecessor')) ||
        (d.targetEntityId === entityId &&
          (d.dependencyType === 'Depends On' || d.dependencyType === 'Blocked By' || d.dependencyType === 'Successor'))
    );

    return { blockingThisItem, thisItemBlocks };
  },
};
