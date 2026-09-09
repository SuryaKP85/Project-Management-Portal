import { ActivityLog } from '../models/types';
import { isDbConnected, query } from '../config/database';

const memoryActivities: ActivityLog[] = [];

export const ActivityRepository = {
  async create(log: ActivityLog): Promise<ActivityLog> {
    if (isDbConnected()) {
      await query(
        `INSERT INTO activity_logs (id, entity_type, entity_id, action, actor_id, actor_name, details, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          log.id,
          log.entityType,
          log.entityId,
          log.action,
          log.actorId,
          log.actorName,
          JSON.stringify(log.details || {}),
          log.ipAddress || null,
          log.createdAt,
        ]
      );
    }
    memoryActivities.unshift(log);
    // Keep max 500 in memory
    if (memoryActivities.length > 500) {
      memoryActivities.pop();
    }
    return log;
  },

  async findRecent(limit = 50): Promise<ActivityLog[]> {
    if (isDbConnected()) {
      const res = await query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1', [limit]);
      return res.rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        actorId: r.actor_id,
        actorName: r.actor_name,
        details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
        ipAddress: r.ip_address,
        createdAt: r.created_at,
      }));
    }
    return memoryActivities.slice(0, limit);
  },

  async findByEntity(entityType: string, entityId: string): Promise<ActivityLog[]> {
    if (isDbConnected()) {
      const res = await query(
        'SELECT * FROM activity_logs WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC',
        [entityType, entityId]
      );
      return res.rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        actorId: r.actor_id,
        actorName: r.actor_name,
        details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
        ipAddress: r.ip_address,
        createdAt: r.created_at,
      }));
    }
    return memoryActivities.filter((a) => a.entityType === entityType && a.entityId === entityId);
  },
};
