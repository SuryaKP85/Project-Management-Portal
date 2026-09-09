import { TraceabilityChain, TraceabilityNode } from '../models/types';
import { SubtaskRepository } from './subtaskRepository';
import { TaskRepository } from './taskRepository';
import { StoryRepository } from './storyRepository';
import { FeatureRepository } from './featureRepository';
import { EpicRepository } from './epicRepository';
import { ProjectRepository } from './projectRepository';
import { ProductRepository } from './productRepository';
import { PortfolioRepository } from './portfolioRepository';
import { GoalRepository } from './goalRepository';
import { RiskRepository } from './riskRepository';
import { IssueRepository } from './issueRepository';
import { DependencyRepository } from './dependencyRepository';
import { MilestoneRepository } from './milestoneRepository';
import { ReleaseRepository } from './releaseRepository';
import { GovernanceLinkRepository } from './governanceLinkRepository';

export const TraceabilityRepository = {
  async getTraceabilityChain(
    entityType:
      | 'subtask'
      | 'task'
      | 'story'
      | 'feature'
      | 'epic'
      | 'project'
      | 'product'
      | 'portfolio'
      | 'risk'
      | 'issue'
      | 'dependency'
      | 'milestone'
      | 'release',
    id: string
  ): Promise<TraceabilityChain | null> {
    const ancestors: TraceabilityNode[] = [];
    const children: TraceabilityNode[] = [];
    let currentNode: TraceabilityNode | null = null;

    if (entityType === 'subtask') {
      const subtask = await SubtaskRepository.findById(id);
      if (!subtask) return null;
      currentNode = {
        type: 'subtask',
        id: subtask.id,
        name: subtask.title,
        status: subtask.status,
        priority: subtask.priority,
      };

      if (subtask.taskId) {
        const task = await TaskRepository.findById(subtask.taskId);
        if (task) {
          ancestors.unshift({
            type: 'task',
            id: task.id,
            code: task.code,
            name: task.title,
            status: task.status,
            priority: task.priority,
            progress: task.progress,
          });
          await this.populateTaskAncestors(task, ancestors);
        }
      }
    } else if (entityType === 'task') {
      const task = await TaskRepository.findById(id);
      if (!task) return null;
      currentNode = {
        type: 'task',
        id: task.id,
        code: task.code,
        name: task.title,
        status: task.status,
        priority: task.priority,
        progress: task.progress,
      };

      // Children
      const subtasks = await SubtaskRepository.findAll({ taskId: task.id });
      subtasks.forEach((s) => {
        children.push({
          type: 'subtask',
          id: s.id,
          name: s.title,
          status: s.status,
          priority: s.priority,
        });
      });

      await this.populateTaskAncestors(task, ancestors);
    } else if (entityType === 'story') {
      const story = await StoryRepository.findById(id);
      if (!story) return null;
      currentNode = {
        type: 'story',
        id: story.id,
        code: story.code,
        name: story.title,
        status: story.status,
        priority: story.priority,
        progress: story.progress,
      };

      // Children (tasks)
      const tasks = await TaskRepository.findAll({ storyId: story.id });
      tasks.forEach((t) => {
        children.push({
          type: 'task',
          id: t.id,
          code: t.code,
          name: t.title,
          status: t.status,
          priority: t.priority,
          progress: t.progress,
        });
      });

      await this.populateStoryAncestors(story, ancestors);
    } else if (entityType === 'feature') {
      const feat = await FeatureRepository.findById(id);
      if (!feat) return null;
      currentNode = {
        type: 'feature',
        id: feat.id,
        code: feat.code,
        name: feat.name,
        status: feat.status,
        priority: feat.priority,
        progress: feat.progress,
      };

      // Children (stories)
      const stories = await StoryRepository.findAll({ featureId: feat.id });
      stories.forEach((s) => {
        children.push({
          type: 'story',
          id: s.id,
          code: s.code,
          name: s.title,
          status: s.status,
          priority: s.priority,
          progress: s.progress,
        });
      });

      await this.populateFeatureAncestors(feat, ancestors);
    } else if (entityType === 'epic') {
      const epic = await EpicRepository.findById(id);
      if (!epic) return null;
      currentNode = {
        type: 'epic',
        id: epic.id,
        code: epic.code,
        name: epic.name,
        status: epic.status,
        priority: epic.priority,
        progress: epic.progress,
      };

      // Children (features)
      const features = await FeatureRepository.findAll({ epicId: epic.id });
      features.forEach((f) => {
        children.push({
          type: 'feature',
          id: f.id,
          code: f.code,
          name: f.name,
          status: f.status,
          priority: f.priority,
          progress: f.progress,
        });
      });

      await this.populateEpicAncestors(epic, ancestors);
    } else if (entityType === 'project') {
      const project = await ProjectRepository.findById(id);
      if (!project) return null;
      currentNode = {
        type: 'project',
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
      };

      // Children (epics)
      const epics = await EpicRepository.findAll({ projectId: project.id });
      epics.forEach((e) => {
        children.push({
          type: 'epic',
          id: e.id,
          code: e.code,
          name: e.name,
          status: e.status,
          priority: e.priority,
          progress: e.progress,
        });
      });

      await this.populateProjectAncestors(project, ancestors);
    } else if (entityType === 'risk') {
      const risk = await RiskRepository.findById(id);
      if (!risk) return null;
      currentNode = {
        type: 'risk',
        id: risk.id,
        code: risk.code,
        name: risk.title,
        status: risk.status,
        severity: risk.severity,
      };
      if (risk.projectId) {
        const proj = await ProjectRepository.findById(risk.projectId);
        if (proj) {
          ancestors.unshift({
            type: 'project',
            id: proj.id,
            code: proj.code,
            name: proj.name,
            status: proj.status,
          });
          await this.populateProjectAncestors(proj, ancestors);
        }
      }
      // Linked items as children
      const links = await GovernanceLinkRepository.getLinksFor('risk', risk.id);
      links.forEach((l) => {
        children.push({
          type: l.targetType as any,
          id: l.targetId,
          code: l.targetCode,
          name: l.targetName || l.targetId,
        });
      });
    } else if (entityType === 'issue') {
      const issue = await IssueRepository.findById(id);
      if (!issue) return null;
      currentNode = {
        type: 'issue',
        id: issue.id,
        code: issue.code,
        name: issue.title,
        status: issue.status,
        severity: issue.severity,
        priority: issue.priority,
      };
      if (issue.projectId) {
        const proj = await ProjectRepository.findById(issue.projectId);
        if (proj) {
          ancestors.unshift({
            type: 'project',
            id: proj.id,
            code: proj.code,
            name: proj.name,
            status: proj.status,
          });
          await this.populateProjectAncestors(proj, ancestors);
        }
      }
      const links = await GovernanceLinkRepository.getLinksFor('issue', issue.id);
      links.forEach((l) => {
        children.push({
          type: l.targetType as any,
          id: l.targetId,
          code: l.targetCode,
          name: l.targetName || l.targetId,
        });
      });
    } else if (entityType === 'dependency') {
      const dep = await DependencyRepository.findById(id);
      if (!dep) return null;
      currentNode = {
        type: 'dependency',
        id: dep.id,
        code: dep.code,
        name: `${dep.sourceEntityName} -> ${dep.targetEntityName}`,
        status: dep.status,
        priority: dep.dependencyType,
      };
      ancestors.unshift({
        type: dep.sourceEntityType as any,
        id: dep.sourceEntityId,
        code: dep.sourceEntityCode,
        name: dep.sourceEntityName,
      });
      children.push({
        type: dep.targetEntityType as any,
        id: dep.targetEntityId,
        code: dep.targetEntityCode,
        name: dep.targetEntityName,
      });
    } else if (entityType === 'milestone') {
      const mls = await MilestoneRepository.findById(id);
      if (!mls) return null;
      currentNode = {
        type: 'milestone',
        id: mls.id,
        code: mls.code,
        name: mls.name,
        status: mls.status,
        progress: mls.progress,
        priority: mls.type,
      };
      if (mls.projectId) {
        const proj = await ProjectRepository.findById(mls.projectId);
        if (proj) {
          ancestors.unshift({
            type: 'project',
            id: proj.id,
            code: proj.code,
            name: proj.name,
            status: proj.status,
          });
          await this.populateProjectAncestors(proj, ancestors);
        }
      }
      const links = await GovernanceLinkRepository.getLinksFor('milestone', mls.id);
      links.forEach((l) => {
        children.push({
          type: l.targetType as any,
          id: l.targetId,
          code: l.targetCode,
          name: l.targetName || l.targetId,
        });
      });
    } else if (entityType === 'release') {
      const rel = await ReleaseRepository.findById(id);
      if (!rel) return null;
      currentNode = {
        type: 'release',
        id: rel.id,
        code: rel.code,
        name: `${rel.name} (${rel.version})`,
        status: rel.status,
        priority: rel.health,
      };
      if (rel.projectId) {
        const proj = await ProjectRepository.findById(rel.projectId);
        if (proj) {
          ancestors.unshift({
            type: 'project',
            id: proj.id,
            code: proj.code,
            name: proj.name,
            status: proj.status,
          });
          await this.populateProjectAncestors(proj, ancestors);
        }
      }
      const items = await ReleaseRepository.getReleaseItems(rel.id);
      items.forEach((item) => {
        children.push({
          type: item.itemType as any,
          id: item.itemId,
          code: item.itemCode,
          name: item.itemTitle || item.itemId,
          status: item.status,
          progress: item.progress,
        });
      });
    }

    if (!currentNode) return null;

    // Populate connected governance records for work items
    const governance: NonNullable<TraceabilityChain['governance']> = {
      risks: [],
      issues: [],
      dependencies: [],
      milestones: [],
      releases: [],
    };

    if (!['risk', 'issue', 'dependency', 'milestone', 'release'].includes(entityType)) {
      const backlinks = await GovernanceLinkRepository.getBacklinks(entityType as any, id);
      for (const link of backlinks) {
        if (link.governanceType === 'risk') {
          const r = await RiskRepository.findById(link.governanceId);
          if (r) {
            governance.risks?.push({
              type: 'risk',
              id: r.id,
              code: r.code,
              name: r.title,
              status: r.status,
              severity: r.severity,
            });
          }
        } else if (link.governanceType === 'issue') {
          const iss = await IssueRepository.findById(link.governanceId);
          if (iss) {
            governance.issues?.push({
              type: 'issue',
              id: iss.id,
              code: iss.code,
              name: iss.title,
              status: iss.status,
              severity: iss.severity,
              priority: iss.priority,
            });
          }
        } else if (link.governanceType === 'milestone') {
          const mls = await MilestoneRepository.findById(link.governanceId);
          if (mls) {
            governance.milestones?.push({
              type: 'milestone',
              id: mls.id,
              code: mls.code,
              name: mls.name,
              status: mls.status,
              progress: mls.progress,
            });
          }
        }
      }

      // Dependencies involving this entity
      const deps = await DependencyRepository.findAll({ entityId: id });
      for (const d of deps) {
        governance.dependencies?.push({
          type: 'dependency',
          id: d.id,
          code: d.code,
          name: `${d.sourceEntityName} -> ${d.targetEntityName} (${d.dependencyType})`,
          status: d.status,
        });
      }
    }

    return {
      entity: currentNode,
      ancestors,
      children,
      governance,
    };
  },

  async populateTaskAncestors(task: any, ancestors: TraceabilityNode[]) {
    // Story
    if (task.storyId) {
      const story = await StoryRepository.findById(task.storyId);
      if (story) {
        ancestors.unshift({
          type: 'story',
          id: story.id,
          code: story.code,
          name: story.title,
          status: story.status,
          priority: story.priority,
          progress: story.progress,
        });
        await this.populateStoryAncestors(story, ancestors);
        return;
      }
    }
    // If no story or story didn't have feature, check feature on task
    if (task.featureId) {
      const feature = await FeatureRepository.findById(task.featureId);
      if (feature) {
        ancestors.unshift({
          type: 'feature',
          id: feature.id,
          code: feature.code,
          name: feature.name,
          status: feature.status,
          priority: feature.priority,
          progress: feature.progress,
        });
        await this.populateFeatureAncestors(feature, ancestors);
        return;
      }
    }
    // If no feature on task, check epic on task
    if (task.epicId) {
      const epic = await EpicRepository.findById(task.epicId);
      if (epic) {
        ancestors.unshift({
          type: 'epic',
          id: epic.id,
          code: epic.code,
          name: epic.name,
          status: epic.status,
          priority: epic.priority,
          progress: epic.progress,
        });
        await this.populateEpicAncestors(epic, ancestors);
        return;
      }
    }
    // Fallback to project
    if (task.projectId) {
      const proj = await ProjectRepository.findById(task.projectId);
      if (proj) {
        ancestors.unshift({
          type: 'project',
          id: proj.id,
          code: proj.code,
          name: proj.name,
          status: proj.status,
        });
        await this.populateProjectAncestors(proj, ancestors);
      }
    }
  },

  async populateStoryAncestors(story: any, ancestors: TraceabilityNode[]) {
    if (story.featureId) {
      const feature = await FeatureRepository.findById(story.featureId);
      if (feature) {
        ancestors.unshift({
          type: 'feature',
          id: feature.id,
          code: feature.code,
          name: feature.name,
          status: feature.status,
          priority: feature.priority,
          progress: feature.progress,
        });
        await this.populateFeatureAncestors(feature, ancestors);
        return;
      }
    }
    if (story.epicId) {
      const epic = await EpicRepository.findById(story.epicId);
      if (epic) {
        ancestors.unshift({
          type: 'epic',
          id: epic.id,
          code: epic.code,
          name: epic.name,
          status: epic.status,
          priority: epic.priority,
          progress: epic.progress,
        });
        await this.populateEpicAncestors(epic, ancestors);
        return;
      }
    }
    if (story.projectId) {
      const proj = await ProjectRepository.findById(story.projectId);
      if (proj) {
        ancestors.unshift({
          type: 'project',
          id: proj.id,
          code: proj.code,
          name: proj.name,
          status: proj.status,
        });
        await this.populateProjectAncestors(proj, ancestors);
      }
    }
  },

  async populateFeatureAncestors(feature: any, ancestors: TraceabilityNode[]) {
    if (feature.epicId) {
      const epic = await EpicRepository.findById(feature.epicId);
      if (epic) {
        ancestors.unshift({
          type: 'epic',
          id: epic.id,
          code: epic.code,
          name: epic.name,
          status: epic.status,
          priority: epic.priority,
          progress: epic.progress,
        });
        await this.populateEpicAncestors(epic, ancestors);
        return;
      }
    }
    if (feature.projectId) {
      const proj = await ProjectRepository.findById(feature.projectId);
      if (proj) {
        ancestors.unshift({
          type: 'project',
          id: proj.id,
          code: proj.code,
          name: proj.name,
          status: proj.status,
        });
        await this.populateProjectAncestors(proj, ancestors);
      }
    }
  },

  async populateEpicAncestors(epic: any, ancestors: TraceabilityNode[]) {
    if (epic.projectId) {
      const proj = await ProjectRepository.findById(epic.projectId);
      if (proj) {
        ancestors.unshift({
          type: 'project',
          id: proj.id,
          code: proj.code,
          name: proj.name,
          status: proj.status,
        });
        await this.populateProjectAncestors(proj, ancestors);
      }
    }
  },

  async populateProjectAncestors(project: any, ancestors: TraceabilityNode[]) {
    let portfolioId = project.portfolioId;
    if (project.productId) {
      const product = await ProductRepository.findById(project.productId);
      if (product) {
        ancestors.unshift({
          type: 'product',
          id: product.id,
          code: product.code,
          name: product.name,
          status: product.status,
        });
        if (!portfolioId && product.portfolioId) {
          portfolioId = product.portfolioId;
        }
      }
    }

    if (portfolioId) {
      const portfolio = await PortfolioRepository.findById(portfolioId);
      if (portfolio) {
        ancestors.unshift({
          type: 'portfolio',
          id: portfolio.id,
          code: portfolio.code,
          name: portfolio.name,
          status: portfolio.status,
        });

        // Check if there are OKR/Goals linked
        const allGoals = await GoalRepository.findAll();
        const goals = allGoals.filter((g) => g.portfolioId === portfolio.id);
        if (goals.length > 0) {
          ancestors.unshift({
            type: 'goal',
            id: goals[0].id,
            name: `${goals[0].objective} (${goals[0].progress}%)`,
            status: goals[0].status,
            progress: goals[0].progress,
          });
        }
      }
    }
  },
};
