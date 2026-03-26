-- PS Module — Phase 4: Resource Requests (Demand)

CREATE TABLE IF NOT EXISTS "ps_resource_requests" (
  "id" serial PRIMARY KEY,
  "workspace_id" integer NOT NULL,
  "ps_system_id" integer NOT NULL REFERENCES "ps_systems"("id") ON DELETE CASCADE,
  "role" varchar(200) NOT NULL,
  "capability_tags" json DEFAULT '[]',
  "quantity" integer NOT NULL DEFAULT 1,
  "seniority_level" varchar(50) DEFAULT 'mid',
  "start_date" timestamp,
  "end_date" timestamp,
  "allocation_percentage" integer DEFAULT 100,
  "status" varchar(30) NOT NULL DEFAULT 'draft',
  "created_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ps_resource_requests_ws_idx" ON "ps_resource_requests" ("workspace_id");
CREATE INDEX IF NOT EXISTS "ps_resource_requests_system_idx" ON "ps_resource_requests" ("ps_system_id");
CREATE INDEX IF NOT EXISTS "ps_resource_requests_status_idx" ON "ps_resource_requests" ("status");
