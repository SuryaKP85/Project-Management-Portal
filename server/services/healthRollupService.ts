import { Project, Product, DerivedHealthRollup, DerivedHealthProjectEntry } from '../models/types';
import {
  ProjectHealthService,
  ProjectHealthResult,
  HealthBand,
  HEALTH_MODEL_VERSION,
  resolveBand,
} from './projectHealthService';

/**
 * Sprint 11.2C — derived health for containers of projects.
 *
 * ProjectHealthService remains the only place a project is scored. This module
 * does two things and nothing else: resolves which projects belong to a
 * container using the stored relationship fields, and aggregates their
 * canonical results. The aggregate is level-agnostic — it takes a project set,
 * never a container type — so a future Program level reuses it unchanged.
 *
 * Aggregation rule (the executive-overview rule, applied everywhere): an
 * unweighted mean of scores, reported only when every project in scope was
 * scored. A partial mean is never presented as a container's health.
 */

export const HEALTH_BANDS: HealthBand[] = ['Excellent', 'Healthy', 'Monitor', 'At Risk', 'Critical'];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A project's portfolio is its own stored portfolioId, falling back to the
 * stored portfolioId of its product. Both are canonical fields; nothing is
 * inferred beyond them.
 */
export function resolvePortfolioIdOf(project: Project, productById: Map<string, Product>): string | undefined {
  return project.portfolioId || (project.productId ? productById.get(project.productId)?.portfolioId : undefined);
}

export function projectsInPortfolio(projects: Project[], products: Product[], portfolioId: string): Project[] {
  const productById = new Map<string, Product>(products.map((p) => [p.id, p]));
  return projects.filter((p) => resolvePortfolioIdOf(p, productById) === portfolioId);
}

/** Product -> Project is first-class: the stored productId, no detour via the portfolio. */
export function projectsInProduct(projects: Project[], productId: string): Project[] {
  return projects.filter((p) => p.productId === productId);
}

/**
 * Pure aggregation over canonical results. `projectCount` is the size of the
 * scope; `results` are the projects that were actually scored.
 */
export function aggregateHealth(results: ProjectHealthResult[], projectCount: number): DerivedHealthRollup {
  const byBand = {} as Record<string, number>;
  for (const band of HEALTH_BANDS) byBand[band] = 0;

  let scoreSum = 0;
  for (const r of results) {
    byBand[r.band] = (byBand[r.band] ?? 0) + 1;
    scoreSum += r.score;
  }

  const computedFor = results.length;
  const complete = computedFor === projectCount;
  const averageScore = complete && computedFor > 0 ? round1(scoreSum / computedFor) : null;

  return {
    averageScore,
    // The band comes from the canonical resolver, never a second threshold table.
    band: averageScore === null ? null : resolveBand(averageScore),
    byBand,
    projectCount,
    computedFor,
    excludedCount: Math.max(0, projectCount - computedFor),
    complete,
    empty: projectCount === 0,
    healthModel: HEALTH_MODEL_VERSION,
  };
}

export interface HealthComputation {
  results: Map<string, ProjectHealthResult>;
  /** Ids whose computation rejected; they count as excluded, never as zero. */
  failed: string[];
}

/**
 * Scores each project once via ProjectHealthService. A rejection for one
 * project is isolated: it is recorded and the others still resolve, so the
 * rollup reports an incomplete aggregate rather than failing the request.
 */
export async function computeHealthFor(projects: Project[], now?: Date): Promise<HealthComputation> {
  const settled = await Promise.allSettled(
    projects.map((p) => ProjectHealthService.computeHealth(p, now ? { now } : {}))
  );
  const results = new Map<string, ProjectHealthResult>();
  const failed: string[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      results.set(outcome.value.projectId, outcome.value);
    } else {
      failed.push(projects[i].id);
      console.warn(`Project health computation failed for ${projects[i].id}:`, outcome.reason?.message || outcome.reason);
    }
  });
  return { results, failed };
}

export function toProjectEntries(projects: Project[], results: Map<string, ProjectHealthResult>): DerivedHealthProjectEntry[] {
  return projects.map((p) => {
    const r = results.get(p.id);
    return {
      id: p.id,
      code: p.code || p.id,
      name: p.name,
      status: p.status,
      score: r ? r.score : null,
      band: r ? r.band : null,
      coverageRatio: r ? r.coverage.ratio : null,
    };
  });
}

/** Derived health for one container's project set: rollup plus per-project detail. */
export async function buildContainerHealth(
  projects: Project[],
  now?: Date
): Promise<{ derivedHealth: DerivedHealthRollup; projects: DerivedHealthProjectEntry[] }> {
  const { results } = await computeHealthFor(projects, now);
  return {
    derivedHealth: aggregateHealth(Array.from(results.values()), projects.length),
    projects: toProjectEntries(projects, results),
  };
}
