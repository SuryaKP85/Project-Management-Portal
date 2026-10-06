import { Request, Response } from 'express';
import { VelocityRepository } from '../repositories/velocityRepository';
import { ProjectScope, scopeActor } from '../services/projectScope';
import { notAvailable } from '../services/followThroughSupport';

/** Sprint 22A: access errors keep their status (404 / 403 / 400); other errors stay a 500 as before. */
function failWith(res: Response, err: any, fallback: number) {
  const status = Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : fallback;
  return res.status(status).json({ success: false, message: err?.message, ...(err?.code ? { error: { code: err.code, message: err.message } } : {}) });
}

export const VelocityController = {
  async getVelocity(req: Request, res: Response) {
    try {
      const { projectId } = req.query;
      const actor = scopeActor(req);
      // Sprint 22A: one project's velocity needs access to it; the list covers accessible projects only.
      if (projectId && !(await ProjectScope.canRead(actor, String(projectId)))) throw notAvailable('Project');
      const history = await ProjectScope.filter(actor, await VelocityRepository.findAll(projectId ? String(projectId) : undefined), (v) => v.projectId);
      const stats = projectId ? await VelocityRepository.getAverageVelocity(String(projectId)) : null;

      return res.json({
        success: true,
        data: {
          history,
          stats,
        },
      });
    } catch (err: any) {
      return failWith(res, err, 500);
    }
  },
};
