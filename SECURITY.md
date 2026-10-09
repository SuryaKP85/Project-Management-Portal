# Security Policy & Audit Report — Surya PM Portal

## 1. Security Overview
This document outlines the security architecture, threat model, identified vulnerabilities, mitigation status, and standards for the Surya Project Management Portal as it evolves from V1 towards the Enterprise V2 platform.

---

## 2. Identified Vulnerabilities & Audit Findings (Sprint 0)

### 2.1 Credential & Secret Management
| Finding | Severity | Current State | Risk Description | V2 Remediation Plan |
| :--- | :--- | :--- | :--- | :--- |
| **Plaintext LocalStorage Passwords** | **RESOLVED (Sprint 12)** | `authentication.js` holds no accounts or credentials. `login.html` authenticates only against `POST /api/v1/auth/login`; the session record is built from the server-authenticated user and never contains a password or hash. Retired local keys are cleared on every visit. | Previously, physical or XSS access to the browser exposed user credentials directly. | Done: server-side scrypt hashing, HttpOnly JWT cookie, admin-only registration, `PATCH /users/:id`, `PATCH /users/:id/status`, `POST /auth/change-password` and admin `POST /users/:id/set-password`. No self-service reset tokens or email recovery exist yet. |
| **Simulated Token Generation** | **RESOLVED (Sprint 12)** | No client-minted token remains; `pm_portal_auth_token` is removed on load. The only session credential is the server-signed JWT: the HttpOnly `auth_token` cookie in browsers (Sprint 25: never kept in `sessionStorage` or any browser storage), or `Authorization: Bearer` for non-browser API clients, which take it from the login response's `Set-Cookie` (see V2_ARCHITECTURE.md §4.2). | Previously, tokens lacked cryptographic signatures and server verification. | Done: server-minted HMAC-signed JWTs verified by `authenticateToken` on every API request. |
| **Environment Variable Exposure** | **LOW (Protected)** | `.env.example` documents `GEMINI_API_KEY`. | Client-side bundles must never embed AI or database secrets. | Keep all AI and integration tokens strictly server-side (Express backend proxy at `/api/*`). Client communicates via session bearer headers. |

### 2.2 Client-Side Authorization & State
| Finding | Severity | Current State | Risk Description | V2 Remediation Plan |
| :--- | :--- | :--- | :--- | :--- |
| **Client-Side Auth Guards** | **MEDIUM** | `requireAuth()` and role-based UI checks are evaluated purely in client-side JavaScript. | A malicious actor can manipulate local storage or console variables to bypass UI restrictions. | Enforce authorization and role-based access control (RBAC) at the server API layer for every endpoint. |
| **Unencrypted LocalStorage Persistence** | **LOW** | Project budgets, customer details, time logs, and leave requests reside in `localStorage`. | Shared or unmanaged devices can leak sensitive business figures. | Migrate operational enterprise data to cloud database (PostgreSQL / Cloud SQL / Firestore) with row-level security (RLS). |

### 2.3 Injection & Content Security
| Finding | Severity | Current State | Risk Description | V2 Remediation Plan |
| :--- | :--- | :--- | :--- | :--- |
| **Template String innerHTML Rendering** | **LOW-MEDIUM** | Several modules format DOM elements using template literals (`innerHTML = ...`). | Unsanitized project titles or user input containing script tags could cause Cross-Site Scripting (XSS). | Use standardized HTML escaping helpers and prefer structured DOM node construction (`document.createElement` / React virtual DOM). |
| **Third-Party CDN Dependencies** | **LOW** | Font Awesome, Bootstrap, SheetJS, and Chart.js are loaded from public CDNs (`cdnjs`, `cdn.jsdelivr.net`). | CDN tampering or outage could disrupt portal availability. | Bundle dependencies locally via npm in Vite production builds with Subresource Integrity (SRI) hashes. |

---

## 3. Mandatory Security Rules for V2 Development

1. **Zero Client-Side Secrets**: No API keys, client secrets, access tokens, or connection strings in client-side repositories or `.env` files prefixed with `VITE_`.
2. **Server-Side AI Gateway**: All Gemini API / LLM calls must be mediated through an Express backend route (`/api/ai/*`) where rate limits, prompt validation, and telemetry are enforced.
3. **Session & Auth Standards**:
   - Authentication must use HTTPS, secure SameSite cookies, or cryptographically signed bearer tokens.
   - Passwords must comply with enterprise complexity standards (min 8 chars, mixed case, numbers, special characters) and undergo adaptive hashing (Bcrypt / Argon2).
4. **Input Sanitization & Output Encoding**: All user-supplied content (project names, remarks, meeting notes, customer records) must be validated on input and encoded before DOM insertion.
5. **Role-Based Access Control (RBAC)**:
   - **Administrator**: Full portal control, user provisioning, audit logging, system settings.
   - **Project Manager**: Project CRUD, sprint planning, budget updates, task assignment.
   - **Team Member (Dev / QA / BA)**: Time logging, task status updates, leave submissions.
   - **Executive / Client Viewer**: Read-only dashboard, forecast reports, and export capabilities.

---

## 4. Reporting Security Issues
For security vulnerabilities or compliance inquiries, contact:
- **Security Lead**: surya.prashanth.kp@gmail.com
