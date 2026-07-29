/* aiEmailGenerator.js - Automated Business Email Generator & Template Engine */

import { Storage } from './storage.js';

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
              <option value="${k}" ${k === templateKey ? 'selected' : ''}>${this.templates[k].name}</option>
            `).join('')}
          </select>
        </div>

        <!-- Subject Line Field -->
        <div class="mb-3">
          <label class="form-label font-bold text-xs text-secondary">Subject Line</label>
          <input type="text" id="email-subject-input" class="form-control form-control-sm font-semibold" value="${subject}" />
        </div>

        <!-- Body Text Editor Area -->
        <div class="mb-3">
          <label class="form-label font-bold text-xs text-secondary">Email Message Body (Editable)</label>
          <textarea id="email-body-input" class="form-control font-mono text-xs" rows="10" style="line-height: 1.5; resize: vertical;">${body}</textarea>
        </div>

        <!-- Action Buttons -->
        <div class="d-flex justify-content-between align-items-center border-top pt-3">
          <button id="copy-email-btn" class="btn btn-sm btn-outline-secondary py-1 px-3">
            <i class="fa-regular fa-copy me-1"></i> Copy to Clipboard
          </button>

          <a id="send-mailto-btn" href="mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}" class="btn btn-sm btn-primary py-1 px-3">
            <i class="fa-solid fa-paper-plane me-1"></i> Send via Email Client
          </a>
        </div>

      </div>
    `;

    appInstance.openModal('AI Executive Email Generator', html, () => {
      appInstance.showToast('Email composition ready', 'info');
    });

    // Attach dynamic handlers
    setTimeout(() => {
      const select = document.getElementById('email-template-select');
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
          sendBtn.href = `mailto:?subject=${encodeURIComponent(subjectInput.value)}&body=${encodeURIComponent(bodyInput.value)}`;
        }
      };

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
    }, 100);
  }
};

window.openEmailModal = (templateKey, params) => AIEmailGeneratorModule.openEmailModal(templateKey, params);
