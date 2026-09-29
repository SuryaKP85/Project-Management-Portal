import crypto from 'crypto';
import { AIService } from './aiService';
import { AiContextService, AiContextActor, AiAuthorizedContext, AiContextScope } from './aiContextService';
import { ActivityService } from './activityService';
import { HEALTH_MODEL_VERSION } from './projectHealthService';

/**
 * Sprint 13 — AI experience completion: Project Copilot insights, the
 * executive AI report and AI email drafting, on the existing V2 architecture.
 *
 * Same trust model as the Sprint 7A assistant: the browser supplies at most an
 * identifier and a choice from a fixed list; every fact the provider sees is
 * built server-side by AiContextService from the authenticated identity, and
 * travels through the prompt guard inside the providers. Outputs are cleaned
 * here (length caps, control characters stripped, recommendation fields
 * whitelisted) and rendered as text by the browser. Nothing is sent, stored or
 * changed as a result of an AI answer.
 */

export const REPORT_PERIODS = ['weekly', 'monthly', 'quarterly'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Server-side purpose for each existing composer template; the browser only sends the key. */
export const EMAIL_TEMPLATE_PURPOSES: Record<string, string> = {
  customer_update: 'weekly customer progress update',
  executive_status: 'executive status briefing',
  risk_escalation: 'urgent risk escalation to the steering committee',
  delay_notification: 'schedule baseline adjustment notice',
  resource_request: 'request for additional delivery resources',
  weekend_approval: 'request for weekend work shift approval',
};

const MAX_TEXT = 8000;
const MAX_RECOMMENDATIONS = 6;
const MAX_SUBJECT = 255;
const MAX_BODY = 20000;
const URGENCIES = new Set(['low', 'medium', 'high', 'critical']);

/** Multi-line text: drops control characters except tab, CR and LF; caps length. */
function cleanText(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}

/** Single-line text: all control characters become spaces; whitespace collapsed; capped. */
function cleanLine(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export interface SafeRecommendation {
  category: string;
  title: string;
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

/** Whitelists recommendation fields; provider extras such as actionPayload never reach the browser. */
export function safeRecommendations(raw: unknown): SafeRecommendation[] {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_RECOMMENDATIONS).map((r: any) => ({
    category: cleanLine(r?.category, 60) || 'Insight',
    title: cleanLine(r?.title, 160) || 'Recommendation',
    description: cleanText(r?.description, 600),
    urgency: URGENCIES.has(r?.urgency) ? r.urgency : 'medium',
  }));
}

type Actor = AiContextActor & { ipAddress?: string };

/** Metadata-only audit through the existing activity architecture: no prompt, answer or context text. */
async function audit(actor: Actor, operation: string, details: Record<string, unknown>): Promise<void> {
  await ActivityService.logActivity({
    entityType: 'ai',
    entityId: `aiq_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    action: 'ai_query',
    actorId: actor.userId,
    actorName: `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email || actor.userId,
    details: { operation, role: actor.role, ...details },
    ipAddress: actor.ipAddress,
  });
}

/** Deterministic report figures, derived only from the caller's authorised AI context. */
export function buildReportFigures(context: AiAuthorizedContext) {
  const included = context.projects;
  const healthBands: Record<string, number> = { Excellent: 0, Healthy: 0, Monitor: 0, 'At Risk': 0, Critical: 0 };
  for (const p of included) {
    if (p.health) healthBands[p.health.band] = (healthBands[p.health.band] ?? 0) + 1;
  }
  const attentionProjects = included
    .filter((p) => p.health && (p.health.band === 'At Risk' || p.health.band === 'Critical'))
    .sort((a, b) => (a.health!.score - b.health!.score) || a.code.localeCompare(b.code))
    .map((p) => ({
      code: p.code,
      name: p.name,
      band: p.health!.band,
      score: p.health!.score,
      topFactors: p.health!.topNegativeFactors.map((f) => f.label),
    }));
  const progressValues = included.map((p) => (typeof p.progress === 'number' ? p.progress : 0));
  return {
    projectsInScope: context.meta.projectsInScope,
    projectsIncluded: included.length,
    truncated: context.meta.truncated,
    averageProgress: progressValues.length ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length) : null,
    completedProjects: included.filter((p) => p.status === 'completed').length,
    healthBands,
    attentionProjects,
    governance: context.governance ?? null,
    myWork: {
      totalAssigned: context.myWork.totalAssigned,
      inProgress: context.myWork.inProgress,
      overdue: context.myWork.overdue,
    },
    strategy: {
      projectsWithoutAlignment: context.meta.strategy.projectsWithoutAlignment,
      initiativesIncluded: context.meta.strategy.initiativesIncluded,
      goalsIncluded: context.meta.strategy.goalsIncluded,
    },
  };
}

/** Splits a provider draft into subject and body; falls back to a default subject. */
export function splitDraft(text: string, defaultSubject: string): { subject: string; body: string } {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  const match = first >= 0 ? /^\s*subject\s*:\s*(.+)$/i.exec(lines[first]) : null;
  const subject = cleanLine(match ? match[1] : defaultSubject, MAX_SUBJECT) || cleanLine(defaultSubject, MAX_SUBJECT);
  const bodyLines = match ? lines.slice(first + 1) : lines;
  const body = cleanText(bodyLines.join('\n').trim(), MAX_BODY);
  return { subject, body };
}

export interface ProjectInsightsResult {
  projectCode: string;
  projectName: string;
  provider: string;
  scope: AiContextScope;
  summary: string;
  recommendations: SafeRecommendation[];
  health: { basis: 'deterministic-calculation'; band: string; score: number } | null;
  meta: { generatedAt: string; healthModel: string };
}

export interface ExecutiveReportResult {
  period: ReportPeriod;
  generatedAt: string;
  scope: AiContextScope;
  provider: string;
  narrative: string;
  figures: ReturnType<typeof buildReportFigures>;
  meta: { projectsInScope: number; projectsIncluded: number; truncated: boolean; healthModel: string };
}

export interface EmailDraftResult {
  subject: string;
  body: string;
  provider: string;
  projectCode: string;
  templateKey: string;
}

export const AiCopilotService = {
  /** Project Copilot: insights for one project the caller may use. Null when missing or out of scope. */
  async projectInsights(actor: Actor, projectRef: string): Promise<ProjectInsightsResult | null> {
    const ctx = await AiContextService.buildProjectContext(actor, projectRef);
    if (!ctx) return null;
    const response = await AIService.getProjectInsights(ctx.project as unknown as Record<string, any>);
    await audit(actor, 'project_insights', { provider: response.provider, scope: ctx.scope, projectCode: ctx.project.code });
    const health = ctx.project.health;
    return {
      projectCode: ctx.project.code,
      projectName: ctx.project.name,
      provider: response.provider,
      scope: ctx.scope,
      summary: cleanText(response.text, MAX_TEXT),
      recommendations: safeRecommendations(response.recommendations),
      health: health ? { basis: health.basis, band: health.band, score: health.score } : null,
      meta: { generatedAt: ctx.meta.generatedAt, healthModel: ctx.meta.healthModel },
    };
  },

  /** AI report: deterministic figures plus a provider narrative, from the caller's authorised context. */
  async executiveReport(actor: Actor, period: ReportPeriod): Promise<ExecutiveReportResult> {
    const context = await AiContextService.buildContext(actor);
    const figures = buildReportFigures(context);
    const response = await AIService.generateExecutiveReport({
      period,
      figures,
      projects: context.projects as unknown as Array<Record<string, any>>,
    });
    await audit(actor, 'executive_report', { provider: response.provider, scope: context.scope, period, projectsIncluded: figures.projectsIncluded });
    return {
      period,
      generatedAt: new Date().toISOString(),
      scope: context.scope,
      provider: response.provider,
      narrative: cleanText(response.text, MAX_TEXT),
      figures,
      meta: {
        projectsInScope: context.meta.projectsInScope,
        projectsIncluded: figures.projectsIncluded,
        truncated: context.meta.truncated,
        healthModel: HEALTH_MODEL_VERSION,
      },
    };
  },

  /**
   * AI email drafting for one in-scope project. Returns text only; it never
   * sends. Sending stays with the Sprint 10B confirmed Outlook flow.
   */
  async draftEmail(actor: Actor, projectRef: string, templateKey: string): Promise<EmailDraftResult | null> {
    const ctx = await AiContextService.buildProjectContext(actor, projectRef);
    if (!ctx) return null;
    const p = ctx.project;
    const purpose = EMAIL_TEMPLATE_PURPOSES[templateKey] || EMAIL_TEMPLATE_PURPOSES.executive_status;
    const keyHighlights = [
      `Email purpose: ${purpose}`,
      `Progress: ${p.progress}%`,
      `Delivery risk: ${p.risk}`,
      ...(p.health ? [`Deterministic health: ${p.health.band} (${p.health.score}/100)`] : []),
      ...(p.health ? p.health.topNegativeFactors.map((f) => `Health factor: ${f.label}`) : []),
      ...(p.endDate ? [`Target end date: ${p.endDate}`] : []),
      ...p.strategy.initiatives.map((i) => `Roadmap initiative: ${i.name}`),
    ].slice(0, 20);

    const response = await AIService.draftExecutiveEmail({
      project: `${p.name} (${p.code})`,
      client: p.client || 'Stakeholders',
      status: p.status,
      keyHighlights,
    });
    const { subject, body } = splitDraft(response.text, `${p.name} status update`);
    await audit(actor, 'draft_email', { provider: response.provider, scope: ctx.scope, projectCode: p.code, templateKey });
    return { subject, body, provider: response.provider, projectCode: p.code, templateKey };
  },
};
