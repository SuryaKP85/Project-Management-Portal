import { Request, Response, NextFunction } from 'express';
import { DeliveryService } from '../services/deliveryService';

function getActor(req: Request) {
  if (!req.user) return null;
  return {
    id: req.user.userId,
    firstName: req.user.firstName,
    lastName: req.user.lastName,
    email: req.user.email,
    role: req.user.role,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}

export const DeliveryController = {
  // ================= EPICS =================
  async listEpics(req: Request, res: Response, next: NextFunction) {
    try {
      const epics = await DeliveryService.getAllEpics(req.query);
      res.json({ success: true, data: { epics } });
    } catch (err) {
      next(err);
    }
  },

  async getEpic(req: Request, res: Response, next: NextFunction) {
    try {
      const epic = await DeliveryService.getEpicById(req.params.id);
      if (!epic) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Epic not found' } });
      }
      res.json({ success: true, data: { epic } });
    } catch (err) {
      next(err);
    }
  },

  async createEpic(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const epic = await DeliveryService.createEpic(req.body, actor);
      res.status(201).json({ success: true, data: { epic } });
    } catch (err) {
      next(err);
    }
  },

  async updateEpic(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const epic = await DeliveryService.updateEpic(req.params.id, req.body, actor);
      if (!epic) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Epic not found' } });
      }
      res.json({ success: true, data: { epic } });
    } catch (err) {
      next(err);
    }
  },

  async deleteEpic(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const deleted = await DeliveryService.deleteEpic(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Epic not found' } });
      }
      res.json({ success: true, data: { message: 'Epic deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },

  // ================= FEATURES =================
  async listFeatures(req: Request, res: Response, next: NextFunction) {
    try {
      const features = await DeliveryService.getAllFeatures(req.query);
      res.json({ success: true, data: { features } });
    } catch (err) {
      next(err);
    }
  },

  async getFeature(req: Request, res: Response, next: NextFunction) {
    try {
      const feature = await DeliveryService.getFeatureById(req.params.id);
      if (!feature) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Feature not found' } });
      }
      res.json({ success: true, data: { feature } });
    } catch (err) {
      next(err);
    }
  },

  async createFeature(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const feature = await DeliveryService.createFeature(req.body, actor);
      res.status(201).json({ success: true, data: { feature } });
    } catch (err) {
      next(err);
    }
  },

  async updateFeature(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const feature = await DeliveryService.updateFeature(req.params.id, req.body, actor);
      if (!feature) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Feature not found' } });
      }
      res.json({ success: true, data: { feature } });
    } catch (err) {
      next(err);
    }
  },

  async deleteFeature(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const deleted = await DeliveryService.deleteFeature(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Feature not found' } });
      }
      res.json({ success: true, data: { message: 'Feature deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },

  // ================= STORIES =================
  async listStories(req: Request, res: Response, next: NextFunction) {
    try {
      const stories = await DeliveryService.getAllStories(req.query);
      res.json({ success: true, data: { stories } });
    } catch (err) {
      next(err);
    }
  },

  async getStory(req: Request, res: Response, next: NextFunction) {
    try {
      const story = await DeliveryService.getStoryById(req.params.id);
      if (!story) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Story not found' } });
      }
      res.json({ success: true, data: { story } });
    } catch (err) {
      next(err);
    }
  },

  async createStory(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const story = await DeliveryService.createStory(req.body, actor);
      res.status(201).json({ success: true, data: { story } });
    } catch (err) {
      next(err);
    }
  },

  async updateStory(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const story = await DeliveryService.updateStory(req.params.id, req.body, actor);
      if (!story) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Story not found' } });
      }
      res.json({ success: true, data: { story } });
    } catch (err) {
      next(err);
    }
  },

  async deleteStory(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const deleted = await DeliveryService.deleteStory(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Story not found' } });
      }
      res.json({ success: true, data: { message: 'Story deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },

  // ================= TASKS =================
  async listTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const tasks = await DeliveryService.getAllTasks(req.query);
      res.json({ success: true, data: { tasks } });
    } catch (err) {
      next(err);
    }
  },

  async getTask(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await DeliveryService.getTaskById(req.params.id);
      if (!task) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
      }
      res.json({ success: true, data: { task } });
    } catch (err) {
      next(err);
    }
  },

  async createTask(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const task = await DeliveryService.createTask(req.body, actor);
      res.status(201).json({ success: true, data: { task } });
    } catch (err) {
      next(err);
    }
  },

  async updateTask(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const task = await DeliveryService.updateTask(req.params.id, req.body, actor);
      if (!task) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
      }
      res.json({ success: true, data: { task } });
    } catch (err) {
      next(err);
    }
  },

  async deleteTask(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const deleted = await DeliveryService.deleteTask(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
      }
      res.json({ success: true, data: { message: 'Task deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },

  // ================= SUBTASKS =================
  async listSubtasks(req: Request, res: Response, next: NextFunction) {
    try {
      const subtasks = await DeliveryService.getAllSubtasks(req.query);
      res.json({ success: true, data: { subtasks } });
    } catch (err) {
      next(err);
    }
  },

  async getSubtask(req: Request, res: Response, next: NextFunction) {
    try {
      const subtask = await DeliveryService.getSubtaskById(req.params.id);
      if (!subtask) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Subtask not found' } });
      }
      res.json({ success: true, data: { subtask } });
    } catch (err) {
      next(err);
    }
  },

  async createSubtask(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const subtask = await DeliveryService.createSubtask(req.body, actor);
      res.status(201).json({ success: true, data: { subtask } });
    } catch (err) {
      next(err);
    }
  },

  async updateSubtask(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const subtask = await DeliveryService.updateSubtask(req.params.id, req.body, actor);
      if (!subtask) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Subtask not found' } });
      }
      res.json({ success: true, data: { subtask } });
    } catch (err) {
      next(err);
    }
  },

  async deleteSubtask(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = getActor(req);
      if (!actor) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }
      const deleted = await DeliveryService.deleteSubtask(req.params.id, actor);
      if (!deleted) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Subtask not found' } });
      }
      res.json({ success: true, data: { message: 'Subtask deleted successfully' } });
    } catch (err) {
      next(err);
    }
  },

  // ================= TRACEABILITY & SUMMARY =================
  async getTrace(req: Request, res: Response, next: NextFunction) {
    try {
      const { entityType, id } = req.params;
      const chain = await DeliveryService.getTrace(entityType, id);
      if (!chain) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Traceability node not found' } });
      }
      res.json({ success: true, data: { trace: chain } });
    } catch (err) {
      next(err);
    }
  },

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await DeliveryService.getDeliverySummary();
      res.json({ success: true, data: { summary } });
    } catch (err) {
      next(err);
    }
  },
};
