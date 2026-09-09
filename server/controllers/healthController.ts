import { Request, Response } from 'express';
import { isDbConnected } from '../config/database';
import { GeminiAIProvider } from '../ai/providers/geminiProvider';
import { MicrosoftIdentityService } from '../integrations/microsoft365/microsoftIdentityService';

export const HealthController = {
  async status(_req: Request, res: Response) {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        app: 'Surya Project Management Portal & Operating System',
        internalVersion: '2.0.0',
        displayVersion: 'V2.0',
        platform: 'Enterprise V2 Hybrid Engine',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: {
            connected: isDbConnected(),
            engine: isDbConnected() ? 'PostgreSQL' : 'Embedded Resilience Store',
          },
          ai: {
            geminiConfigured: GeminiAIProvider.isAvailable(),
            fallbackAvailable: true,
          },
          microsoft365: {
            configured: MicrosoftIdentityService.isConfigured(),
            readiness: 'Sprint 1 Abstracted',
          },
        },
      },
    });
  },
};
