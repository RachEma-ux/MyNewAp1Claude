-- 0019_catalog_execution_observability.sql
-- Minimal catalog-first execution audit trail

CREATE TABLE IF NOT EXISTS "execution_runs" (
  "id" serial PRIMARY KEY,
  "catalogEntryId" integer NOT NULL,
  "sourceAgentId" integer,
  "conversationId" integer,
  "actorUserId" integer,
  "triggerSource" varchar(50) NOT NULL,
  "state" varchar(20) NOT NULL DEFAULT 'created',
  "provider" varchar(255),
  "modelId" varchar(255),
  "startedAt" timestamp NOT NULL DEFAULT now(),
  "firstTokenAt" timestamp,
  "completedAt" timestamp,
  "success" boolean,
  "blockerCode" varchar(100),
  "blockerCategory" varchar(100),
  "blockerSummary" text,
  "finishReason" varchar(50),
  "metadata" json
);

CREATE INDEX IF NOT EXISTS "idx_execution_runs_entry" ON "execution_runs"("catalogEntryId");
CREATE INDEX IF NOT EXISTS "idx_execution_runs_conversation" ON "execution_runs"("conversationId");
CREATE INDEX IF NOT EXISTS "idx_execution_runs_state" ON "execution_runs"("state");
CREATE INDEX IF NOT EXISTS "idx_execution_runs_started" ON "execution_runs"("startedAt");
