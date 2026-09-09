import { apiClient } from './apiClient.js';

/**
 * Translate legacy V1 issue-form fields into the canonical V2 API contract.
 * The Governance UI still uses a few legacy names, so the adapter keeps the
 * UI stable while ensuring the server only receives V2 fields.
 */
function toApiPayload(issueData = {}) {
  const payload = { ...issueData };

  if (payload.rootCause !== undefined && payload.rootCauseNotes === undefined) {
    payload.rootCauseNotes = payload.rootCause;
  }
  delete payload.rootCause;

  if (payload.dueDate !== undefined && payload.targetResolutionDate === undefined) {
    payload.targetResolutionDate = payload.dueDate;
  }
  delete payload.dueDate;

  if (payload.resolutionNotes !== undefined && payload.resolution === undefined) {
    payload.resolution = payload.resolutionNotes;
  }
  delete payload.resolutionNotes;

  // Escalation is governance metadata in V2, not an IssueStatus. Preserve
  // legacy form compatibility by translating the old option to Investigating.
  if (payload.status === 'Escalated') payload.status = 'Investigating';
  delete payload.escalationLevel;

  return payload;
}

/** Add read-only compatibility aliases for existing V1 UI renderers. */
function fromApiIssue(issue) {
  if (!issue) return issue;
  return {
    ...issue,
    rootCause: issue.rootCause ?? issue.rootCauseNotes ?? '',
    dueDate: issue.dueDate ?? issue.targetResolutionDate ?? '',
    resolutionNotes: issue.resolutionNotes ?? issue.resolution ?? '',
    escalationLevel: issue.escalationLevel ?? 'None',
  };
}

export class IssueService {
  static async getIssues(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/issues${qs}`);
    return (data.issues || []).map(fromApiIssue);
  }

  static async getIssueById(id) {
    const data = await apiClient.get(`/issues/${id}`);
    return fromApiIssue(data.issue);
  }

  static async createIssue(issueData) {
    const data = await apiClient.post('/issues', toApiPayload(issueData));
    return fromApiIssue(data.issue);
  }

  static async updateIssue(id, updates) {
    const data = await apiClient.patch(`/issues/${id}`, toApiPayload(updates));
    return fromApiIssue(data.issue);
  }

  static async deleteIssue(id) {
    return apiClient.delete(`/issues/${id}`);
  }

  static async getRootCauses(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString() ? `?${query.toString()}` : '';
    const data = await apiClient.get(`/issues/analytics/root-causes${qs}`);
    return data.summary;
  }

  static async linkItem(issueId, targetType, targetId, targetCode, targetName) {
    const data = await apiClient.post(`/issues/${issueId}/links`, { targetType, targetId, targetCode, targetName });
    return data.link;
  }

  static async unlinkItem(issueId, linkId) {
    return apiClient.delete(`/issues/${issueId}/links/${linkId}`);
  }
}
