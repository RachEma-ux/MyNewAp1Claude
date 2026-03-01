-- 0018_agent_engine.sql
-- Agent Engine: runs, drafts, audit tables for PM Central multi-agent orchestration

-- ============================================================================
-- Agent Runs — orchestrated agent run instances
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pmt_agent_runs" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "runType" varchar(50) NOT NULL,
  "packId" varchar(100) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "phase" varchar(20),
  "planDag" json,
  "outputs" json,
  "initiatedBy" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pmt_agent_runs_project" ON "pmt_agent_runs"("projectId");
CREATE INDEX IF NOT EXISTS "idx_pmt_agent_runs_status" ON "pmt_agent_runs"("status");
CREATE INDEX IF NOT EXISTS "idx_pmt_agent_runs_type" ON "pmt_agent_runs"("runType");

-- ============================================================================
-- Agent Drafts — draft outputs from agents (require human commit)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pmt_agent_drafts" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "runId" integer NOT NULL REFERENCES "pmt_agent_runs"("id"),
  "artifactType" varchar(50) NOT NULL,
  "content" json,
  "sourceAgentAlias" varchar(100) NOT NULL,
  "catalogEntryId" integer,
  "requiresHumanReview" boolean NOT NULL DEFAULT true,
  "commitStatus" varchar(20) NOT NULL DEFAULT 'pending',
  "committedBy" integer REFERENCES "users"("id"),
  "committedAt" timestamp,
  "rejectReason" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pmt_agent_drafts_project" ON "pmt_agent_drafts"("projectId");
CREATE INDEX IF NOT EXISTS "idx_pmt_agent_drafts_run" ON "pmt_agent_drafts"("runId");
CREATE INDEX IF NOT EXISTS "idx_pmt_agent_drafts_commit_status" ON "pmt_agent_drafts"("commitStatus");

-- ============================================================================
-- Agent Audit — immutable audit trail for every agent action
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pmt_agent_audit" (
  "id" serial PRIMARY KEY,
  "runId" integer NOT NULL REFERENCES "pmt_agent_runs"("id"),
  "agentAlias" varchar(100) NOT NULL,
  "eventType" varchar(50) NOT NULL,
  "payload" json,
  "payloadHash" varchar(64),
  "actorId" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pmt_agent_audit_run" ON "pmt_agent_audit"("runId");
CREATE INDEX IF NOT EXISTS "idx_pmt_agent_audit_event" ON "pmt_agent_audit"("eventType");
CREATE INDEX IF NOT EXISTS "idx_pmt_agent_audit_created" ON "pmt_agent_audit"("createdAt");

-- ============================================================================
-- Governance tables (if not already created)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pmt_gate_requests" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "gateId" varchar(50) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "requestedBy" integer REFERENCES "users"("id"),
  "reviewedBy" integer REFERENCES "users"("id"),
  "evidence" json,
  "comments" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pmt_gate_requests_project" ON "pmt_gate_requests"("projectId");
CREATE INDEX IF NOT EXISTS "idx_pmt_gate_requests_gate" ON "pmt_gate_requests"("gateId");
CREATE INDEX IF NOT EXISTS "idx_pmt_gate_requests_status" ON "pmt_gate_requests"("status");

CREATE TABLE IF NOT EXISTS "pmt_change_requests" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "title" varchar(500) NOT NULL,
  "description" text,
  "category" varchar(50),
  "impact" varchar(20),
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "requestedBy" integer REFERENCES "users"("id"),
  "reviewedBy" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pmt_change_requests_project" ON "pmt_change_requests"("projectId");
CREATE INDEX IF NOT EXISTS "idx_pmt_change_requests_status" ON "pmt_change_requests"("status");

CREATE TABLE IF NOT EXISTS "pmt_project_artifacts" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "artifactType" varchar(50) NOT NULL,
  "name" varchar(500) NOT NULL,
  "content" json,
  "version" integer DEFAULT 1,
  "createdBy" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pmt_project_artifacts_project" ON "pmt_project_artifacts"("projectId");
CREATE INDEX IF NOT EXISTS "idx_pmt_project_artifacts_type" ON "pmt_project_artifacts"("artifactType");

CREATE TABLE IF NOT EXISTS "pmt_state_transitions" (
  "id" serial PRIMARY KEY,
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "fromState" varchar(30) NOT NULL,
  "toState" varchar(30) NOT NULL,
  "event" varchar(50),
  "triggeredBy" integer REFERENCES "users"("id"),
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pmt_state_transitions_project" ON "pmt_state_transitions"("projectId");
CREATE INDEX IF NOT EXISTS "idx_pmt_state_transitions_created" ON "pmt_state_transitions"("createdAt");
