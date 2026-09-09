import { VelocityRepository } from '../repositories/velocityRepository';
import { VelocityRecord } from '../models/types';

export const VelocityService = {
  async getVelocityRecords(projectId?: string): Promise<VelocityRecord[]> {
    return VelocityRepository.findByProject(projectId);
  },

  async getAverageVelocity(projectId?: string) {
    return VelocityRepository.getAverageVelocity(projectId || '');
  },
};
