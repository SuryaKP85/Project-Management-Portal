# Enterprise Project Management (PM) Portal

An end-to-end, high-performance, responsive **Enterprise Project Management Portal** built with modern web technologies (HTML5, Bootstrap 5, Tailwind CSS utilities, Vanilla ES Modules, Chart.js, SheetJS XLSX Engine, Font Awesome 6).

The application delivers real-time portfolio tracking, multi-domain risk evaluation, resource allocation planning, automated forecasting, executive reporting, interactive Gantt charts, and an **Executive Action Center** with AI-driven recommendation logic.

---

## 🚀 Key Features & Operational Modules

### 1. Executive Action Center (`actionCenter.js`)
* **Risk Radar across 13 Operational Metrics**:
  1. Projects due this week
  2. Projects due next week
  3. Projects overdue
  4. Projects under 20 hours remaining
  5. Stories exceeding estimates
  6. Developers overloaded (>100% capacity)
  7. QA overloaded (>100% capacity)
  8. People on leave
  9. Pending SOW contracts
  10. Customer Escalations
  11. Blocked Stories
  12. No updates in 5 days
  13. Weekend work shifts
* **Automatic Recommendations Engine**: Contextual actionable suggestions (e.g., *"Project Ares Core Upgrade is likely to miss delivery by 4 days due to QA bottleneck."*).
* **One-Click Auto-Fix**: Instantly re-baselines deadlines, clears blockers, and optimizes resource allocations across the entire portfolio.
* **Priority Categorization**: Filter cards by **Critical**, **Warning**, and **Information** tabs.

### 2. Executive Dashboard (`dashboard.js` & `charts.js`)
* Real-time KPI summaries: Total Projects, Active Budget, Resource Utilization, and Risk Index.
* Interactive Chart.js visualizations (Budget Burnup, Department Allocation, Sprint Velocity, Risk Heatmap).
* Theme-aware charting engine (adapts seamlessly to Light and Dark modes).

### 3. Project Portfolio & Details (`projects.js`)
* Complete CRUD management for enterprise projects.
* Budget tracking, progress percentage indicators, lead PM assignment, and client affiliation.
* Client-side search and status filters (In-Progress, Completed, Planning, On-Hold).

### 4. Customers Registry (`customers.js`)
* Customer account management, industry categorization, active project counts, and executive escalation status tracking.

### 5. Resource Allocation & Planner (`resourcePlanner.js`)
* Matrix view of team capacity across Engineering, Design, QA, and Product.
* Automated workload calculation detecting resource burnout (>100% allocation).

### 6. Time Logging & Leave Tracker (`timeLogging.js` & `leaveTracker.js`)
* Daily hours logging against user stories and project tasks.
* Employee leave requests (Annual, Sick, Personal) and backup resource reassignment.

### 7. Interactive Gantt Workspace (`gantt.js`)
* Visual project timeline rendering milestones, dependencies, and sprint boundaries.

### 8. Automated Forecast Engine (`forecastEngine.js`)
* Monte Carlo project completion probability models and variance calculations.

### 9. Risk Engine & Audit Logs (`riskEngine.js`)
* Risk register tracking probability vs. impact matrix, risk mitigation plans, and audit trails.

### 10. Executive Reports & Excel Engine (`reportsHub.js` & `excelEngine.js`)
* One-click generation of PDF/Print executive briefs.
* Multi-sheet Excel export (`.xlsx`) powered by SheetJS for offline BI analysis.

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`Ctrl + K`** or **`Cmd + K`** or **`?`** | Open Global Command Palette & Quick Search |
| **`Ctrl + S`** or **`Cmd + S`** | Force Manual Data Sync & Autosave to LocalStorage |
| **`Alt + 1`** | Navigate to Executive Dashboard |
| **`Alt + 2`** | Navigate to Executive Action Center |
| **`Alt + 3`** | Navigate to Projects Portfolio |
| **`Alt + 4`** | Navigate to Customers Registry |
| **`Alt + 5`** | Navigate to Human Resources |
| **`Alt + 6`** | Navigate to Resource Planner |
| **`Alt + 7`** | Navigate to Time Logging |
| **`Alt + 8`** | Navigate to Leave Tracker |
| **`Alt + 9`** | Navigate to Reports Hub |
| **`ESC`** | Close Command Palette or Active Modal |

---

## 💾 Storage & Data Flow Architecture

* **LocalStorage Engine (`storage.js`)**: All operations write to namespaced keys (`pm_portal_*`) with error handling.
* **Autosave Status Indicator**: Displays a real-time status pill in the top navigation bar (`Autosaved` / `Synced`), allowing manual force-sync on click.
* **Data Bus**: Cross-tab and module sync triggers reactive UI updates whenever state changes occur.

---

## 🔌 Future Backend Migration & Integration Contracts (`migrationConfig.js`)

The codebase includes full structural contracts for backend migration and third-party API integration:

1. **Node.js / Express REST API**:
   - `POST /api/v1/auth/login`
   - `GET /api/v1/projects`
   - `GET /api/v1/action-center/cards`
   - `POST /api/v1/integrations/teams/webhook`
2. **SQL Database Schemas**:
   - Pre-written DDL schemas for **SQLite**, **Microsoft SQL Server (T-SQL)**, and **MySQL / MariaDB**.
3. **Third-Party Integrations**:
   - **Atlassian Jira REST API v3**: Issue key to story mapping schema.
   - **Azure DevOps Services API v7.1**: Work Item tracking mapping.
   - **Microsoft Teams**: Adaptive Card JSON payloads for executive alerts.
   - **Power BI**: OData DirectQuery feed definition.
4. **Multi-User RBAC**:
   - Role specifications for C-Suite, PMs, Team Leads, and Developers/QA.

---

## ♿ Accessibility & UI Polishing

* WCAG AA compliant color contrast across both Light & Dark themes.
* Keyboard skip navigation link (`Skip to main content`).
* ARIA roles (`role="main"`, `role="navigation"`) and focus management inside modal dialogs.
