import { RiskRepository } from '../repositories/riskRepository';
import { IssueRepository } from '../repositories/issueRepository';
import { DependencyRepository } from '../repositories/dependencyRepository';
import { MilestoneRepository } from '../repositories/milestoneRepository';
import { ReleaseRepository } from '../repositories/releaseRepository';
import { ProjectRepository } from '../repositories/projectRepository';
import { ActivityRepository } from '../repositories/activityRepository';
import { RiskService } from './riskService';

export interface GovernanceDashboardSummary {
  kpis: {
    criticalRisksCount: number;
    highRisksCount: number;
    openIssuesCount: number;
    criticalIssuesCount: number;
    blockingDependenciesCount: number;
    overdueDependenciesCount: number;
    upcomingMilestonesCount: number;
    atRiskMilestonesCount: number;
    activeReleasesCount: number;
    atRiskReleasesCount: number;
  };
  heatmapSummary: any;
  projectScorecards: Array<{
    projectId: string;
    projectCode: string;
    projectName: string;
    criticalRisks: number;
    openIssues: number;
    blockingDependencies: number;
    milestonesAtRisk: number;
    releasesAtRisk: number;
    overallHealth: 'On Track' | 'At Risk' | 'Critical';
  }>;
  recentActivities: any[];
}

export const GovernanceService = {
  async getDashboardSummary(filter?: { portfolioId?: string; productId?: string }): Promise<GovernanceDashboardSummary> {
    const [allRisks, allIssues, allDeps, allMilestones, allReleases, allProjects, recentActs] = await Promise.all([
      RiskRepository.findAll(filter),
      IssueRepository.findAll(filter),
      DependencyRepository.findAll(),
      MilestoneRepository.findAll(filter),
      ReleaseRepository.findAll(filter),
      ProjectRepository.findAll(),
      ActivityRepository.findRecent(30),
    ]);

    // Calculate KPIs
    const criticalRisksCount = allRisks.filter((r) => r.severity === 'Critical' && r.status !== 'Closed').length;
    const highRisksCount = allRisks.filter((r) => r.severity === 'High' && r.status !== 'Closed').length;

    const openIssues = allIssues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed' && i.status !== 'Rejected');
    const openIssuesCount = openIssues.length;
    const criticalIssuesCount = openIssues.filter((i) => i.severity === 'Critical' || i.severity === 'High').length;

    const blockingDependenciesCount = allDeps.filter(
      (d) => (d.dependencyType === 'Blocks' || d.status === 'At Risk') && d.status !== 'Resolved' && d.status !== 'Closed'
    ).length;
    const overdueDependenciesCount = allDeps.filter((d) => d.isOverdue).length;

    const todayStr = new Date().toISOString().split('T')[0];
    const upcomingMilestonesCount = allMilestones.filter(
      (m) => m.status !== 'Completed' && m.status !== 'Cancelled' && m.targetDate >= todayStr
    ).length;
    const atRiskMilestonesCount = allMilestones.filter(
      (m) => m.status !== 'Completed' && (m.health === 'At Risk' || m.health === 'Critical')
    ).length;

    const activeReleasesCount = allReleases.filter((r) => r.status !== 'Released' && r.status !== 'Cancelled').length;
    const atRiskReleasesCount = allReleases.filter(
      (r) => r.status !== 'Released' && (r.health === 'At Risk' || r.health === 'Off Track')
    ).length;

    const heatmap = await RiskService.getHeatmap(filter);

    // Project-by-project governance scorecard
    const projectScorecards = allProjects.map((p) => {
      const pRisks = allRisks.filter((r) => r.projectId === p.id && r.status !== 'Closed');
      const pCritRisks = pRisks.filter((r) => r.severity === 'Critical').length;

      const pIssues = allIssues.filter((i) => i.projectId === p.id && i.status !== 'Resolved' && i.status !== 'Closed');
      const pOpenIssues = pIssues.length;

      const pDeps = allDeps.filter(
        (d) =>
          (d.sourceEntityId === p.id || d.targetEntityId === p.id) &&
          (d.dependencyType === 'Blocks' || d.isOverdue) &&
          d.status !== 'Resolved'
      );
      const pBlockingDeps = pDeps.length;

      const pMilestones = allMilestones.filter((m) => m.projectId === p.id);
      const pMlsAtRisk = pMilestones.filter((m) => m.health === 'At Risk' || m.health === 'Critical').length;

      const pReleases = allReleases.filter((r) => r.projectId === p.id);
      const pRelAtRisk = pReleases.filter((r) => r.health === 'At Risk' || r.health === 'Off Track').length;

      let overallHealth: 'On Track' | 'At Risk' | 'Critical' = 'On Track';
      if (pCritRisks > 0 || pMlsAtRisk > 1 || pRelAtRisk > 0 || pBlockingDeps > 1) {
        overallHealth = 'Critical';
      } else if (pRisks.some((r) => r.severity === 'High') || pOpenIssues > 2 || pBlockingDeps === 1 || pMlsAtRisk === 1) {
        overallHealth = 'At Risk';
      }

      return {
        projectId: p.id,
        projectCode: p.code || p.id,
        projectName: p.name,
        criticalRisks: pCritRisks,
        openIssues: pOpenIssues,
        blockingDependencies: pBlockingDeps,
        milestonesAtRisk: pMlsAtRisk,
        releasesAtRisk: pRelAtRisk,
        overallHealth,
      };
    });

    // Filter recent activities to governance items
    const governanceActivities = recentActs.filter((a) =>
      ['risk', 'issue', 'dependency', 'milestone', 'release'].includes(a.entityType)
    );

    return {
      kpis: {
        criticalRisksCount,
        highRisksCount,
        openIssuesCount,
        criticalIssuesCount,
        blockingDependenciesCount,
        overdueDependenciesCount,
        upcomingMilestonesCount,
        atRiskMilestonesCount,
        activeReleasesCount,
        atRiskReleasesCount,
      },
      heatmapSummary: heatmap.summary,
      projectScorecards,
      recentActivities: governanceActivities,
    };
  },
};
