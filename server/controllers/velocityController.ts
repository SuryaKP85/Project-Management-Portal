import { Request, Response } from 'express';
import { VelocityRepository } from '../repositories/velocityRepository';

export const VelocityController = {
  async getVelocity(req: Request, res: Response) {
    try {
      const { projectId } = req.query;
      const history = await VelocityRepository.findAll(projectId ? String(projectId) : undefined);
      const stats = projectId ? await VelocityRepository.getAverageVelocity(String(projectId)) : null;

      return res.json({
        success: true,
        data: {
          history,
          stats,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },
};
