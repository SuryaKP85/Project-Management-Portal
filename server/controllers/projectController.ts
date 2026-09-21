import { Request, Response, NextFunction } from 'express';
import { ProjectService } from '../services/projectService';
import { ProjectHealthService } from '../services/projectHealthService';

/**
 * Sprint 8.2 — project health API.
 *
 * Scoring stays entirely inside ProjectHealthService; this layer only resolves
 * the request, bounds the batch and shapes the response.
 */

/** Accepted shape for a project identifier (id or code). */
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Batch sizing: default page, and a hard server-side ceiling. */
const HEALTH_BATCH_DEFAULT_LIMIT = 20;
const HEALTH_BATCH_MAX_LIMIT = 50;

export const ProjectController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const projects = await ProjectService.getAllProjects();
      res.json({ success: true, data: { projects } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /projects/:id/health — deterministic health for one project.
   */
  async getHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id ?? '').trim();

      if (!PROJECT_ID_PATTERN.test(id)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid project identifier.',
            details: ['Project identifier must be 1-64 characters of letters, digits, dot, dash or underscore.'],
          },
        });
      }

      const health = await ProjectHealthService.getProjectHealth(id);
      if (!health) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Project not found' },
        });
      }

      res.json({ success: true, data: { health } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /projects/health — bounded batch of project health results.
   * The limit is enforced server-side; a caller cannot request the whole estate.
   */
  async listHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const rawLimit = req.query.limit;
      let limit = HEALTH_BATCH_DEFAULT_LIMIT;

      if (rawLimit !== undefined) {
        const parsed = parseInt(String(rawLimit), 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid limit.',
              details: [`limit must be a positive integer up to ${HEALTH_BATCH_MAX_LIMIT}.`],
            },
          });
        }
        // Over-large requests are clamped rather than rejected, so a caller
        // always gets a usable page.
        limit = Math.min(parsed, HEALTH_BATCH_MAX_LIMIT);
      }

      const projects = await ProjectService.getAllProjects();
      const selected = projects.slice(0, limit);

      const results = [];
      for (const project of selected) {
        results.push(await ProjectHealthService.computeHealth(project));
      }

      res.json({
        success: true,
        data: {
          results,
          total: projects.length,
          returned: results.length,
          limit,
          maxLimit: HEALTH_BATCH_MAX_LIMIT,
          truncated: projects.length > results.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const project = await ProjectService.getProjectById(req.params.id);
      if (!project) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }
      res.json({ success: true, data: { project } });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const project = await ProjectService.createProject(req.body, actor);
      res.status(201).json({ success: true, data: { project } });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const updated = await ProjectService.updateProject(req.params.id, req.body, actor);
      if (!updated) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }
      res.json({ success: true, data: { project: updated } });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const deleted = await ProjectService.deleteProject(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      }
      res.json({ success: true, data: { message: 'Project deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },

  async migrate(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user ? { id: req.user.userId, firstName: req.user.firstName, lastName: req.user.lastName, email: req.user.email, role: req.user.role, isActive: true, createdAt: '', updatedAt: '' } : undefined;
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      const projectsToMigrate = Array.isArray(req.body.projects) ? req.body.projects : [];
      const result = await ProjectService.migrateLocalProjects(projectsToMigrate, actor);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
