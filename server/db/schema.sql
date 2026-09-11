-- ====================================================================
-- Surya PM Portal V2.0 Database Schema (PostgreSQL)
-- Sprint 1: Foundational Entities (Users, Teams, Products, Projects, ActivityLogs, Notifications)
-- Sprint 2: Core Entity Migration, Portfolios, Goals, and Team Members
-- ====================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'team-member',
  avatar_url TEXT,
  department VARCHAR(100),
  title VARCHAR(100),
  ms_user_id VARCHAR(128) UNIQUE,
  ms_tenant_id VARCHAR(128),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Portfolios Table (Sprint 2)
CREATE TABLE IF NOT EXISTS portfolios (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'active',
  health VARCHAR(50) DEFAULT 'healthy',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Teams Table
CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  department VARCHAR(100) NOT NULL,
  lead_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  capacity_hrs NUMERIC(10, 2) DEFAULT 160.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Team Members Table (Sprint 2)
CREATE TABLE IF NOT EXISTS team_members (
  id VARCHAR(64) PRIMARY KEY,
  team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_team VARCHAR(100) DEFAULT 'Member',
  allocated_hrs NUMERIC(10, 2) DEFAULT 40.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Products Table (Sprint 2 Enhanced)
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'in-development',
  health VARCHAR(50) DEFAULT 'on-track',
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  portfolio_id VARCHAR(64) REFERENCES portfolios(id) ON DELETE SET NULL,
  category VARCHAR(100),
  target_audience TEXT,
  vision TEXT,
  strategic_objective TEXT,
  start_date DATE,
  target_date DATE,
  target_release VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Projects Table (Sprint 2 Enhanced)
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  client VARCHAR(150) NOT NULL,
  manager_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  members JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) DEFAULT 'planning',
  risk VARCHAR(30) DEFAULT 'Low',
  progress INTEGER DEFAULT 0,
  budget NUMERIC(15, 2) DEFAULT 0.0,
  sprint VARCHAR(50),
  start_date DATE,
  end_date DATE,
  product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  portfolio_id VARCHAR(64) REFERENCES portfolios(id) ON DELETE SET NULL,
  sow_status VARCHAR(50),
  poc VARCHAR(150),
  developer VARCHAR(150),
  qa VARCHAR(150),
  ba VARCHAR(150),
  remarks TEXT,
  month VARCHAR(50),
  quarter VARCHAR(20),
  year VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Goals / OKRs Table (Sprint 2)
CREATE TABLE IF NOT EXISTS goals (
  id VARCHAR(64) PRIMARY KEY,
  objective VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'not-started',
  target_value NUMERIC(15, 2) DEFAULT 100.0,
  current_value NUMERIC(15, 2) DEFAULT 0.0,
  progress INTEGER DEFAULT 0,
  unit VARCHAR(50) DEFAULT '%',
  due_date DATE,
  portfolio_id VARCHAR(64) REFERENCES portfolios(id) ON DELETE SET NULL,
  product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id VARCHAR(64) PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  actor_name VARCHAR(150) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'system',
  is_read BOOLEAN DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- Sprint 3: Delivery Management Hierarchy & Traceability
-- ====================================================================

-- 10. Epics Table
CREATE TABLE IF NOT EXISTS epics (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  portfolio_id VARCHAR(64) REFERENCES portfolios(id) ON DELETE SET NULL,
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'backlog',
  priority VARCHAR(30) DEFAULT 'medium',
  health VARCHAR(30) DEFAULT 'on-track',
  progress INTEGER DEFAULT 0,
  start_date DATE,
  target_date DATE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Features Table
CREATE TABLE IF NOT EXISTS features (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  epic_id VARCHAR(64) REFERENCES epics(id) ON DELETE SET NULL,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'backlog',
  priority VARCHAR(30) DEFAULT 'medium',
  target_release VARCHAR(50),
  start_date DATE,
  target_date DATE,
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. User Stories Table
CREATE TABLE IF NOT EXISTS stories (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  user_story JSONB DEFAULT '{"asA":"", "iWant":"", "soThat":""}'::jsonb,
  acceptance_criteria JSONB DEFAULT '[]'::jsonb,
  feature_id VARCHAR(64) REFERENCES features(id) ON DELETE SET NULL,
  epic_id VARCHAR(64) REFERENCES epics(id) ON DELETE SET NULL,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  story_points INTEGER DEFAULT 3,
  priority VARCHAR(30) DEFAULT 'medium',
  status VARCHAR(50) DEFAULT 'backlog',
  assignee_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  reporter_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  sprint VARCHAR(50),
  target_release VARCHAR(50),
  due_date DATE,
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  story_id VARCHAR(64) REFERENCES stories(id) ON DELETE SET NULL,
  feature_id VARCHAR(64) REFERENCES features(id) ON DELETE SET NULL,
  epic_id VARCHAR(64) REFERENCES epics(id) ON DELETE SET NULL,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'backlog',
  priority VARCHAR(30) DEFAULT 'medium',
  due_date DATE,
  estimated_effort_hrs NUMERIC(10, 2) DEFAULT 0.0,
  actual_effort_hrs NUMERIC(10, 2) DEFAULT 0.0,
  start_date DATE,
  completion_date DATE,
  sprint VARCHAR(50),
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Subtasks Table
CREATE TABLE IF NOT EXISTS subtasks (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  assignee_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'backlog',
  priority VARCHAR(30) DEFAULT 'medium',
  estimate_hrs NUMERIC(10, 2) DEFAULT 0.0,
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for rapid indexing & queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client);
CREATE INDEX IF NOT EXISTS idx_projects_product ON projects(product_id);
CREATE INDEX IF NOT EXISTS idx_projects_team ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_products_portfolio ON products(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_goals_portfolio ON goals(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_goals_product ON goals(product_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- Sprint 3 Indices: Delivery Hierarchy & Traceability
CREATE INDEX IF NOT EXISTS idx_epics_project ON epics(project_id);
CREATE INDEX IF NOT EXISTS idx_epics_product ON epics(product_id);
CREATE INDEX IF NOT EXISTS idx_epics_owner ON epics(owner_id);
CREATE INDEX IF NOT EXISTS idx_epics_status ON epics(status);
CREATE INDEX IF NOT EXISTS idx_epics_priority ON epics(priority);

CREATE INDEX IF NOT EXISTS idx_features_epic ON features(epic_id);
CREATE INDEX IF NOT EXISTS idx_features_project ON features(project_id);
CREATE INDEX IF NOT EXISTS idx_features_product ON features(product_id);
CREATE INDEX IF NOT EXISTS idx_features_status ON features(status);
CREATE INDEX IF NOT EXISTS idx_features_priority ON features(priority);

CREATE INDEX IF NOT EXISTS idx_stories_feature ON stories(feature_id);
CREATE INDEX IF NOT EXISTS idx_stories_epic ON stories(epic_id);
CREATE INDEX IF NOT EXISTS idx_stories_project ON stories(project_id);
CREATE INDEX IF NOT EXISTS idx_stories_assignee ON stories(assignee_id);
CREATE INDEX IF NOT EXISTS idx_stories_team ON stories(team_id);
CREATE INDEX IF NOT EXISTS idx_stories_sprint ON stories(sprint);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_priority ON stories(priority);

CREATE INDEX IF NOT EXISTS idx_tasks_story ON tasks(story_id);
CREATE INDEX IF NOT EXISTS idx_tasks_feature ON tasks(feature_id);
CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(epic_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_assignee ON subtasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_status ON subtasks(status);

-- ====================================================================
-- Sprint 4: Backlog Management, Sprints & Agile Execution
-- ====================================================================

-- 15. Sprints Table
CREATE TABLE IF NOT EXISTS sprints (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  goal TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'planning',
  capacity_hours NUMERIC(10, 2) DEFAULT 0.0,
  capacity_points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. Velocity Records Table
CREATE TABLE IF NOT EXISTS velocity_records (
  id VARCHAR(64) PRIMARY KEY,
  sprint_id VARCHAR(64) NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  sprint_name VARCHAR(255) NOT NULL,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  completed_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  committed_points INTEGER DEFAULT 0,
  completed_points INTEGER DEFAULT 0,
  committed_hours NUMERIC(10, 2) DEFAULT 0.0,
  completed_hours NUMERIC(10, 2) DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sprint 4 Indices
CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(status);
CREATE INDEX IF NOT EXISTS idx_sprints_dates ON sprints(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_velocity_project ON velocity_records(project_id);
CREATE INDEX IF NOT EXISTS idx_velocity_completed ON velocity_records(completed_date DESC);

-- ====================================================================
-- Sprint 5: Governance & Delivery Control (Risks, Issues, Dependencies, Milestones, Releases)
-- ====================================================================

-- 17. Risks Table
CREATE TABLE IF NOT EXISTS risks (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  portfolio_id VARCHAR(64) REFERENCES portfolios(id) ON DELETE SET NULL,
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL,
  probability INTEGER NOT NULL CHECK (probability BETWEEN 1 AND 5),
  impact INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 1 AND 25),
  severity VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Identified',
  mitigation TEXT,
  contingency_plan TEXT,
  trigger TEXT,
  target_resolution_date DATE,
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 18. Issues Table
CREATE TABLE IF NOT EXISTS issues (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  assignee_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  category VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'Medium',
  priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
  status VARCHAR(50) NOT NULL DEFAULT 'Open',
  root_cause_category VARCHAR(50),
  root_cause_notes TEXT,
  resolution TEXT,
  reported_date DATE NOT NULL,
  target_resolution_date DATE,
  resolved_date TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 19. Dependencies Table
CREATE TABLE IF NOT EXISTS dependencies (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  source_entity_id VARCHAR(64) NOT NULL,
  source_entity_type VARCHAR(50) NOT NULL,
  source_entity_name VARCHAR(255) NOT NULL,
  source_entity_code VARCHAR(50),
  target_entity_id VARCHAR(64) NOT NULL,
  target_entity_type VARCHAR(50) NOT NULL,
  target_entity_name VARCHAR(255) NOT NULL,
  target_entity_code VARCHAR(50),
  dependency_type VARCHAR(50) NOT NULL DEFAULT 'Blocks',
  status VARCHAR(50) NOT NULL DEFAULT 'Open',
  criticality VARCHAR(50) NOT NULL DEFAULT 'Medium',
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE SET NULL,
  description TEXT,
  target_date DATE,
  due_date DATE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_date TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_dep_relationship UNIQUE (source_entity_id, source_entity_type, target_entity_id, target_entity_type, dependency_type)
);

-- 20. Milestones Table
CREATE TABLE IF NOT EXISTS milestones (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Planned',
  target_date DATE NOT NULL,
  actual_date DATE,
  progress NUMERIC(5, 2) DEFAULT 0.0,
  health VARCHAR(20) NOT NULL DEFAULT 'On Track',
  type VARCHAR(50) NOT NULL DEFAULT 'Delivery',
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 21. Releases Table
CREATE TABLE IF NOT EXISTS releases (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE SET NULL,
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Planned',
  release_date DATE NOT NULL,
  actual_release_date DATE,
  health VARCHAR(20) NOT NULL DEFAULT 'On Track',
  description TEXT,
  created_by VARCHAR(64),
  updated_by VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 22. Governance Links Table (Many-to-Many Cross Linking)
CREATE TABLE IF NOT EXISTS governance_links (
  id VARCHAR(64) PRIMARY KEY,
  governance_type VARCHAR(32) NOT NULL, -- risk, issue, dependency, milestone, release
  governance_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NOT NULL, -- portfolio, product, project, epic, feature, story, task, sprint, milestone, release
  target_id VARCHAR(64) NOT NULL,
  target_code VARCHAR(50),
  target_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 23. Release Items Association Table
CREATE TABLE IF NOT EXISTS release_items (
  id VARCHAR(64) PRIMARY KEY,
  release_id VARCHAR(64) NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  item_type VARCHAR(32) NOT NULL, -- epic, feature, story, task, milestone
  item_id VARCHAR(64) NOT NULL,
  item_code VARCHAR(50),
  item_title VARCHAR(255),
  status VARCHAR(50),
  progress NUMERIC(5, 2) DEFAULT 0.0,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sprint 5 Indices
CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_product ON risks(product_id);
CREATE INDEX IF NOT EXISTS idx_risks_owner ON risks(owner_id);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_severity ON risks(severity);
CREATE INDEX IF NOT EXISTS idx_risks_score ON risks(risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);

CREATE INDEX IF NOT EXISTS idx_deps_source ON dependencies(source_entity_id, source_entity_type);
CREATE INDEX IF NOT EXISTS idx_deps_target ON dependencies(target_entity_id, target_entity_type);
CREATE INDEX IF NOT EXISTS idx_deps_status ON dependencies(status);
CREATE INDEX IF NOT EXISTS idx_deps_criticality ON dependencies(criticality);
CREATE INDEX IF NOT EXISTS idx_deps_owner ON dependencies(owner_id);
CREATE INDEX IF NOT EXISTS idx_deps_project ON dependencies(project_id);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_date ON milestones(target_date);

CREATE INDEX IF NOT EXISTS idx_releases_product ON releases(product_id);
CREATE INDEX IF NOT EXISTS idx_releases_project ON releases(project_id);
CREATE INDEX IF NOT EXISTS idx_releases_status ON releases(status);

CREATE INDEX IF NOT EXISTS idx_gov_links_lookup ON governance_links(governance_id, governance_type);
CREATE INDEX IF NOT EXISTS idx_gov_links_target ON governance_links(target_id, target_type);

CREATE INDEX IF NOT EXISTS idx_release_items ON release_items(release_id);


