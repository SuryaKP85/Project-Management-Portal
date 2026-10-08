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

### 3.7 Meetings, Action Items, Waiting For & Follow-ups (Sprint 14)
* `GET|POST /api/v1/meetings`, `GET|PATCH|DELETE /api/v1/meetings/:id`
* `GET|POST /api/v1/action-items`, `GET|PATCH|DELETE /api/v1/action-items/:id`, `PATCH /api/v1/action-items/:id/status`
* `GET|POST /api/v1/waiting-for`, `GET|PATCH|DELETE /api/v1/waiting-for/:id`, `PATCH /api/v1/waiting-for/:id/status`
* `GET|POST /api/v1/follow-ups`, `GET|PATCH|DELETE /api/v1/follow-ups/:id`, `PATCH /api/v1/follow-ups/:id/status`
* Every record belongs to one project. Access follows the AI-context rule: admins reach every project; others the projects they manage, belong to or have assigned work in. Records outside that scope answer 404, exactly like missing ones.
* Reads: any authenticated role. Create, edit and delete: admin, project manager, product manager. Status endpoints: those roles, or a team member who owns the record. Viewers never write.
* Lists take `page`/`limit` (default 25, max 100) and filters (`projectId`, `status`, owner/participant, dates, `search`); responses carry `total`, `page` and `limit`.
* Owners, organizers, participants and waiting-on users must be active users with access to the project. Waiting For and Follow-ups may reference one related record (`relatedType` + `relatedId`) that must be in the same project.
* Activity is logged for create, update, assignment, status change, completion/resolution and delete; assignment and meaningful status changes notify the person concerned (never the actor). Tables: `meetings`, `action_items`, `waiting_for_items`, `follow_ups`.

### 3.8 Requirements (Sprint 17, Requirements Studio foundation)
* `GET|POST /api/v1/requirements`, `GET|PATCH|DELETE /api/v1/requirements/:id`, `PATCH /api/v1/requirements/:id/status` (also under `/api/v2`).
* A requirement belongs to one project for its whole life (`projectId` is immutable). Fields: `code` (REQ-###), `title`, `description`, `type` (`business` | `functional` | `non-functional`), `status` (`draft` | `in-review` | `approved` | `rejected` | `deferred`; every requirement is created as `draft` and a client-supplied status is ignored), `priority` (`critical` | `high` | `medium` | `low`), `rationale`, `source`, `ownerId`, `targetDate`. `id`, `code`, `createdBy`/`updatedBy` and timestamps are set by the server; only these fields are read from a request body.
* Read: the existing project access rule (as in 3.7); anything outside it is a 404, exactly like a missing record. A client-supplied `projectId` is always resolved server-side.
* Create and edit: admins, project and product managers who can see the project, and team members who manage or are listed on it. Viewers never write. Owning a requirement grants no access.
* Status lifecycle (`PATCH …/status`; `PATCH /requirements/:id` does not change status): `draft → in-review`, then `in-review → approved | rejected | deferred`. Any other transition is a 400 (`REQUIREMENT_TRANSITIONS`); rejected and deferred are final, and nothing returns to draft. Anyone who can edit may submit a draft for review; approving, rejecting and deferring belong to admins and project/product managers (403 otherwise). Enforced in `RequirementService`, since `requireRoles` is hierarchical.
* Approval rule: a change to the title, description, type, priority, rationale or source of an approved requirement returns it to `in-review` (logged as a status change with `reason: content-changed`). Owner and target date changes leave it approved. This edit is the only way an approved requirement leaves approval.
* Delete: admins and the project's current manager (`ProjectGuards.canAdminister`); an approved requirement cannot be deleted (409).
* Lists take `page`/`limit` (default 25, max 100) and filters `projectId`, `status`, `priority`, `type`, `ownerId`, `search` (code, title, description, source); newest code first.
* The owner must be an active user with access to the project; a new owner is notified (`work_assigned` / `work_reassigned`, never the actor). Activity (`entityType: requirement`) is logged for create, update (changed field names only), status change, owner change and delete — no descriptions or rationale.
* Table `requirements` (project FK cascades, owner FK sets null; indexes on project, status, priority, owner). Codes come from `requirement_code_seq`, raised above any stored code before each create, with `UNIQUE(code)` and a bounded retry as the backstop; memory mode uses a monotonic in-process counter. A create with an id already in use is a 409.
* AI extension point: `toRequirementContext(requirement)` is a pure, whitelisted, length-capped projection (code, title, type, status, priority, capped description/rationale/source, target date, `hasOwner`) with no record or user identities. It is not yet connected to the AI services.
* Browser: the global **Requirements** workspace (`PM-Portal/js/requirements.js`, sidebar under Strategy & Portfolios) lists, filters, creates, edits, changes status and deletes, rendering through `safeHtml.js` with delegated `data-*` actions and DOM-filled forms.

### 3.9 Requirement decomposition (Sprint 18)
Requirement → AI proposal → human review → approval → atomic creation → `requirement_links` → delivery hierarchy (Epic → Feature → Story). AI proposes; a person edits and explicitly approves; only then are authoritative records created.
* `POST /api/v1/requirements/:id/decomposition/proposal` (also `/api/v2`): returns `{ requirementId, requirementCode, requirementRevision, provider, generatedAt, epics: [{ title, description, features: [{ title, description, stories: [{ title, description }] }] }] }`. Nothing is stored except a metadata-only AI audit entry (`ai`/`ai_query`, operation `requirement_decomposition`: provider, revision, counts, outcome — no prompt, response or requirement text). Shares the per-user AI rate limit.
* `POST /api/v1/requirements/:id/decomposition`: body `{ requirementRevision, epics }` (the edited tree; any other field is a 400). Returns 201 with `decompositionId`, requirement code and revision, counts, the created epics/features/stories (ids and codes) and their links.
* `GET /api/v1/requirements/:id/links`: the linked delivery records (type, code, title, status) for the requirement detail; same project only, links whose record no longer exists are dropped.
* **Authorisation** (proposal and approval alike): admin, project manager or product manager **and** `canWriteProject` (admin, or the project's manager or a listed member). Team members, viewers and managers without write access get 403; an inaccessible requirement is a 404. The requirement must be `approved` (409 `REQUIREMENT_NOT_APPROVED` otherwise).
* **Revision**: `requirements.revision` is server-controlled, starts at 1 and increments on every change to title, description, type, priority, rationale or source (owner, target date and status changes leave it alone; an approved substantive edit still returns the requirement to in-review). An approval names the revision it was made from: a different current revision is 409 `STALE_PROPOSAL`. Each revision can be decomposed once (`requirement_decompositions`, UNIQUE(requirement_id, requirement_revision); a repeat is 409). After a substantive edit and re-approval the new revision can be decomposed again.
* **Contract and AI**: `server/ai/requirementDecomposition.ts`. 1–3 epics, 1–8 features per epic, 1–10 stories per feature, at most 50 records in total; titles 1–255 characters, descriptions up to 4000; strings only, trimmed, control characters removed; wrong types, unknown fields and empty lists are rejected — for AI output (502 `AI_INVALID_OUTPUT`) and for the approval body (400) alike. Gemini is called with `responseMimeType: application/json` and a `responseSchema`, but the server validates regardless. The prompt carries only a capped projection of the requirement (title, description ≤ 4000, type, priority, rationale ≤ 1000, source) inside the sealed `<untrusted_pm_data>` block, with a task instruction stating that requirement content is data, not instructions. There is **no LocalRule fallback** for decomposition: without a structured-output provider the proposal is 503 `AI_UNAVAILABLE`, a provider failure is 502 `AI_ERROR`. Other AI features keep their existing fallback.
* **Server-controlled values**: project = the requirement's; parents = tree position; ids and codes = server; status `backlog`; priority = the requirement's; epic/feature owner and story reporter = the approver; no story assignee; empty `userStory` and `acceptanceCriteria`; default story points (3); no Jira fields.
* **Atomicity** (`withTransaction` in `server/config/database.ts`): in PostgreSQL the requirement is re-read with `SELECT … FOR UPDATE`, then the decomposition row, every epic, feature, story and link are written on one client between `BEGIN` and `COMMIT` (`ROLLBACK` on any failure; code retries use savepoints). Repositories record their in-memory writes (`trackMemoryWrite`), and a failed unit restores exactly those keys — the whole store in memory mode, the mirror in PostgreSQL mode — so no partial epics, features, stories, links or decomposition remain. Activity (one `requirement`/`decompose` entry plus a `create` entry per record) is written only after the commit, best effort: if an activity write fails it is logged on the server, and the committed decomposition is neither rolled back nor reported as failed. A rolled-back attempt leaves at most one failure entry. No notifications are sent.
* **Concurrency**: there is no in-process lock. In PostgreSQL the guarantee comes from the database: the requirement row is locked (`SELECT … FOR UPDATE`) and `requirement_decompositions` has UNIQUE(requirement_id, requirement_revision), so however many requests or server instances approve the same revision, exactly one commits and the others get 409 and roll back. Memory mode runs in a single server process: the repository's synchronous check-and-insert gives the same result within that process, and is not claimed to provide correctness across multiple instances.
* **Delivery codes**: EPC-###, FEAT-### and STR-### are now collision-safe (`server/repositories/deliveryCodes.ts`): PostgreSQL sequences `epic_code_seq`, `feature_code_seq`, `story_code_seq` raised above the highest stored code before each issue, with UNIQUE(code) and a bounded retry as the backstop; a monotonic counter in memory mode. Numbers continue above the highest existing code. Task codes are unchanged.
* **Tables**: `requirement_decompositions` (one row per approved decomposition: requirement, project, revision, creator) and `requirement_links` (requirement FK cascade, required project, `target_type` epic | feature | story, `target_id`, `decomposition_id`, UNIQUE(requirement_id, target_type, target_id), indexes on requirement, project, target and decomposition). Links point at delivery records; the hierarchy itself stays in the epic/feature/story parent ids. AI proposals are never stored.
* **Browser**: in the Requirements workspace, an approved requirement offers **Decompose with AI** to users who may decompose. The review panel shows the provider and "AI output can be wrong. Review before approving.", lets the user edit every title and description, add/remove features and stories and move items up or down, and approves in one request (the button is disabled while it runs; on failure the edited proposal stays for a retry). The proposal lives only in the page's memory (no browser storage). The result lists the created codes with links into Delivery Management, and the requirement detail shows its **Linked Delivery Records**.

### 3.10 Story details and AI story refinement (Sprint 19)
Story → **Refine with AI** → temporary proposal → the person edits it in the Story editor → **Save** through the existing guarded `PATCH /stories/:id`. The AI never writes a story; there is no proposal table and no approval endpoint.
* **Canonical details** (`server/services/storyDetails.ts`): `userStory` is `{ asA, iWant, soThat }` (strings, trimmed, control characters removed, up to 2000 each, unknown keys dropped); `acceptanceCriteria` is an ordered list of `{ id, text, completed }` (at most 50; text 1–2000 characters; `completed` boolean; unknown fields dropped). Writes are strict: a string item becomes `{ id: crit_…, text, completed: false }`, an object keeps a well-formed, unique id (otherwise a new one), and anything else — null, numbers, arrays, objects without text, non-boolean `completed` — is a 400. Reads are lenient and identical in memory and PostgreSQL: legacy strings and foreign objects come back canonical (`legacy_<n>` ids; items without text dropped); stored `"[object Object]"` text cannot be recovered and is shown as ordinary text. No schema change: the existing `user_story` and `acceptance_criteria` JSONB columns hold the canonical shape.
* **Legacy fields**: `userPersona` / `userAction` / `userBenefit` are still accepted, but only fill `userStory` (when the request does not send `userStory` itself) and are never stored on their own; older in-memory records are read through `userStory`.
* **Activity**: a story update records `changedFields` (names only), the previous and new status, and the code — never the description, user story, criteria or raw payload.
* **Story editor** (`PM-Portal/js/delivery.js`): As a / I want / So that bound to `userStory`; a row editor for criteria (text, done, up/down, remove, add; ids and done flags kept); description and priority fields; a stored status, story-point or priority value outside the usual choices is kept as its own option, so saving never changes it; validation runs synchronously (missing title or project, empty criterion) and keeps the editor open, which closes only after the server accepts the save. The Stories view renders criteria and user stories through `escapeHtml`. Agile Board and My Work story details use the existing `DeliveryService.getTrace` (the lineage is escaped).
* `POST /api/v1/stories/:id/refinement/proposal` (also `/api/v2`): returns `{ storyId, storyCode, provider, generatedAt, userStory, acceptanceCriteria: [{ text, completed: false }] }`. The story and its project are resolved server-side; inaccessible stories are 404. Allowed: admin, project manager or product manager **and** `canWriteProject` (the Sprint 18 rule) — team members, viewers and managers without project write access get 403, although team members can still edit stories manually. Shares the per-user AI rate limit; audited as metadata only (operation `story_refinement`, provider, story code, criteria count, whether a requirement was linked, outcome — no prompt, story text or AI output).
* **AI contract** (`server/ai/storyRefinement.ts`): `{ userStory: { asA, iWant, soThat }, acceptanceCriteria: [string] }`; each user-story field 1–500 characters, 1–15 criteria of 1–500 characters; wrong types, unknown keys, empty or oversized values are 502 `AI_INVALID_OUTPUT`. Gemini is called with `responseMimeType: application/json` and a `responseSchema` (one shared structured-output helper serves decomposition and refinement), but the server validates regardless. No LocalRule fallback: no provider is 503 `AI_UNAVAILABLE`, a provider failure 502 `AI_ERROR`.
* **Context**: a capped projection inside the sealed `<untrusted_pm_data>` block — story title, description (≤ 4000), current user story and criteria text (≤ 20), feature and epic titles, and, when the story is linked to a requirement **in the same project**, the requirement's title, type, description (≤ 4000) and rationale (≤ 1000). No ids, codes, people, project or Jira data. The task instruction states that all of it is untrusted data, not instructions.
* **Traceability**: `RequirementLinkRepository.findByTarget(type, id)` (epic | feature | story). `GET /api/v1/stories/:id/origin` returns the originating requirement's id, code and title (or null) to anyone who can see the story's project; links or requirements in another project are ignored. A story without a requirement is fully usable. The Story editor shows "Originating requirement: REQ-… · title".
* **Concurrency**: story edits stay last-write-wins, as before; there is no stale check.
* AI acceptance criteria **replace** the criteria in the editor (as new, unmet rows); nothing changes until Save, and Cancel leaves the story as it was. Story templates, Gherkin and AI-generated points, people, status, priority or dates are not part of this.

### 3.11 Project Status Report (Sprint 22B)
A **live, read-only, deterministic** report on one project, built on request from the project's current records (`server/services/projectStatusReportService.ts`). Nothing is stored, estimated or generated by AI.
* `GET /api/v1/projects/:id/status-report` (also `/api/v2`): `{ success, data: { report } }`. Signed in; read access to the project through the Sprint 22A project scope (`ProjectScope`, `ProjectAccessService`). A missing project and one the caller cannot see return the same 404; administrators can read every project.
* **Contract**: `meta` (generatedAt, reportDate, healthModel, definitions, notes), `project` (id, code, name, status, dates, manager; `budget`, `client`, `sowStatus` only for `EXECUTIVE_COMMERCIAL_ROLES`), `health` (score, band, coverage, topFactors — `ProjectHealthService.computeHealth`, reused), `schedule` (days remaining, past end, expected progress, **Reported Progress (manual)**), `delivery` (counts, blocked, overdue items, status caveat), `sprint` (the active sprint's committed / completed points, or null with a reason), `milestones` (calculated by `MilestoneService`), `risks` / `issues` (open, by severity, critical, high, overdue), `dependencies` (owned by the project: blocked, at risk, overdue), `requirements` (by status / priority / type, awaiting approval, approved but not decomposed for the current revision, overdue), `followThrough` (action items, waiting-for, follow-ups, upcoming and past-scheduled meetings) and deterministic `attention` items.
* **Definitions** are returned in `meta.definitions` and applied consistently (open = not terminal for the record type; overdue = open with its date before the report date; critical / high = severity; blocked; at risk). They are the report's own, documented definitions where other screens differ.
* **Isolation**: every source is read with the project filter and then re-filtered by projectId, so a repository fallback can never add another project's rows. Dependencies are those owned by the project; an endpoint in a project the caller cannot read is shown only as "Another project". The SOW health factor's value is withheld from non-commercial roles.
* **Dates** are normalised (strings and the Date values PostgreSQL returns) before any comparison; the report date is the UTC calendar day of generation.
* **Not included**: project completion (reported progress is manual; delivery status vocabulary makes completion unreliable), velocity history and burndown, history / trends / changes since a previous report, decisions, AI narrative. Values that are not available are null with a reason; nothing is filled in. Issue figures are affected by the known PostgreSQL issue-persistence defect, which the report does not repair.
* **UI**: Projects → project detail → **Status Report** card (`PM-Portal/js/statusReport.js`), rendered with escaped values, with Refresh and Print (print rules scoped to the report card). The V1.1 Reports Hub is unchanged and separate.
* **Future AI narrative**: a later, separate step may take this report JSON as input (the `executiveReport` pattern: deterministic figures first, narrative on top). The report itself stays deterministic.

### 3.12 Record Write Integrity (Sprint 23)
* **Server-owned identity on create**: risks, issues, milestones, releases, dependencies, roadmap items, sprints, goals, products and portfolios get their id from the server. Services pass create bodies through `withoutClientIdentity` (`server/repositories/recordConflict.ts`), which drops a client-supplied `id`, `code`, `createdAt`, `updatedAt`, `createdBy` and `updatedBy`; generated codes (`RSK-`, `ISS-`, `MLS-`, `REL-`, `DEP-`, `RM-`, `SPR-`) are always the server's. Product and portfolio **codes** stay client-proposed business identifiers (the form field users fill in) and must be unique; their ids are still the server's.
* **Record conflicts**: each of those repositories refuses a create whose id already exists (`duplicateRecordError`, HTTP 409 `CONFLICT`) — in both storage modes, for every caller — so an existing record is never silently replaced. A product or portfolio code already in use is also a 409. Ids that were clock-only (`goal_`, `prod_`, `port_`) carry a random suffix.
* **Risk links**: on risk create, risk update (`linkedItems`) and `POST /risks/:id/links` the client supplies only the target type and id. The server checks the caller can see the target (`ProjectScope.assertLinkTarget`; 404 otherwise), confirms it exists, and stores the target's own name and code (`resolveEntity`; a goal's objective) — a client-supplied `targetName` / `targetCode` is never stored. An unsupported target type is a 400.
* **Projects V2 write contract** (`PM-Portal/js/projects.js`, `services/dataAdapter.js`): a new project is one `POST /projects`, and the server's project (id and code) replaces the browser draft; an edit is one `PATCH /projects/:id` for that project only, carrying the fields the user changed since the form was opened (values the V1.1 form cannot show exactly are never written back); bulk actions, duplicate, archive, delete and Excel import make one server call per affected project. The save-all browser persistence and its silent error swallowing are removed — a failed save is shown to the user and the local copy is restored. SOW# is stored as `sow` and never changes the project's id, code or lookup.
* **Project cache and sign-out**: at sign-out (`Authentication.logout` → `dataService.settleProjectCacheForLogout`) projects that exist only in the browser are offered to the guarded `POST /projects/migrate` (which never overwrites an existing project); declining keeps the user signed in. The V1.1 project cache is then cleared, and each session refills it from the server at application start. An empty server list is used as is — the browser copy never stands in for it.

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

The full, current DDL (including later sprints' tables such as `roadmap_items`) lives in `server/db/schema.sql`. Since Sprint 20 the server applies it automatically at startup in PostgreSQL mode (`PM_PORTAL_SCHEMA_FILE` overrides the path); the file is idempotent (`CREATE … IF NOT EXISTS`, `ALTER … ADD COLUMN IF NOT EXISTS`) and safe on new and existing databases. If the database cannot be reached or the schema cannot be applied, the server does not start — it never falls back to the in-memory store when `DATABASE_URL` is set. See §9 for the data modes.

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

### 9.1 Data modes, first run and deployment safety (Sprint 20)
Exactly one data mode is active; the startup log prints it and `GET /api/v1/health` reports it as `data.storage.mode`:

| Mode | When | Where V2 data lives |
|---|---|---|
| `persistent-embedded` | default — `DATABASE_URL` not set | one JSON data file; survives restarts |
| `postgresql` | `DATABASE_URL` set | PostgreSQL |
| `temporary-memory` | `PM_PORTAL_DATA_MODE=memory` (tests, demos) | process memory only — lost when the server stops |

Setting both `DATABASE_URL` and `PM_PORTAL_DATA_MODE` is a configuration error. V1.1 pages that use browser localStorage are unaffected by the mode.

**Persistent embedded (default for a local Windows install).**
* Data file: `PM_PORTAL_DATA_FILE`, default `%LOCALAPPDATA%\PM-Portal\pm-portal-data.json` on Windows (`~/.pm-portal/pm-portal-data.json` elsewhere). It must lie outside the application folder (the development server serves files from that folder), and the server refuses a path inside it.
* Every repository store (projects, products, users, requirements, decompositions and links, epics/features/stories/tasks, meetings and follow-through, governance records, Microsoft connections with their encrypted tokens, notifications, activity, code counters) is restored from the file before seeds run. Seeds run only when there is no data file yet; a restored file is never re-seeded, so deleted demo records stay deleted and nothing is duplicated.
* **A change succeeds only once it is saved.** For every state-changing API request (POST, PUT, PATCH, DELETE), the success response is sent only after the data file has been written. If the write fails, the request answers 503 `PERSISTENCE_FAILED` instead of success: the change stays in memory (it is not discarded, and the next successful save includes it), the previous data file is unchanged, health reports `storage.saveError`, and every further change is refused the same way until saving works again — so the server never keeps reporting success while nothing reaches disk. Reads and error responses are unaffected. Changes made outside a request (startup seeds, the first administrator) are written before the server starts serving; a data location that cannot be written stops startup.
* Each save writes a complete temporary file and then renames it over the old one, so the file is never left half-written; pending changes are also saved on a normal shutdown. Nothing is saved while a transaction is open (a response waits for open transactions to finish): a rolled-back decomposition is never written, a committed one is.
* If the file exists but cannot be read or is damaged, the server does not start (and does not touch the file): restore it from a backup or move it aside to start fresh.
* The file holds password hashes, encrypted Microsoft tokens, activity and all business data. It is created with owner-only permissions where the platform supports them (on Windows it inherits the folder's permissions); keep it private. It is not encrypted.
* **Backup / restore:** stop the server, copy the data file; to restore, stop the server and copy a backup over it. There is no backup UI.
* **Demo accounts.** Outside production, a new embedded store is seeded with demo data, including demo user accounts — two of them administrators — whose passwords are fixed in the source code (`server/repositories/userRepository.ts`), so anyone with the code knows them. They are for development and demonstration only: they are seeded only into an empty store with no data file, never re-created over restored data, and their passwords are never logged. Change their passwords or deactivate them before any real use. With `NODE_ENV=production` no demo accounts are seeded: a new embedded store, like a new PostgreSQL database, gets its first administrator only from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, and does not start without them.

**PostgreSQL (server / LAN deployments).**
1. Create an empty database and set `DATABASE_URL`.
2. For the first start, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (also required for a new embedded store with `NODE_ENV=production`) (at least 12 characters, mixing upper- and lower-case letters, digits and a symbol).
3. Start the server: it connects (or stops with a clear error), applies the schema, and — only while the database has no active administrator — creates that administrator with a hashed password. An existing account is never changed, reset or promoted; repeated starts do nothing. Without the variables an empty database stops startup with instructions.
4. Remove `BOOTSTRAP_ADMIN_PASSWORD` from the environment. Credentials are never logged.
* Sprint 20 schema additions: `stories.sprint_id` and `tasks.sprint_id` (references `sprints`, set null on delete), `backlog_order` on epics, features, stories and tasks, and `sprints.completed_at` (stamped when a sprint is completed). The repositories read, filter and write these, so sprint assignment, sprint items, completion and backlog order work in PostgreSQL as in the embedded store.

**Security settings.**
* `CORS_ALLOWED_ORIGINS`: comma-separated origins (e.g. `https://pm.example.com`) allowed to call the API with credentials from another site. The portal's own address (same origin, including a LAN address) always works; outside production `http://localhost:<PORT>` and `http://127.0.0.1:<PORT>` are allowed; any other origin is not reflected and gets no credentials.
* Sign-in rate limit: after `LOGIN_RATE_LIMIT_MAX` (default 5) failed attempts for one account from one address within `LOGIN_RATE_LIMIT_WINDOW_MS` (default 15 minutes) — or four times that many from one address across accounts — sign-in answers 429 with `Retry-After` until the window ends. A successful sign-in clears the account's count; nothing is locked permanently. The limiter is per process.
* `NODE_ENV=production` requires `JWT_SECRET` to be a random value of at least 32 characters (not the built-in development default or the `.env.example` sample); otherwise the server does not start.

---

## 10. Environment Configuration (`.env.example`)

```env
# Gemini API Key (Server-side only)
GEMINI_API_KEY=""

# Server Configuration
PORT=3000
NODE_ENV="development"
APP_URL="http://localhost:3000"

# Data mode (Sprint 20, see §9.1): PostgreSQL when set, otherwise the persistent embedded store
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pm_portal"
# PM_PORTAL_DATA_FILE=""          # embedded data file (default: per-user app data folder)
# PM_PORTAL_DATA_MODE="memory"    # temporary, nothing saved (tests/demos)
# BOOTSTRAP_ADMIN_EMAIL=""        # first administrator for an empty PostgreSQL database
# BOOTSTRAP_ADMIN_PASSWORD=""

# JWT & Session Security (production requires a random JWT_SECRET of 32+ characters)
JWT_SECRET="enterprise_super_secret_jwt_key_surya_pm_portal_v2"
SESSION_EXPIRY="7d"

# CORS and sign-in limits (Sprint 20)
CORS_ALLOWED_ORIGINS=""
LOGIN_RATE_LIMIT_MAX=""
LOGIN_RATE_LIMIT_WINDOW_MS=""

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
