import { Dependency, DependencyEntityType, DependencyStatus, DependencyType } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryDependencies: Map<string, Dependency> = new Map();

export function wouldCreateCycle(
  sourceId: string,
  targetId: string,
  dependencyType: DependencyType,
  allDependencies: Dependency[]
): boolean {
  // If identical entity, immediately circular
  if (sourceId === targetId) return true;

  // We only check cycles for directional blocking/depending relationships
  const isBlockingOrDepends =
    dependencyType === 'Blocks' ||
    dependencyType === 'Depends On' ||
    dependencyType === 'Blocked By' ||
    dependencyType === 'Required By';

  if (!isBlockingOrDepends) return false;

  // Standardize directional edge: From blocker to blocked
  // If A 'Blocks' B => A -> B
  // If A 'Depends On' B => B -> A
  // If A 'Blocked By' B => B -> A
  // If A 'Required By' B => A -> B
  let fromNode = sourceId;
  let toNode = targetId;
  if (dependencyType === 'Depends On' || dependencyType === 'Blocked By') {
    fromNode = targetId;
    toNode = sourceId;
  }

  // Build adjacency list of active/blocking dependencies
  const adj = new Map<string, string[]>();
  for (const dep of allDependencies) {
    if (dep.status === 'Resolved' || dep.status === 'Closed') continue;
    let u = dep.sourceEntityId;
    let v = dep.targetEntityId;
    if (dep.dependencyType === 'Depends On' || dep.dependencyType === 'Blocked By') {
      u = dep.targetEntityId;
      v = dep.sourceEntityId;
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
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      description: 'GN&C attitude determination filter required before telemetry valve calibration logic can fire.',
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
      sourceEntityCode: 'TSK-102',
      dependencyType: 'Blocks',
      status: 'In Progress',
      ownerId: 'usr_dev_1',
      ownerName: 'Sarah Chen',
      description: 'Algorithm math verification must pass before flashing microcode to hardware bench.',
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
      sourceEntityCode: 'PRJ-104',
      dependencyType: 'Blocks',
      status: 'At Risk',
      ownerId: 'usr_pm_2',
      ownerName: 'Alex Morgan',
      description: 'Stage 1 control firmware API telemetry protocol freeze needed for orbital OS staging handoff.',
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
      sourceEntityCode: 'MLS-101',
      dependencyType: 'Depends On',
      status: 'In Progress',
      ownerId: 'usr_admin_1',
      ownerName: 'Surya Prashanth',
      description: 'Release 2.0-Alpha deployment requires formal signoff of Milestone 101 safety envelope.',
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
    entityId?: string;
    entityType?: string;
    dependencyType?: string;
    status?: string;
    isOverdue?: boolean;
    isCritical?: boolean;
    search?: string;
  }): Promise<Dependency[]> {
    seedDefaultDependencies();
    let deps: Dependency[] = [];

    if (isDbConnected()) {
      try {
        let queryStr = `
          SELECT id, code, source_entity_id as "sourceEntityId",
                 source_entity_type as "sourceEntityType", source_entity_name as "sourceEntityName",
                 source_entity_code as "sourceEntityCode", target_entity_id as "targetEntityId",
                 target_entity_type as "targetEntityType", target_entity_name as "targetEntityName",
                 target_entity_code as "targetEntityCode", dependency_type as "dependencyType",
                 status, owner_id as "ownerId", description, due_date as "dueDate",
                 resolution_date as "resolutionDate", created_by as "createdBy",
                 updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
          FROM dependencies
          WHERE 1=1
        `;
        const params: any[] = [];
        let pIndex = 1;

        if (filter?.entityId) {
          queryStr += ` AND (source_entity_id = $${pIndex} OR target_entity_id = $${pIndex})`;
          params.push(filter.entityId);
          pIndex++;
        }
        if (filter?.status && filter.status !== 'all') {
          queryStr += ` AND status = $${pIndex++}`;
          params.push(filter.status);
        }
        if (filter?.dependencyType && filter.dependencyType !== 'all') {
          queryStr += ` AND dependency_type = $${pIndex++}`;
          params.push(filter.dependencyType);
        }
        if (filter?.search) {
          queryStr += ` AND (source_entity_name ILIKE $${pIndex} OR target_entity_name ILIKE $${pIndex} OR code ILIKE $${pIndex} OR description ILIKE $${pIndex})`;
          params.push(`%${filter.search}%`);
          pIndex++;
        }
        queryStr += ` ORDER BY created_at DESC`;

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
      if (filter.entityId) {
        deps = deps.filter((d) => d.sourceEntityId === filter.entityId || d.targetEntityId === filter.entityId);
      }
      if (filter.status && filter.status !== 'all') {
        deps = deps.filter((d) => d.status.toLowerCase() === filter.status!.toLowerCase());
      }
      if (filter.dependencyType && filter.dependencyType !== 'all') {
        deps = deps.filter((d) => d.dependencyType.toLowerCase() === filter.dependencyType!.toLowerCase());
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

    const todayStr = new Date().toISOString().split('T')[0];
    return deps.map((d) => {
      const isOverdue = !!(d.dueDate && d.dueDate < todayStr && d.status !== 'Resolved' && d.status !== 'Closed');
      const isCritical = d.dependencyType === 'Blocks' || d.status === 'At Risk' || isOverdue;
      return {
        ...d,
        isOverdue,
        isCritical,
      };
    });
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
                  status, owner_id as "ownerId", description, due_date as "dueDate",
                  resolution_date as "resolutionDate", created_by as "createdBy",
                  updated_by as "updatedBy", created_at as "createdAt", updated_at as "updatedAt"
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
      dep.isOverdue = !!(dep.dueDate && dep.dueDate < todayStr && dep.status !== 'Resolved' && dep.status !== 'Closed');
      dep.isCritical = dep.dependencyType === 'Blocks' || dep.status === 'At Risk' || dep.isOverdue;
    }
    return dep;
  },

  async create(data: Partial<Dependency>): Promise<{ dependency?: Dependency; error?: string }> {
    seedDefaultDependencies();
    if (!data.sourceEntityId || !data.targetEntityId) {
      return { error: 'Source and target entity identifiers are required' };
    }

    const allDeps = await this.findAll();
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
    const todayStr = new Date().toISOString().split('T')[0];
    const isOverdue = !!(data.dueDate && data.dueDate < todayStr && data.status !== 'Resolved' && data.status !== 'Closed');
    const isCritical = data.dependencyType === 'Blocks' || data.status === 'At Risk' || isOverdue;

    const newDep: Dependency = {
      id,
      code,
      sourceEntityId: data.sourceEntityId,
      sourceEntityType: (data.sourceEntityType as DependencyEntityType) || 'feature',
      sourceEntityName: data.sourceEntityName || 'Source Entity',
      sourceEntityCode: data.sourceEntityCode,
      targetEntityId: data.targetEntityId,
      targetEntityType: (data.targetEntityType as DependencyEntityType) || 'feature',
      targetEntityName: data.targetEntityName || 'Target Entity',
      targetEntityCode: data.targetEntityCode,
      dependencyType: (data.dependencyType as DependencyType) || 'Blocks',
      status: (data.status as DependencyStatus) || 'Open',
      ownerId: data.ownerId || 'usr_admin_1',
      ownerName: data.ownerName || 'Admin User',
      description: data.description || '',
      dueDate: data.dueDate,
      resolutionDate: data.resolutionDate,
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
            target_entity_code, dependency_type, status, owner_id, description,
            due_date, resolution_date, created_by, updated_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
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
            newDep.ownerId || null,
            newDep.description || null,
            newDep.dueDate || null,
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

    const nextSource = updates.sourceEntityId || existing.sourceEntityId;
    const nextTarget = updates.targetEntityId || existing.targetEntityId;
    const nextType = (updates.dependencyType as DependencyType) || existing.dependencyType;

    if (updates.sourceEntityId || updates.targetEntityId || updates.dependencyType) {
      const allDeps = (await this.findAll()).filter((d) => d.id !== id);
      const createsCycle = wouldCreateCycle(nextSource, nextTarget, nextType, allDeps);
      if (createsCycle) {
        return {
          error: `Circular dependency detected between ${existing.sourceEntityName} and ${existing.targetEntityName}`,
        };
      }
    }

    let resolutionDate = existing.resolutionDate;
    if (updates.status === 'Resolved' || updates.status === 'Closed') {
      if (!resolutionDate) resolutionDate = new Date().toISOString();
    } else if (updates.status && updates.status !== 'Resolved' && updates.status !== 'Closed') {
      resolutionDate = undefined;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const dueDate = updates.dueDate !== undefined ? updates.dueDate : existing.dueDate;
    const status = (updates.status as DependencyStatus) || existing.status;
    const isOverdue = !!(dueDate && dueDate < todayStr && status !== 'Resolved' && status !== 'Closed');
    const isCritical = nextType === 'Blocks' || status === 'At Risk' || isOverdue;

    const updated: Dependency = {
      ...existing,
      ...updates,
      resolutionDate,
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
            status = $10, owner_id = $11, description = $12, due_date = $13,
            resolution_date = $14, updated_by = $15, updated_at = $16
           WHERE id = $17`,
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
            updated.ownerId || null,
            updated.description || null,
            updated.dueDate || null,
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
    // 1. Items where targetEntityId = entityId and type is 'Blocks'
    // 2. Items where sourceEntityId = entityId and type is 'Depends On' or 'Blocked By'
    const blockingThisItem = all.filter(
      (d) =>
        (d.targetEntityId === entityId && (d.dependencyType === 'Blocks' || d.dependencyType === 'Required By')) ||
        (d.sourceEntityId === entityId && (d.dependencyType === 'Depends On' || d.dependencyType === 'Blocked By'))
    );

    // What does this item block?
    // 1. Items where sourceEntityId = entityId and type is 'Blocks'
    // 2. Items where targetEntityId = entityId and type is 'Depends On' or 'Blocked By'
    const thisItemBlocks = all.filter(
      (d) =>
        (d.sourceEntityId === entityId && (d.dependencyType === 'Blocks' || d.dependencyType === 'Required By')) ||
        (d.targetEntityId === entityId && (d.dependencyType === 'Depends On' || d.dependencyType === 'Blocked By'))
    );

    return { blockingThisItem, thisItemBlocks };
  },
};
