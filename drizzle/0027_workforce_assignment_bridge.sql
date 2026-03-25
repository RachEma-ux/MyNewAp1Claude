-- Migration: Workforce Assignment Bridge
-- Cross-domain governed bridge: PM Central (demand) <-> HR (workforce) <-> OM (structure)

CREATE TABLE IF NOT EXISTS "resource_requests" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL,
  "wbs_id" integer,
  "requested_role" varchar(100) NOT NULL,
  "required_skill" varchar(200),
  "required_level" varchar(30),
  "allocation_percent" integer NOT NULL DEFAULT 100,
  "start_date" date NOT NULL,
  "end_date" date,
  "location_mode" varchar(30) DEFAULT 'any',
  "budget_limit" integer,
  "status" varchar(30) NOT NULL DEFAULT 'draft',
  "requester_id" integer NOT NULL,
  "metadata" json,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "rr_project_idx" ON "resource_requests" ("project_id");
CREATE INDEX IF NOT EXISTS "rr_status_idx" ON "resource_requests" ("status");
CREATE INDEX IF NOT EXISTS "rr_requester_idx" ON "resource_requests" ("requester_id");

CREATE TABLE IF NOT EXISTS "resource_assignments" (
  "id" serial PRIMARY KEY,
  "request_id" integer NOT NULL,
  "employee_id" integer NOT NULL,
  "position_id" integer,
  "project_id" integer NOT NULL,
  "wbs_id" integer,
  "project_role" varchar(100) NOT NULL,
  "function_id" integer,
  "allocation_percent" integer NOT NULL DEFAULT 100,
  "start_date" date NOT NULL,
  "end_date" date,
  "status" varchar(30) NOT NULL DEFAULT 'pending',
  "approved_by" integer,
  "approval_status" varchar(30) NOT NULL DEFAULT 'pending',
  "cost_rate_source" varchar(50),
  "utilization_state" varchar(30) DEFAULT 'untracked',
  "authority_chain" json,
  "metadata" json,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ra_request_idx" ON "resource_assignments" ("request_id");
CREATE INDEX IF NOT EXISTS "ra_employee_idx" ON "resource_assignments" ("employee_id");
CREATE INDEX IF NOT EXISTS "ra_project_idx" ON "resource_assignments" ("project_id");
CREATE INDEX IF NOT EXISTS "ra_status_idx" ON "resource_assignments" ("status");
