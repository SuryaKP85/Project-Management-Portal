/* aiEmailGenerator.js - Automated Business Email Generator & Template Engine */

import { Storage } from './storage.js';
import { MicrosoftService } from './services/microsoftService.js';
import { AiAssistantService } from './services/aiAssistantService.js';
import { ProjectService } from './services/projectService.js';

/** Sprint 10B: HTML-escapes the values interpolated into the composer markup. */
const escapeComposerHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** Sprint 10B: splits the To field on commas or semicolons. */
const parseRecipients = (value) => String(value || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);

/** Builds the mailto: link for the email-client option, including any To recipients. */
const buildMailto = (to, subject, body) =>
  `mailto:${to.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const OUTLOOK_TIMEOUT_MESSAGE = 'Microsoft did not respond in time. The email may have been sent. Check your Outlook Sent Items before trying again.';

/** Sprint 13: turns an AI draft failure into the message shown in the composer. */
const describeDraftError = (err) => {
  const status = err && err.status;
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'AI drafting is available to administrators, project managers and product managers.';
  if (status === 404) return 'That project is not available to your AI scope.';
  if (status === 429) return (err && err.message) || 'Too many AI requests. Try again shortly.';
  return 'AI drafting is unavailable right now. You can still edit and send the template.';
};

/** Turns a send failure into the message shown in the composer. */
const describeOutlookError = (err) => {
  const code = err && err.code;
  if (code === 'TIMEOUT' || code === 'MICROSOFT_TIMEOUT') return OUTLOOK_TIMEOUT_MESSAGE;
  if (code === 'MICROSOFT_PERMISSION_REQUIRED') return 'Reconnect Microsoft 365 in Settings to enable Outlook sending.';
  if (code === 'MICROSOFT_RECONNECT_REQUIRED') return 'Reconnect Microsoft 365 in Settings, then try again.';
  if (code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details.length) return err.details.join(' ');
  return (err && err.message) || 'The email could not be sent.';
};

export const AIEmailGeneratorModule = {
  /**
   * Templates Repository
   */
  templates: {
    customer_update: {
      name: 'Weekly Customer Update',
      subject: 'Project Progress Status Update - [Client Name]',
      generateBody: (params) => `Dear [Client Name] Team,

I am pleased to share our weekly executive status report for your active projects.

Key Highlights:
• Delivery Milestones: On track for upcoming sprint releases.
• Budget & Effort: Consuming effort within scheduled velocity.
• Action Items: SOW contracts currently under review.

Please reach out if you have any questions before our upcoming steering sync.

Best regards,
Enterprise Project Management Office`
    },

    executive_status: {
      name: 'Executive Status Email',
      subject: 'Executive Portfolio Briefing - [Date]',
      generateBody: (params) => `Executive Leadership Team,

Here is the weekly high-level status summary of our enterprise project portfolio:

• Overall Completion Index: 78%
• Active Projects: 12 (4 On-Schedule, 3 At-Risk, 5 Planning)
• Critical Bottlenecks: QA automation capacity constraints currently being rebalanced.

Attached is the complete PDF analytics brief for your review.

Respectfully,
Lead Program Director`
    },

    risk_escalation: {
      name: 'Risk Escalation Email',
      subject: 'URGENT: Risk Escalation - [Project Name]',
      generateBody: (params) => `Attention Steering Committee,

This is an urgent risk escalation regarding Project [Project Name].

Issue Summary:
• Risk: Database replication delay and QA capacity bottlenecks.
• Impact: Potential 5-day delivery delay if unmitigated.
• Recommended Action: Authorize secondary QA resource allocation and approve weekend delivery shift.

Your immediate guidance and approval are requested.

Sincerely,
Project Management Team`
    },

    delay_notification: {
      name: 'Delay Notification',
      subject: 'Schedule Baseline Adjustment Notice - [Project Name]',
      generateBody: (params) => `Dear Stakeholders,

We are writing to inform you of a necessary schedule baseline adjustment for [Project Name].

Revised Target Completion Date: [Target Date]
Reason: Unanticipated technical dependencies and extended security compliance reviews.

Mitigation Plan: Additional development resources have been assigned to accelerate remaining user stories.

Thank you for your understanding.

Best regards,
PMO Office`
    },

    resource_request: {
      name: 'Resource Allocation Request',
      subject: 'Resource Request: Additional QA & Dev Support for [Project Name]',
      generateBody: (params) => `Dear Resource Manager,

Due to accelerated sprint requirements, we formally request additional resource allocation for Project [Project Name]:

• Required Role: Senior QA Automation Engineer
• Allocation: 50% capacity (20 hours/week)
• Duration: Next 2 Sprints

Please confirm resource availability at your earliest convenience.

Regards,
Project Lead`
    },

    weekend_approval: {
      name: 'Weekend Work Shift Approval',
      subject: 'Request for Weekend Shift Approval - [Project Name]',
      generateBody: (params) => `Dear Operations Director,

We request formal approval for a scheduled weekend delivery shift for [Project Name] on Saturday.

• Target Deliverable: Final UAT bug fixes & environment deployment.
• Nominated Personnel: 2 Senior Developers, 1 QA Engineer.

Compensatory leave will be credited per enterprise HR guidelines.

Thank you,
Delivery Lead`
    }
  },

  /**
   * Opens Email Generator Modal
   * @param {string} templateKey 
   * @param {object} params 
   * @param {object} appInstance 
   */
  openEmailModal(templateKey = 'customer_update', params = {}, appInstance = window.portalAppInstance) {
    const tmpl = this.templates[templateKey] || this.templates.customer_update;

    let subject = tmpl.subject;
    if (params.clientName) subject = subject.replace('[Client Name]', params.clientName);
    if (params.projectName) subject = subject.replace('[Project Name]', params.projectName);
    subject = subject.replace('[Date]', new Date().toLocaleDateString());

    let body = tmpl.generateBody(params);
    if (params.clientName) body = body.replace(/\[Client Name\]/g, params.clientName);
    if (params.projectName) body = body.replace(/\[Project Name\]/g, params.projectName);

    const html = `
      <div class="p-2 text-xs">
        
        <!-- Template Selection Dropdown -->
        <div class="mb-3">
          <label class="form-label font-bold text-xs text-secondary">Select Email Template</label>
          <select id="email-template-select" class="form-select form-select-sm">
            ${Object.keys(this.templates).map(k => `
              <option value="${escapeComposerHtml(k)}" ${k === templateKey ? 'selected' : ''}>${escapeComposerHtml(this.templates[k].name)}</option>
            `).join('')}
          </select>
        </div>

        <!-- Recipients (Sprint 10B) -->
        <div class="mb-3">
          <label class="form-label font-bold text-xs text-secondary" for="email-to-input">To</label>
          <input type="text" id="email-to-input" class="form-control form-control-sm" placeholder="name@company.com; second@company.com" autocomplete="off" />
          <div class="text-muted mt-1" style="font-size: 0.72rem;">Separate addresses with commas or semicolons (Outlook sending accepts up to 10).</div>
        </div>

        <!-- AI draft from a project (Sprint 13) -->
        <div class="mb-3 p-2 border rounded-3 bg-body-tertiary">
          <label class="form-label font-bold text-xs text-secondary mb-1" for="email-ai-project-select">Draft with AI from a project</label>
          <div class="d-flex gap-2 flex-wrap">
            <select id="email-ai-project-select" class="form-select form-select-sm" style="max-width: 320px;"><option value="">Loading projects…</option></select>
            <button type="button" id="email-ai-draft-btn" class="btn btn-sm btn-outline-primary py-1 px-3" disabled>
              <i class="fa-solid fa-wand-magic-sparkles me-1"></i> Draft with AI
            </button>
          </div>
          <div id="email-ai-draft-status" class="text-muted mt-1" style="font-size: 0.72rem;" role="status">The AI drafts from the selected project's server data and the chosen template. Nothing is sent until you confirm.</div>
        </div>

        <!-- Subject Line Field -->
        <div class="mb-3">
          <label class="form-label font-bold text-xs text-secondary">Subject Line</label>
          <input type="text" id="email-subject-input" class="form-control form-control-sm font-semibold" value="${escapeComposerHtml(subject)}" />
        </div>

        <!-- Body Text Editor Area -->
        <div class="mb-3">
          <label class="form-label font-bold text-xs text-secondary">Email Message Body (Editable)</label>
          <textarea id="email-body-input" class="form-control font-mono text-xs" rows="10" style="line-height: 1.5; resize: vertical;">${escapeComposerHtml(body)}</textarea>
        </div>

        <!-- Action Buttons -->
        <div class="d-flex justify-content-between align-items-center border-top pt-3">
          <button id="copy-email-btn" class="btn btn-sm btn-outline-secondary py-1 px-3">
            <i class="fa-regular fa-copy me-1"></i> Copy to Clipboard
          </button>

          <div class="d-flex align-items-center gap-2 flex-wrap">
            <a id="send-mailto-btn" href="${escapeComposerHtml(buildMailto([], subject, body))}" class="btn btn-sm btn-primary py-1 px-3">
              <i class="fa-solid fa-paper-plane me-1"></i> Send via Email Client
            </a>
            <button type="button" id="send-outlook-btn" class="btn btn-sm btn-outline-primary py-1 px-3" disabled>
              <i class="fa-brands fa-microsoft me-1"></i> Send via Outlook
            </button>
          </div>
        </div>

        <!-- Outlook sending state and inline confirmation (Sprint 10B) -->
        <div id="outlook-send-status" class="small mt-2 text-muted" role="status">Checking Microsoft 365…</div>
        <div id="outlook-confirm-panel" class="alert alert-warning py-2 px-3 mt-2 mb-0 d-none">
          <div id="outlook-confirm-text" class="font-semibold mb-2"></div>
          <div class="d-flex gap-2">
            <button type="button" id="outlook-confirm-btn" class="btn btn-sm btn-primary py-1 px-3">Confirm send</button>
            <button type="button" id="outlook-back-btn" class="btn btn-sm btn-outline-secondary py-1 px-3">Back</button>
          </div>
        </div>

      </div>
    `;

    appInstance.openModal('AI Executive Email Generator', html, () => {
      appInstance.showToast('Email composition ready', 'info');
    });

    // Attach dynamic handlers
    setTimeout(() => {
      const select = document.getElementById('email-template-select');
      const toInput = document.getElementById('email-to-input');
      const subjectInput = document.getElementById('email-subject-input');
      const bodyInput = document.getElementById('email-body-input');
      const copyBtn = document.getElementById('copy-email-btn');
      const sendBtn = document.getElementById('send-mailto-btn');

      if (select) {
        select.addEventListener('change', (e) => {
          const newTmpl = this.templates[e.target.value];
          if (newTmpl) {
            subjectInput.value = newTmpl.subject;
            bodyInput.value = newTmpl.generateBody(params);
            updateMailto();
          }
        });
      }

      const updateMailto = () => {
        if (sendBtn) {
          sendBtn.href = buildMailto(parseRecipients(toInput?.value), subjectInput.value, bodyInput.value);
        }
      };

      if (toInput) toInput.addEventListener('input', updateMailto);
      if (subjectInput) subjectInput.addEventListener('input', updateMailto);
      if (bodyInput) bodyInput.addEventListener('input', updateMailto);

      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          const textToCopy = `Subject: ${subjectInput.value}\n\n${bodyInput.value}`;
          navigator.clipboard.writeText(textToCopy).then(() => {
            appInstance.showToast('Email text copied to clipboard', 'success');
          });
        });
      }

      // Sprint 10B: Outlook sending through the connected Microsoft 365 account.
      // The Outlook button only opens the inline confirmation; only Confirm send
      // calls the API, and it stays disabled while the request is in flight.
      const outlookBtn = document.getElementById('send-outlook-btn');
      const outlookStatus = document.getElementById('outlook-send-status');
      const confirmPanel = document.getElementById('outlook-confirm-panel');
      const confirmText = document.getElementById('outlook-confirm-text');
      const confirmBtn = document.getElementById('outlook-confirm-btn');
      const backBtn = document.getElementById('outlook-back-btn');
      let outlookAccount = null;
      const setOutlookStatus = (text, tone = 'text-muted') => {
        if (!outlookStatus) return;
        outlookStatus.className = `small mt-2 ${tone}`;
        outlookStatus.textContent = text;
      };
      const hideConfirm = () => { if (confirmPanel) confirmPanel.classList.add('d-none'); };

      MicrosoftService.getStatus().then((status) => {
        if (!status || !status.configured) {
          if (outlookBtn) outlookBtn.classList.add('d-none');
          setOutlookStatus('Outlook sending is unavailable on this server. Send via Email Client still works.');
          return;
        }
        if (!status.connected) {
          setOutlookStatus('Connect Microsoft 365 in Settings to send from Outlook.');
          return;
        }
        if (!status.canSendMail) {
          setOutlookStatus('Reconnect Microsoft 365 in Settings to enable Outlook sending.');
          return;
        }
        outlookAccount = status.accountEmail || 'your Microsoft 365 account';
        if (outlookBtn) outlookBtn.disabled = false;
        setOutlookStatus(`Outlook sending is available from ${outlookAccount}.`);
      }).catch(() => setOutlookStatus('Outlook status could not be loaded. Send via Email Client still works.'));

      if (outlookBtn) {
        outlookBtn.addEventListener('click', () => {
          const to = parseRecipients(toInput?.value);
          if (to.length === 0) return setOutlookStatus('Add at least one recipient in the To field.', 'text-danger');
          if (to.length > 10) return setOutlookStatus('Outlook sending accepts up to 10 recipients.', 'text-danger');
          if (!subjectInput.value.trim() || !bodyInput.value.trim()) return setOutlookStatus('A subject and message body are required.', 'text-danger');
          if (confirmText) confirmText.textContent = `Send to ${to.length} recipient${to.length === 1 ? '' : 's'} from ${outlookAccount}?`;
          if (confirmPanel) confirmPanel.classList.remove('d-none');
          outlookBtn.disabled = true;
        });
      }

      if (backBtn) {
        backBtn.addEventListener('click', () => {
          hideConfirm();
          if (outlookBtn && outlookAccount) outlookBtn.disabled = false;
        });
      }

      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          if (confirmBtn.disabled) return;
          const label = confirmBtn.textContent;
          confirmBtn.disabled = true;
          if (backBtn) backBtn.disabled = true;
          confirmBtn.textContent = 'Sending…';
          try {
            const result = await MicrosoftService.sendMail({
              to: parseRecipients(toInput?.value),
              subject: subjectInput.value,
              body: bodyInput.value,
            });
            hideConfirm();
            const count = result && result.recipientCount;
            appInstance.showToast(`Email sent from ${outlookAccount} to ${count} recipient${count === 1 ? '' : 's'}.`, 'success');
            document.getElementById('global-modal-overlay')?.classList.remove('show');
          } catch (err) {
            hideConfirm();
            setOutlookStatus(describeOutlookError(err), 'text-danger');
          } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = label;
            if (backBtn) backBtn.disabled = false;
            if (outlookBtn && outlookAccount) outlookBtn.disabled = false;
          }
        });
      }

      // Sprint 13: AI drafting through the V2 /ai/draft-email endpoint. The
      // browser sends only the project id and template key; the draft fills the
      // editable fields and never sends anything.
      const aiProjectSelect = document.getElementById('email-ai-project-select');
      const aiDraftBtn = document.getElementById('email-ai-draft-btn');
      const aiDraftStatus = document.getElementById('email-ai-draft-status');
      const setDraftStatus = (text, tone = 'text-muted') => {
        if (!aiDraftStatus) return;
        aiDraftStatus.className = `${tone} mt-1`;
        aiDraftStatus.textContent = text;
      };

      ProjectService.getProjects().then((projects) => {
        if (!aiProjectSelect) return;
        const list = Array.isArray(projects) ? projects : [];
        aiProjectSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = list.length ? 'Select a project…' : 'No projects available';
        aiProjectSelect.appendChild(placeholder);
        list.forEach((p) => {
          const option = document.createElement('option');
          option.value = p.id;
          option.textContent = `${p.name} (${p.code || p.id})`;
          if (params.projectName && p.name === params.projectName) option.selected = true;
          aiProjectSelect.appendChild(option);
        });
        if (aiDraftBtn) aiDraftBtn.disabled = !aiProjectSelect.value;
      }).catch(() => {
        if (aiProjectSelect) aiProjectSelect.innerHTML = '<option value="">Projects could not be loaded</option>';
        setDraftStatus('Projects could not be loaded, so AI drafting is unavailable.', 'text-danger');
      });

      if (aiProjectSelect) {
        aiProjectSelect.addEventListener('change', () => {
          if (aiDraftBtn) aiDraftBtn.disabled = !aiProjectSelect.value;
        });
      }

      if (aiDraftBtn) {
        aiDraftBtn.addEventListener('click', async () => {
          if (aiDraftBtn.disabled || !aiProjectSelect || !aiProjectSelect.value) return;
          const label = aiDraftBtn.innerHTML;
          aiDraftBtn.disabled = true;
          aiDraftBtn.textContent = 'Drafting…';
          // A new draft replaces the content, so any pending send confirmation is withdrawn.
          hideConfirm();
          if (outlookBtn && outlookAccount) outlookBtn.disabled = false;
          try {
            const draft = await AiAssistantService.draftEmail(aiProjectSelect.value, select ? select.value : 'executive_status');
            if (draft && draft.subject) subjectInput.value = draft.subject;
            if (draft && draft.body) bodyInput.value = draft.body;
            updateMailto();
            setDraftStatus(`AI draft ready (${draft && draft.provider === 'gemini' ? 'Gemini' : 'offline rules engine'}). Review and edit it before sending.`, 'text-success');
          } catch (err) {
            setDraftStatus(describeDraftError(err), 'text-danger');
          } finally {
            aiDraftBtn.innerHTML = label;
            aiDraftBtn.disabled = !aiProjectSelect.value;
          }
        });
      }
    }, 100);
  }
};

window.openEmailModal = (templateKey, params) => AIEmailGeneratorModule.openEmailModal(templateKey, params);
