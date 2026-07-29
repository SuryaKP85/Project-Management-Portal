/* migrationConfig.js - Future Enterprise Migration & Integration Architecture Module */

/**
 * Enterprise Architecture Blueprint for Future Backend Migration
 * Prepares Node.js, SQL Databases (SQLite, SQL Server, MySQL, PostgreSQL),
 * Jira API, Confluence API, Azure DevOps, Microsoft Teams, Power BI, and Auth/RBAC schemas.
 */

export const MigrationConfig = {
  /**
   * Node.js / Express REST API Schema Endpoints Contract
   */
  nodeEndpoints: {
    auth: {
      login: 'POST /api/v1/auth/login',
      refreshToken: 'POST /api/v1/auth/refresh',
      me: 'GET /api/v1/auth/me',
      logout: 'POST /api/v1/auth/logout'
    },
    projects: {
      list: 'GET /api/v1/projects',
      create: 'POST /api/v1/projects',
      getOne: 'GET /api/v1/projects/:id',
      update: 'PUT /api/v1/projects/:id',
      delete: 'DELETE /api/v1/projects/:id',
      auditTrail: 'GET /api/v1/projects/:id/audits'
    },
    actionCenter: {
      getCards: 'GET /api/v1/action-center/cards',
      autoFix: 'POST /api/v1/action-center/auto-fix',
      executeAction: 'POST /api/v1/action-center/actions/:actionType'
    },
    resources: {
      list: 'GET /api/v1/resources',
      allocations: 'GET /api/v1/resources/allocations',
      updateAllocation: 'PUT /api/v1/resources/:id/allocation'
    },
    timeLogging: {
      logs: 'GET /api/v1/time-logs',
      submit: 'POST /api/v1/time-logs',
      approve: 'PUT /api/v1/time-logs/:id/approve'
    },
    integrations: {
      jiraSync: 'POST /api/v1/integrations/jira/sync',
      azureDevOpsSync: 'POST /api/v1/integrations/azure-devops/sync',
      teamsWebhook: 'POST /api/v1/integrations/teams/webhook',
      powerBiFeed: 'GET /api/v1/integrations/powerbi/odata'
    }
  },

  /**
   * Relational SQL Database Contracts (SQLite, SQL Server T-SQL, MySQL)
   */
  sqlSchemas: {
    sqlite: [
      "-- SQLite DDL Schema for Enterprise PM Portal",
      "CREATE TABLE IF NOT EXISTS projects (",
      "    id TEXT PRIMARY KEY,",
      "    name TEXT NOT NULL,",
      "    client_id TEXT NOT NULL,",
      "    manager_id TEXT,",
      "    progress INTEGER DEFAULT 0,",
      "    budget REAL DEFAULT 0.00,",
      "    status TEXT DEFAULT 'planning',",
      "    sow_status TEXT DEFAULT 'Approved',",
      "    hours_remaining INTEGER DEFAULT 0,",
      "    estimated_start DATE,",
      "    estimated_end DATE,",
      "    last_update DATE,",
      "    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,",
      "    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      ");",
      "",
      "CREATE TABLE IF NOT EXISTS resources (",
      "    id TEXT PRIMARY KEY,",
      "    name TEXT NOT NULL,",
      "    role TEXT NOT NULL,",
      "    department TEXT NOT NULL,",
      "    allocation_percentage INTEGER DEFAULT 100,",
      "    status TEXT DEFAULT 'allocated'",
      ");"
    ].join('\n'),

    sqlServer: [
      "-- Microsoft SQL Server (T-SQL) DDL Schema",
      "CREATE TABLE dbo.Projects (",
      "    ProjectID NVARCHAR(50) PRIMARY KEY,",
      "    ProjectName NVARCHAR(255) NOT NULL,",
      "    ClientID NVARCHAR(50) NOT NULL,",
      "    ManagerName NVARCHAR(100),",
      "    ProgressPercent INT DEFAULT 0 CHECK (ProgressPercent BETWEEN 0 AND 100),",
      "    BudgetAmount DECIMAL(18, 2) DEFAULT 0.00,",
      "    ProjectStatus NVARCHAR(50) DEFAULT 'planning',",
      "    HoursRemaining INT DEFAULT 0,",
      "    EstimatedStart DATE,",
      "    EstimatedEnd DATE",
      ");"
    ].join('\n'),

    mySql: [
      "-- MySQL / MariaDB DDL Schema",
      "CREATE TABLE projects (",
      "  id VARCHAR(50) NOT NULL,",
      "  name VARCHAR(255) NOT NULL,",
      "  client_id VARCHAR(50) NOT NULL,",
      "  manager VARCHAR(100) DEFAULT NULL,",
      "  progress INT DEFAULT 0,",
      "  budget DECIMAL(12,2) DEFAULT 0.00,",
      "  status ENUM('planning','in-progress','completed','on-hold','archived') DEFAULT 'planning',",
      "  PRIMARY KEY (id)",
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    ].join('\n')
  },

  /**
   * Third-Party API Integration Contracts (Jira, Confluence, Azure DevOps, Teams, Power BI)
   */
  thirdPartyIntegrations: {
    jira: {
      name: 'Atlassian Jira REST API v3',
      baseUrl: 'https://your-domain.atlassian.net/rest/api/3',
      authMethod: 'OAuth 2.0 (3LO) / Bearer Token & Basic Auth API Key',
      webhookEvents: ['jira:issue_created', 'jira:issue_updated', 'worklog_created'],
      mappingSchema: {
        'issue.key': 'story.id',
        'issue.fields.summary': 'story.title',
        'issue.fields.timetracking.originalEstimateSeconds': 'story.estimatedHours',
        'issue.fields.timetracking.timeSpentSeconds': 'story.loggedHours',
        'issue.fields.status.name': 'story.status'
      }
    },
    azureDevOps: {
      name: 'Azure DevOps Services REST API v7.1',
      baseUrl: 'https://dev.azure.com/{organization}/{project}/_apis',
      authMethod: 'Personal Access Token (PAT) / OAuth 2.0',
      webhooks: ['workitem.updated', 'workitem.created'],
      mappingSchema: {
        'System.Id': 'task.id',
        'System.Title': 'task.name',
        'Microsoft.VSTS.Scheduling.OriginalEstimate': 'task.estimate',
        'Microsoft.VSTS.Scheduling.CompletedWork': 'task.logged'
      }
    },
    msTeams: {
      name: 'Microsoft Teams Adaptive Cards Webhook Engine',
      webhookUrl: 'https://outlook.office.com/webhook/xxxx/IncomingWebhook/yyyy',
      cardTemplate: {
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: 'Executive Alert: Project Ares Core Overdue', weight: 'Bolder', size: 'Medium' },
          { type: 'TextBlock', text: 'Automatic Recommendation: Extend completion date by 14 days and assign secondary QA automation support.' }
        ]
      }
    },
    powerBI: {
      name: 'Power BI Service OData Live Data Connector',
      endpoint: '/api/v1/integrations/powerbi/odata/$metadata',
      refreshSchedule: 'Every 15 minutes (DirectQuery supported)'
    }
  },

  /**
   * Multi-User Role-Based Access Control (RBAC) Specification
   */
  rbacRoles: [
    {
      role: 'Executive / C-Suite',
      permissions: ['READ_ALL', 'ACTION_CENTER_EXECUTE', 'EXCEL_EXPORT', 'RISK_OVERRIDE']
    },
    {
      role: 'Program / Project Manager (PM)',
      permissions: ['READ_ALL', 'CREATE_PROJECT', 'UPDATE_PROJECT', 'LOG_TIME', 'MANAGE_RESOURCES']
    },
    {
      role: 'Team Lead / Architect',
      permissions: ['READ_PROJECTS', 'UPDATE_TASK_ESTIMATES', 'APPROVE_TIME_LOGS', 'UNBLOCK_STORIES']
    },
    {
      role: 'Developer / QA Engineer',
      permissions: ['READ_ASSIGNED_PROJECTS', 'SUBMIT_TIME_LOGS', 'REQUEST_LEAVE', 'UPDATE_STORY_STATUS']
    }
  ],

  /**
   * Renders Migration Architecture Preview Modal for PMs
   */
  openMigrationModal(appInstance) {
    const html = `
      <div class="migration-modal-container text-xs">
        <p class="text-secondary mb-3">
          This Enterprise PM Portal is built with standard modular architecture to enable instant plug-and-play migration to Node.js backend services, SQL databases, Jira/Azure DevOps webhooks, and Power BI datasets.
        </p>

        <!-- Navigation Tabs inside Modal -->
        <ul class="nav nav-tabs mb-3" id="migration-tabs" role="tablist">
          <li class="nav-item">
            <button class="nav-link active font-bold text-xs" id="tab-node-btn" data-bs-toggle="tab" data-target="#tab-node">Node.js REST API</button>
          </li>
          <li class="nav-item">
            <button class="nav-link font-bold text-xs" id="tab-sql-btn" data-bs-toggle="tab" data-target="#tab-sql">SQL DDL Schemas</button>
          </li>
          <li class="nav-item">
            <button class="nav-link font-bold text-xs" id="tab-jira-btn" data-bs-toggle="tab" data-target="#tab-jira">Jira & Azure DevOps</button>
          </li>
          <li class="nav-item">
            <button class="nav-link font-bold text-xs" id="tab-powerbi-btn" data-bs-toggle="tab" data-target="#tab-powerbi">Power BI & Teams</button>
          </li>
        </ul>

        <!-- Tab Content Containers -->
        <div class="tab-content" id="migration-tabs-content">
          
          <!-- Node.js Endpoints -->
          <div class="tab-pane fade show active" id="tab-node">
            <h6 class="font-bold mb-2 text-primary">REST API Endpoints Specification</h6>
            <pre class="bg-dark text-success p-3 rounded" style="max-height: 240px; overflow-y: auto; font-family: monospace;">${JSON.stringify(this.nodeEndpoints, null, 2)}</pre>
          </div>

          <!-- SQL Schemas -->
          <div class="tab-pane fade" id="tab-sql">
            <h6 class="font-bold mb-2 text-primary">SQLite & SQL Server DDL Contracts</h6>
            <pre class="bg-dark text-info p-3 rounded" style="max-height: 240px; overflow-y: auto; font-family: monospace;">${this.sqlSchemas.sqlite}</pre>
          </div>

          <!-- Jira & Azure DevOps -->
          <div class="tab-pane fade" id="tab-jira">
            <h6 class="font-bold mb-2 text-primary">Atlassian Jira & Azure DevOps Field Mapping</h6>
            <pre class="bg-dark text-warning p-3 rounded" style="max-height: 240px; overflow-y: auto; font-family: monospace;">${JSON.stringify(this.thirdPartyIntegrations.jira, null, 2)}</pre>
          </div>

          <!-- Power BI & Teams -->
          <div class="tab-pane fade" id="tab-powerbi">
            <h6 class="font-bold mb-2 text-primary">Power BI OData & Teams Adaptive Cards</h6>
            <pre class="bg-dark text-light p-3 rounded" style="max-height: 240px; overflow-y: auto; font-family: monospace;">${JSON.stringify(this.thirdPartyIntegrations.msTeams, null, 2)}</pre>
          </div>

        </div>
      </div>
    `;

    appInstance.openModal('Enterprise Migration & API Integration Architecture', html, () => {
      appInstance.showToast('Migration architecture contract exported to console', 'success');
      console.log('Migration Architecture Specs:', this);
    });

    // Custom tab switching inside modal
    setTimeout(() => {
      const tabBtns = document.querySelectorAll('#migration-tabs button');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          tabBtns.forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');

          const targetId = e.target.getAttribute('data-target');
          document.querySelectorAll('#migration-tabs-content .tab-pane').forEach(pane => {
            pane.classList.remove('show', 'active');
          });
          const targetPane = document.querySelector(targetId);
          if (targetPane) targetPane.classList.add('show', 'active');
        });
      });
    }, 100);
  }
};
