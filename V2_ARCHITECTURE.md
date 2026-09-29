# Surya PM Portal & Operating System — V2 Technical Architecture & Evolution Blueprint

**Sprint 1 Completed: V2 Platform Foundation, Backend, Data, Auth, and Services**

---

## 1. Executive Summary & V2 Product Vision

The **Surya Project Management Portal** is evolving into a comprehensive **Intelligent PM Operating System (V2.0)** that unifies the entire product-to-delivery lifecycle:
```
Product → Strategy → Roadmaps → Projects → Requirements → Epics → Features → Stories → Tasks → People → Risks → Issues → Dependencies → Meetings → Decisions → Documentation → Communication → AI
```

Sprint 1 establishes the V2 backend, data access layer, relational database schema, server-side authentication, RBAC middleware, centralized API client, AI provider abstraction, and Microsoft 365 readiness, while maintaining 100% operational compatibility with existing V1.1 features and the local Windows VB launcher workflow.

---

## 2. V2 System Architecture

```
+---------------------------------------------------------------------------------------------------+
|                                  Surya PM Portal Frontend (V2.0 Client)                            |
|  - Vanilla ES6+ & Modular Components (Dashboard, Projects, Customers, Planner, Risk, Gantt, etc.) |
|  - Dual Data Adapter (dataAdapter.js): LocalStorageAdapter (V1.1 fallback) & ApiAdapter (V2)      |
|  - Centralized API Client (apiClient.js) with Token/Cookie Auth, Timeout & Error Normalization    |
|  - Typed Domain Services: AuthService, UserService, ProjectService, ProductService, etc.         |
+-------------------------------------------------+-------------------------------------------------+
                                                  | HTTPS / REST (/api/v1/*)
+-------------------------------------------------v-------------------------------------------------+
|                                  V2 Express + TypeScript Backend (/server)                        |
|  - Config & Environment (server/config/env.ts, database.ts)                                      |
|  - Security Middleware: CORS, HTTP-only Cookies, Security Headers, Input Validator               |
|  - Auth Middleware & RBAC: Token verification, Role hierarchy checks (Admin, PM, Member, Viewer)  |
|  - V2 REST Controllers: Auth, Users, Teams, Products, Projects, Activity, Notifications, AI, Health |
|  - Service Layer: Business logic, validation, event triggers                                      |
|  - Integration Gateway: Microsoft 365 / Entra ID / Microsoft Graph abstraction                     |
|  - Server-Side AI Service Layer: Gemini AI Provider (Server Key) + Local Rule Fallback            |
|  - Repository Layer (Data Access): Parameterized SQL Queries & Resilient In-Memory Dev Store       |
+-------------------------------------------------+-------------------------------------------------+
                                                  | PostgreSQL / Pool
+-------------------------------------------------v-------------------------------------------------+
|                                  PostgreSQL Relational Database (/server/db)                      |
|  - Users (id, email, password_hash, role, ms_user_id, etc.)                                      |
|  - Teams (id, name, department, lead_id, capacity_hrs)                                            |
|  - Products (id, code, name, description, status, owner_id)                                       |
|  - Projects (id, code, name, client, manager_id, status, risk, progress, budget, sprint, etc.)    |
|  - Activity Logs (id, entity_type, entity_id, action, actor_id, actor_name, details, timestamp)   |
|  - Notifications (id, user_id, title, message, type, is_read, link, timestamp)                    |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. V2 API Specifications & Endpoints

All V2 APIs are structured under `/api/v1/`:

### 3.1 Health & Diagnostics
* `GET /api/v1/health` — Returns system status, internal version (2.0.0), display version (V2.0), uptime, database connectivity, and configured AI services.

### 3.2 Authentication & Sessions
* `POST /api/v1/auth/login` — Authenticates user via email + password. Returns JWT token and sets secure HTTP-only cookie.
* `POST /api/v1/auth/register` — Admin-only endpoint for provisioning new user accounts with scrypt password hashing.
* `GET /api/v1/auth/me` — Returns the currently authenticated user profile (excluding password hash).
* `POST /api/v1/auth/logout` — Clears authentication cookie and session state.

### 3.3 Users & Teams
* `GET /api/v1/users` — Returns list of enterprise users (sanitized).
* `GET /api/v1/users/:id` — Returns single user details.
* `PATCH /api/v1/users/:id/role` — (Admin only) Updates user access role.
* `GET /api/v1/teams` — Returns list of departmental teams and capacity figures.
* `GET /api/v1/teams/:id` — Returns specific team information.
* `POST /api/v1/teams` — (Admin / PM) Creates a new departmental team.

### 3.4 Products & Projects
* `GET /api/v1/products` — Returns product lines and portfolio linkages.
* `GET /api/v1/products/:id` — Returns product details.
* `POST /api/v1/products` — (Admin / Product Manager) Creates a new product.
* `PATCH /api/v1/products/:id` — Updates product status and target release.
* `GET /api/v1/projects` — Returns list of active enterprise projects with risk and progress indicators.
* `GET /api/v1/projects/:id` — Returns single project by ID or code.
* `POST /api/v1/projects` — (Admin / PM) Creates a new project and triggers activity logging.
* `PATCH /api/v1/projects/:id` — (Admin / PM) Updates project status, budget, or risk level.
* `DELETE /api/v1/projects/:id` — (Admin only) Removes a project.

### 3.5 Activity Logging & Notifications
* `GET /api/v1/activity` — Returns recent audit trail events with optional filtering by entity type and ID.
* `GET /api/v1/notifications` — Returns active user notifications with optional unread filter.
* `PATCH /api/v1/notifications/:id/read` — Marks a specific notification as read.
* `POST /api/v1/notifications/read-all` — Marks all notifications for current user as read.

### 3.6 Server-Side AI Copilot
* `POST /api/v1/ai/query` — Executes natural language PM intelligence queries.
* `POST /api/v1/ai/insights` — Project Copilot: health-grounded recommendations for one project (`{ projectId }`). All roles; the project must be in the caller's AI scope, otherwise 404.
* `POST /api/v1/ai/report` — AI executive report (`{ period: weekly|monthly|quarterly }`). All roles; figures are computed server-side from the caller's authorised AI context.
* `POST /api/v1/ai/draft-email` — Drafts a stakeholder email (`{ projectId, templateKey }`). Admin, project manager and product manager; facts come from the server, never the client. Drafting never sends — sending remains `POST /integrations/microsoft/mail/send` with explicit confirmation.
* Insights, report, draft-email and the assistant share the per-user AI quota (20 requests per minute). Every provider call goes through the prompt guard and falls back to the LocalRule provider on failure; activity entries record the operation only.

---

## 4. Authentication, Security, and RBAC

### 4.1 Password Security
* Passwords are never stored in plaintext or localStorage.
* Passwords are cryptographically salted and hashed using Node's memory-hard `scrypt` algorithm with unique 16-byte random salts.
* Verification uses constant-time comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.

### 4.2 Session Management
* JWT tokens signed with server-side `JWT_SECRET`.
* Set as secure HTTP-only cookies (`auth_token`) with SameSite=Lax and max-age 7 days.
* Fallback support for `Authorization: Bearer <token>` headers for standalone API consumers.

### 4.3 Role-Based Access Control (RBAC)
Role hierarchy and permissions:
* `admin` (Level 100): Full access to user management, team setup, project deletion, and system settings.
* `project-manager` (Level 80): Project creation/editing, team capacity planning, risk management.
* `product-manager` (Level 80): Product line definition, PRDs, roadmaps, project creation.
* `team-member` (Level 50): Task execution, time logging, leave requests, activity viewing.
* `viewer` (Level 10): Read-only access to dashboards, reports, and timelines.

---

## 5. Database Architecture & Schema

### PostgreSQL DDL Entities
1. **`users`**: `id`, `email`, `password_hash`, `first_name`, `last_name`, `role`, `avatar_url`, `department`, `title`, `ms_user_id`, `ms_tenant_id`, `is_active`, timestamps.
2. **`teams`**: `id`, `name`, `department`, `lead_id`, `capacity_hrs`, timestamps.
3. **`products`**: `id`, `code`, `name`, `description`, `status`, `owner_id`, `portfolio_id`, `target_release`, timestamps.
4. **`projects`**: `id`, `code`, `name`, `client`, `manager_id`, `status`, `risk`, `progress`, `budget`, `sprint`, `start_date`, `end_date`, `product_id`, `sow_status`, timestamps.
5. **`activity_logs`**: `id`, `entity_type`, `entity_id`, `action`, `actor_id`, `actor_name`, `details (JSONB)`, `ip_address`, `created_at`.
6. **`notifications`**: `id`, `user_id`, `title`, `message`, `type`, `is_read`, `link`, `created_at`.

The full, current DDL (including later sprints' tables such as `roadmap_items`) lives in `server/db/schema.sql`. It is not applied automatically: when `DATABASE_URL` is enabled, apply that file to the target database (for example `psql "$DATABASE_URL" -f server/db/schema.sql`) before starting the server, otherwise every repository falls back to the in-memory store with a warning. The file is idempotent and safe to re-run.

---

## 6. Microsoft 365 / Outlook Integration (Sprints 10A–10B)

A signed-in portal user can connect their Microsoft 365 account so the server can read their Outlook calendar and send email they explicitly confirm. This is **account integration, not a portal login**: the V2 email/password login remains the only way into the portal, and no portal user is ever created or modified from Microsoft profile data.

* **Flow**: OAuth 2.0 authorization code with PKCE (S256), confidential client. `POST /api/v1/integrations/microsoft/connect` returns the authorize URL; Microsoft redirects to `GET /api/v1/auth/microsoft/callback`, which requires the portal session. The OAuth state is random, single-use, expires after 10 minutes and is bound to the requesting user; the PKCE verifier never leaves the server.
* **Scopes**: new or reconnected accounts request exactly `openid profile email offline_access User.Read Calendars.Read Mail.Send`. `Mail.Read`, `Mail.ReadWrite`, Teams and calendar-write scopes are not requested. Stored scopes are normalized (Graph resource prefixes removed).
* **Token storage**: `microsoft_connections` (one row per user) holds AES-256-GCM ciphertext of the access and refresh tokens, keyed by `MICROSOFT_TOKEN_ENCRYPTION_KEY`. Without that key the integration reports not-configured and stores nothing. Tokens, codes and verifiers are never returned by any API or written to the activity log.
* **Refresh**: access tokens are refreshed shortly before expiry; a rotated refresh token is always persisted. A refresh requests only the scopes the connection was actually granted, so a connection made before Sprint 10B (without `Mail.Send`) keeps refreshing and reading the calendar.
* **Outlook sending (Sprint 10B)**: `POST /api/v1/integrations/microsoft/mail/send` sends a plain-text message to 1–10 `to` recipients (subject up to 255 characters, body up to 20,000) through Graph `/me/sendMail` with `saveToSentItems: true`. The sender is always the signed-in user's own connection; the request carries no identity, CC, BCC, HTML or attachments, and requires `confirmed: true`, which the composer sends only from its inline confirmation step. The server checks the stored scopes first and answers 424 `MICROSOFT_PERMISSION_REQUIRED` without calling Graph when `Mail.Send` is missing. The only automatic retry is one forced token refresh after a Graph 401; 400/403/429/5xx and timeouts are never retried, and a timeout (504) tells the user the email may have been sent and to check Sent Items. No request id, recipient, subject or body is stored; the activity log records `event: 'mail_sent'` with counts, lengths and the sending account only.
* **Reconnect for sending**: connections made before Sprint 10B report `canSendMail: false` in the status response. The user reconnects from Settings to grant `Mail.Send`; calendar access keeps working until then.
* **Identity association**: the Graph user id and tenant are stored on `users.ms_user_id` / `ms_tenant_id`. A Microsoft account already linked to another portal user is refused with 409. `DELETE /api/v1/integrations/microsoft/connection` deletes the stored tokens and clears the association.
* **APIs**: `GET /api/v1/integrations/microsoft/status` (safe fields only, including `canSendMail`), `POST /api/v1/integrations/microsoft/mail/send` and `GET /api/v1/integrations/microsoft/calendar?days=7` (read-only upcoming events, at most 31 days and 50 events, times in UTC).
* **Services**: `microsoftIdentityService.ts` (configuration, state, PKCE, token endpoint), `microsoftGraphClient.ts` (Node fetch with timeout, injectable for tests), `tokenCrypto.ts`, `microsoftConnectionRepository.ts` and `microsoftIntegrationService.ts`.
* **Active users**: `authenticateToken` re-reads the account on every request, so deactivated users are refused on all APIs, including Microsoft.
* **Configuration**: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI` (must match the Entra app registration and the portal's host and port), `MICROSOFT_TOKEN_ENCRYPTION_KEY`, optional `MICROSOFT_GRAPH_TIMEOUT_MS`.
* **Not implemented**: mail reading, CC/BCC, HTML bodies and attachments, calendar writes, Microsoft sign-in, Teams.

---

## 7. Server-Side AI Architecture

* `AIService` (`server/services/aiService.ts`):
  * **`GeminiAIProvider`**: Uses `@google/genai` with server-side `process.env.GEMINI_API_KEY` (lazy initialization, never exposed to client).
  * **`LocalRuleAIProvider`**: Heuristic decision support engine providing instant responses offline or when no API key is set.
  * **`OpenAIAIProvider`**: Multi-provider stub for future enterprise flexibility.

---

## 8. Storage Migration Strategy

To guarantee that existing V1.1 modules continue to operate without disruption:
```
Application / UI Modules
         ↓
    DataService (Hybrid Mode)
    ├── LocalStorageAdapter (V1.1 local storage fallback)
    └── ApiAdapter (V2.0 REST API client)
```
This ensures zero downtime and allows gradual per-module migration in upcoming sprints.

---

## 9. Local Application Launch & VB Compatibility

The portal supports seamless local Windows execution via:
1. **`Launch_PM_Portal.vbs`** (Root VBScript launcher): Checks if port 3000 is active, launches background backend/frontend if needed, and opens default browser to `http://localhost:3000/PM-Portal/index.html`.
2. **`PM-Portal/Launch_Portal.vbs`** (Subdirectory launcher).
3. **`start-local.bat`** (Windows batch launcher).

---

## 10. Environment Configuration (`.env.example`)

```env
# Gemini API Key (Server-side only)
GEMINI_API_KEY=""

# Server Configuration
PORT=3000
NODE_ENV="development"
APP_URL="http://localhost:3000"

# PostgreSQL Database Connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pm_portal"

# JWT & Session Security
JWT_SECRET="enterprise_super_secret_jwt_key_surya_pm_portal_v2"
SESSION_EXPIRY="7d"

# Microsoft 365 / Entra ID (Optional)
MICROSOFT_CLIENT_ID=""
MICROSOFT_CLIENT_SECRET=""
MICROSOFT_TENANT_ID="common"
MICROSOFT_REDIRECT_URI="http://localhost:3000/api/v1/auth/microsoft/callback"
```

---

## 11. Sprint Roadmap

* **Sprint 0 (Completed)**: Complete technical, UX, and security audit (`V2_ARCHITECTURE.md`, `SECURITY.md`).
* **Sprint 1 (Completed)**: V2 Platform Foundation — Express backend, PostgreSQL schema, server-side authentication, RBAC, REST APIs, AI abstraction, centralized API client, test suite, and VB launcher.
* **Sprint 2 (Recommended Next)**: Product & Strategy Module — Portfolio hierarchy, Products, Goals/OKRs, PRDs, and Strategic Roadmaps.
* **Sprint 3**: Enhanced Delivery Engine — Agile Backlog, Epic-to-Task breakdown, Sprint Planning boards, Gantt upgrade.
* **Sprint 4**: Governance & Operations — Risk/Issue matrix, Dependency mapping, ADRs (Decisions), Meeting action items.
* **Sprint 5**: Enterprise Integrations & AI Copilot — Server-side Gemini integration, Microsoft 365 / Teams connector, Automated email generator.
* **Sprint 6**: Comprehensive End-to-End Hardening, UI Polish, and Production Readiness.
