import { Request, Response } from 'express';
import { databaseReady, isDbConnected } from '../config/database';
import { persistenceStatus } from '../config/persistence';
import { GeminiAIProvider } from '../ai/providers/geminiProvider';
import { MicrosoftIdentityService } from '../integrations/microsoft365/microsoftIdentityService';

/** Mode and save status only: no file path, secrets or data. */
function storageStatus() {
  const p = persistenceStatus();
  return {
    mode: p.mode,
    durable: p.mode !== 'temporary-memory',
    ...(p.mode === 'persistent-embedded' ? { lastSavedAt: p.lastSavedAt, saveError: p.lastError ? 'The last save failed; the previous saved data is unchanged.' : null } : {}),
  };
}

export const HealthController = {
  /** Sprint 24 — liveness: the process is up and answering. Never touches the database. */
  async live(_req: Request, res: Response) {
    res.json({ success: true, data: { status: 'alive', uptime: process.uptime(), timestamp: new Date().toISOString() } });
  },

  /**
   * Readiness. Sprint 24: in PostgreSQL mode the database must answer a
   * trivial query now (SELECT 1); otherwise 503 'degraded'. The embedded and
   * temporary stores are in-process and always ready.
   */
  async status(_req: Request, res: Response) {
    const ready = await databaseReady();
    (ready ? res : res.status(503)).json({
      success: ready,
      data: {
        status: ready ? 'healthy' : 'degraded',
        app: 'Surya Project Management Portal & Operating System',
        internalVersion: '2.0.0',
        displayVersion: 'V2.0',
        platform: 'Enterprise V2 Hybrid Engine',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        // Sprint 20: the active data mode — postgresql | persistent-embedded | temporary-memory.
        storage: storageStatus(),
        services: {
          database: {
            connected: isDbConnected(),
            ready,
            engine: isDbConnected() ? 'PostgreSQL' : 'Embedded Store',
          },
          ai: {
            geminiConfigured: GeminiAIProvider.isAvailable(),
            fallbackAvailable: true,
          },
          microsoft365: {
            configured: MicrosoftIdentityService.isConfigured(),
            readiness: 'Sprint 10A: account connection and Outlook calendar (read-only)',
          },
        },
      },
    });
  },
};
