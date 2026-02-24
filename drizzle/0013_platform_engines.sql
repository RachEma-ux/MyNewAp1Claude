-- 0013_platform_engines.sql
-- Platform Engines: module binding + PMT + Knowledge + Agents + Collaboration

-- ============================================================================
-- Workspace Module Bindings
-- ============================================================================

CREATE TABLE IF NOT EXISTS "workspace_modules" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "moduleKey" varchar(50) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "mode" varchar(50) DEFAULT 'standard' NOT NULL,
  "config" json,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  UNIQUE("workspaceId", "moduleKey")
);

CREATE TABLE IF NOT EXISTS "workspace_activity_log" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "moduleKey" varchar(50),
  "actorId" integer,
  "action" varchar(100) NOT NULL,
  "targetType" varchar(50),
  "targetId" integer,
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

-- ============================================================================
-- PMT Engine
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pmt_projects" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(255) NOT NULL,
  "description" text,
  "status" varchar(50) DEFAULT 'active' NOT NULL,
  "ownerId" integer REFERENCES "users"("id"),
  "riskLevel" varchar(20) DEFAULT 'low',
  "governanceStage" varchar(50),
  "metadata" json,
  "startDate" timestamp,
  "targetDate" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pmt_projects_ws" ON "pmt_projects"("workspaceId");

CREATE TABLE IF NOT EXISTS "pmt_tasks" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "title" varchar(500) NOT NULL,
  "description" text,
  "status" varchar(50) DEFAULT 'todo' NOT NULL,
  "priority" varchar(20) DEFAULT 'medium' NOT NULL,
  "assigneeId" integer REFERENCES "users"("id"),
  "assigneeType" varchar(20) DEFAULT 'human',
  "riskLevel" varchar(20) DEFAULT 'low',
  "confidenceScore" integer,
  "governanceStage" varchar(50),
  "dueDate" timestamp,
  "completedAt" timestamp,
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pmt_tasks_ws" ON "pmt_tasks"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pmt_tasks_project" ON "pmt_tasks"("projectId");
CREATE INDEX IF NOT EXISTS "idx_pmt_tasks_status" ON "pmt_tasks"("status");

CREATE TABLE IF NOT EXISTS "pmt_task_dependencies" (
  "id" serial PRIMARY KEY,
  "taskId" integer NOT NULL REFERENCES "pmt_tasks"("id"),
  "dependsOnId" integer NOT NULL REFERENCES "pmt_tasks"("id"),
  "type" varchar(20) DEFAULT 'blocks' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

-- ============================================================================
-- Knowledge Engine
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ke_documents" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "title" varchar(500) NOT NULL,
  "content" text,
  "contentType" varchar(50) DEFAULT 'markdown' NOT NULL,
  "status" varchar(50) DEFAULT 'draft' NOT NULL,
  "authorId" integer REFERENCES "users"("id"),
  "version" integer DEFAULT 1 NOT NULL,
  "tags" json,
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ke_docs_ws" ON "ke_documents"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_ke_docs_status" ON "ke_documents"("status");

CREATE TABLE IF NOT EXISTS "ke_document_versions" (
  "id" serial PRIMARY KEY,
  "documentId" integer NOT NULL REFERENCES "ke_documents"("id"),
  "version" integer NOT NULL,
  "content" text,
  "changeNote" text,
  "authorId" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ke_doc_versions_doc" ON "ke_document_versions"("documentId");

CREATE TABLE IF NOT EXISTS "ke_decisions" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "title" varchar(500) NOT NULL,
  "description" text,
  "status" varchar(50) DEFAULT 'proposed' NOT NULL,
  "outcome" text,
  "authorId" integer REFERENCES "users"("id"),
  "linkedDocumentId" integer REFERENCES "ke_documents"("id"),
  "evidenceRefs" json,
  "metadata" json,
  "decidedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ke_decisions_ws" ON "ke_decisions"("workspaceId");

-- ============================================================================
-- Agent Orchestration Engine
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ao_workspace_agents" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(255) NOT NULL,
  "description" text,
  "type" varchar(50) DEFAULT 'assistant' NOT NULL,
  "status" varchar(50) DEFAULT 'active' NOT NULL,
  "config" json,
  "tools" json,
  "scopePolicy" json,
  "principalUserId" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ao_agents_ws" ON "ao_workspace_agents"("workspaceId");

CREATE TABLE IF NOT EXISTS "ao_agent_runs" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "agentId" integer NOT NULL REFERENCES "ao_workspace_agents"("id"),
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "requestedBy" integer REFERENCES "users"("id"),
  "input" json,
  "output" json,
  "errorMessage" text,
  "startedAt" timestamp,
  "completedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ao_runs_ws" ON "ao_agent_runs"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_ao_runs_agent" ON "ao_agent_runs"("agentId");
CREATE INDEX IF NOT EXISTS "idx_ao_runs_status" ON "ao_agent_runs"("status");

CREATE TABLE IF NOT EXISTS "ao_agent_run_events" (
  "id" serial PRIMARY KEY,
  "runId" integer NOT NULL REFERENCES "ao_agent_runs"("id"),
  "eventType" varchar(50) NOT NULL,
  "data" json,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ao_agent_run_artifacts" (
  "id" serial PRIMARY KEY,
  "runId" integer NOT NULL REFERENCES "ao_agent_runs"("id"),
  "name" varchar(255) NOT NULL,
  "contentType" varchar(100),
  "content" text,
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

-- ============================================================================
-- Collaboration Engine
-- ============================================================================

CREATE TABLE IF NOT EXISTS "collab_threads" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "title" varchar(500) NOT NULL,
  "type" varchar(50) DEFAULT 'discussion' NOT NULL,
  "status" varchar(50) DEFAULT 'open' NOT NULL,
  "createdBy" integer REFERENCES "users"("id"),
  "linkedType" varchar(50),
  "linkedId" integer,
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_collab_threads_ws" ON "collab_threads"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_collab_threads_type" ON "collab_threads"("type");

CREATE TABLE IF NOT EXISTS "collab_thread_messages" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "threadId" integer NOT NULL REFERENCES "collab_threads"("id"),
  "authorId" integer REFERENCES "users"("id"),
  "authorType" varchar(20) DEFAULT 'human',
  "content" text NOT NULL,
  "metadata" json,
  "editedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_collab_messages_thread" ON "collab_thread_messages"("threadId");

CREATE TABLE IF NOT EXISTS "collab_thread_mentions" (
  "id" serial PRIMARY KEY,
  "messageId" integer NOT NULL REFERENCES "collab_thread_messages"("id"),
  "userId" integer REFERENCES "users"("id"),
  "mentionType" varchar(20) DEFAULT 'user',
  "createdAt" timestamp DEFAULT now() NOT NULL
);
