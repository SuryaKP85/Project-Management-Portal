/**
 * Sprint 22B — V2 Project Status Report (Projects → project detail).
 *
 * Renders the live report from GET /projects/:id/status-report. The server
 * builds every figure; nothing is calculated or filled in here. Every value
 * reaches the page through escapeHtml, and the print button prints only the
 * report card (print rules scoped to body.print-status-report).
 */

import { ProjectService } from './services/projectService.js';
import { escapeHtml } from './safeHtml.js';

const e = (v) => escapeHtml(v ?? '');
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : e(v));

const BAND_CLASS = { Excellent: 'bg-success', Healthy: 'bg-success', Monitor: 'bg-info text-dark', 'At Risk': 'bg-warning text-dark', Critical: 'bg-danger' };
const badgeFor = (band) => (Object.hasOwn(BAND_CLASS, band) ? BAND_CLASS[band] : 'bg-secondary');

function section(title, body) {
  return `<section class="status-report-section mb-3"><h6 class="fw-bold mb-2">${e(title)}</h6>${body}</section>`;
}

function list(items, line, empty) {
  if (!items || items.length === 0) return `<p class="text-muted small mb-0">${e(empty)}</p>`;
  return `<ul class="small mb-0 ps-3">${items.map((i) => `<li>${line(i)}</li>`).join('')}</ul>`;
}

function counts(record) {
  const entries = Object.entries(record || {});
  if (entries.length === 0) return '<span class="text-muted">none</span>';
  return entries.map(([k, v]) => `${e(k)}: <strong>${e(v)}</strong>`).join(' · ');
}

const coded = (i) => `${i.code ? `<span class="font-mono text-muted me-1">${e(i.code)}</span>` : ''}${e(i.title ?? i.name)}`;
const dated = (label, value) => (value ? ` <span class="text-muted">(${e(label)} ${e(value)})</span>` : '');
const endpoint = (p) => (p.hidden ? `<em class="text-muted">${e(p.label)}</em>` : e(p.label));

/** The report as HTML (all values escaped). */
export function renderStatusReport(report) {
  const { meta, project, health, schedule, delivery, sprint, milestones, risks, issues, dependencies, requirements, followThrough, attention } = report;
  const generated = new Date(meta.generatedAt);
  const commercial = 'budget' in project || 'client' in project || 'sowStatus' in project;

  const header = `
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <div class="fw-bold fs-5"><span class="font-mono text-muted me-1">${e(project.code)}</span>${e(project.name)}</div>
        <div class="small text-muted">Status: <strong>${e(project.status)}</strong> · Manager: ${project.manager ? e(project.manager.name) : `<em>${e(project.managerUnavailableReason || 'Not recorded')}</em>`}</div>
        ${commercial ? `<div class="small text-muted">Client: ${dash(project.client)} · Budget: ${dash(project.budget)} · SOW: ${dash(project.sowStatus)}</div>` : ''}
      </div>
      <div class="text-end">
        <span class="badge ${badgeFor(health.band)}">${e(health.band)} ${e(health.score)}</span>
        <div class="small text-muted mt-1">Generated ${e(Number.isNaN(generated.getTime()) ? meta.generatedAt : generated.toLocaleString())}</div>
      </div>
    </div>`;

  const attentionHtml = list(attention, (a) => `<span class="badge ${a.level === 'critical' ? 'bg-danger' : 'bg-warning text-dark'} me-1">${e(a.level)}</span>${e(a.message)}`, 'Nothing needs attention right now.');

  const healthHtml = `
    <div class="small mb-1">Score <strong>${e(health.score)}</strong> (${e(health.band)}) · measured on ${e(health.coverage.measuredFactors)} of ${e(health.coverage.applicableFactors)} factors</div>
    ${list(health.topFactors, (f) => `${e(f.label)} <span class="text-muted">(${e(f.delta)})</span>`, 'No negative health factors.')}
    <div class="small mt-2">Schedule: ${dash(schedule.startDate)} → ${dash(schedule.endDate)} · days remaining: ${dash(schedule.daysRemaining)}${schedule.isPastEnd ? ' · <strong class="text-danger">past end date</strong>' : ''}</div>
    <div class="small">Expected progress: ${schedule.expectedProgressPct === null ? '—' : `${e(schedule.expectedProgressPct)}%`} · Reported Progress: ${schedule.reportedProgressPct === null ? '—' : `${e(schedule.reportedProgressPct)}%`} <span class="badge bg-light text-dark border">Manual</span></div>`;

  const deliveryHtml = `
    <div class="small mb-1">${counts(delivery.counts)}</div>
    <div class="small mb-1">Blocked: <strong>${e(delivery.blocked.total)}</strong> · Overdue: <strong>${e(delivery.overdue.length)}</strong></div>
    ${list(delivery.overdue, (i) => `${e(i.type)} ${coded(i)} — ${e(i.status)}${dated('due', i.dueDate)}`, 'No overdue delivery items.')}
    <p class="small text-muted mt-1 mb-0">${e(delivery.statusCaveat)}</p>`;

  const sprintHtml = sprint.active
    ? `<div class="small">${e(sprint.active.name)} (${dash(sprint.active.startDate)} → ${dash(sprint.active.endDate)}) · ${e(sprint.active.stories)} stories · committed ${e(sprint.active.committedPoints)} pts · completed ${e(sprint.active.completedPoints)} pts</div>`
    : `<p class="text-muted small mb-0">${e(sprint.reason)}</p>`;

  const milestoneLine = (m) => `${coded(m)} — ${e(m.status)} / ${e(m.health)}${dated('target', m.targetDate)}`;
  const milestonesHtml = `<div class="small fw-semibold">At risk or missed</div>${list(milestones.atRiskOrMissed, milestoneLine, 'None.')}
    <div class="small fw-semibold mt-2">Upcoming</div>${list(milestones.upcoming, milestoneLine, 'None in the next 30 days.')}`;

  const governanceHtml = (g, noun) => `
    <div class="small mb-1">Open: <strong>${e(g.open)}</strong> · ${counts(g.bySeverity)}</div>
    <div class="small fw-semibold">Critical</div>${list(g.critical, (r) => `${coded(r)} — ${e(r.status)}`, `No open critical ${noun}.`)}
    <div class="small fw-semibold mt-2">High</div>${list(g.high, (r) => `${coded(r)} — ${e(r.status)}`, `No open high ${noun}.`)}
    <div class="small fw-semibold mt-2">Overdue</div>${list(g.overdue, (r) => `${coded(r)}${dated('target', r.targetResolutionDate)}`, `No overdue ${noun}.`)}`;

  const depLine = (d) => `${e(d.code)} ${endpoint(d.source)} → ${endpoint(d.target)} <span class="text-muted">(${e(d.dependencyType)}, ${e(d.criticality)})</span>${dated('due', d.date)}`;
  const dependenciesHtml = `<div class="small mb-1">Open: <strong>${e(dependencies.open)}</strong></div>
    <div class="small fw-semibold">Blocked</div>${list(dependencies.blocked, depLine, 'None.')}
    <div class="small fw-semibold mt-2">At risk</div>${list(dependencies.atRisk, depLine, 'None.')}
    <div class="small fw-semibold mt-2">Overdue</div>${list(dependencies.overdue, depLine, 'None.')}`;

  const reqLine = (r) => `${coded(r)} — ${e(r.status)}, ${e(r.priority)}${dated('target', r.targetDate)}`;
  const requirementsHtml = `<div class="small mb-1">Total: <strong>${e(requirements.total)}</strong> · ${counts(requirements.byStatus)}</div>
    <div class="small fw-semibold">Awaiting approval</div>${list(requirements.awaitingApproval, reqLine, 'None.')}
    <div class="small fw-semibold mt-2">Approved, not decomposed for the current revision</div>${list(requirements.notDecomposed, reqLine, 'None.')}
    <div class="small fw-semibold mt-2">Overdue (draft or in review)</div>${list(requirements.overdue, reqLine, 'None.')}`;

  const ft = followThrough;
  const followHtml = `
    <div class="small fw-semibold">Action items (open ${e(ft.actionItems.open)})</div>
    ${list([...ft.actionItems.overdue.map((a) => ({ ...a, why: 'overdue' })), ...ft.actionItems.blocked.filter((b) => !ft.actionItems.overdue.some((o) => o.id === b.id)).map((a) => ({ ...a, why: 'blocked' }))], (a) => `${e(a.title)} — ${e(a.why)}${dated('due', a.dueDate)}`, 'No overdue or blocked action items.')}
    <div class="small fw-semibold mt-2">Waiting for (open ${e(ft.waitingFor.open)})</div>
    ${list([...new Map([...ft.waitingFor.followUpNeeded, ...ft.waitingFor.pastExpected].map((w) => [w.id, w])).values()], (w) => `${e(w.title)} — ${e(w.status)}${dated('expected', w.expectedDate)}`, 'Nothing needs follow-up.')}
    <div class="small fw-semibold mt-2">Follow-ups (open ${e(ft.followUps.open)})</div>
    ${list(ft.followUps.overdue, (f) => `${e(f.title)}${dated('due', f.dueDate)}`, 'No overdue follow-ups.')}
    <div class="small fw-semibold mt-2">Upcoming meetings</div>
    ${list(ft.upcomingMeetings, (m) => `${e(m.title)} <span class="text-muted">(${e(new Date(m.scheduledAt).toLocaleString())})</span>`, 'None in the next 14 days.')}
    ${ft.pastScheduledMeetings.length ? `<div class="small fw-semibold mt-2">Still marked Scheduled after their date</div>${list(ft.pastScheduledMeetings, (m) => e(m.title), '')}` : ''}`;

  const notesHtml = list(meta.notes, (n) => e(n), '');

  return `
    ${header}
    ${section('Attention', attentionHtml)}
    ${section('Health & Schedule', healthHtml)}
    ${section('Delivery', deliveryHtml)}
    ${section('Active Sprint', sprintHtml)}
    ${section('Milestones', milestonesHtml)}
    ${section('Risks', governanceHtml(risks, 'risks'))}
    ${section('Issues', governanceHtml(issues, 'issues'))}
    ${section('Dependencies', dependenciesHtml)}
    ${section('Requirements', requirementsHtml)}
    ${section('Follow-through', followHtml)}
    ${section('Notes & limitations', notesHtml)}`;
}

export const StatusReportModule = {
  projectId: null,

  /** Loads and shows the report for a project in the project detail view. */
  async mount(projectId) {
    this.projectId = projectId;
    const container = document.getElementById('project-status-report-container');
    if (!container) return;
    this.bindButtons();
    container.innerHTML = '<p class="text-muted small mb-0" role="status"><i class="fa-solid fa-spinner fa-spin me-2"></i>Building the status report…</p>';
    try {
      const report = await ProjectService.getStatusReport(projectId);
      if (this.projectId !== projectId) return; // another project was opened meanwhile
      container.innerHTML = renderStatusReport(report);
    } catch (err) {
      if (this.projectId !== projectId) return;
      container.innerHTML = `<p class="text-danger small mb-0" role="alert"><i class="fa-solid fa-circle-exclamation me-1"></i>The status report could not be loaded: ${e(err?.message || 'unknown error')}</p>`;
    }
  },

  bindButtons() {
    const refresh = document.getElementById('project-status-report-refresh');
    if (refresh && !refresh.dataset.bound) {
      refresh.dataset.bound = 'true';
      refresh.addEventListener('click', () => { if (this.projectId) this.mount(this.projectId); });
    }
    const print = document.getElementById('project-status-report-print');
    if (print && !print.dataset.bound) {
      print.dataset.bound = 'true';
      print.addEventListener('click', () => {
        document.body.classList.add('print-status-report');
        const done = () => { document.body.classList.remove('print-status-report'); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        window.print();
      });
    }
  },
};
