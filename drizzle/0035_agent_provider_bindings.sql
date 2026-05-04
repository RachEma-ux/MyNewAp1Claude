-- Plan v3 Phase 11 — Agent Studio provider bindings table.
-- Migration spec: docs/architecture/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION.md §3.1
--
-- Replaces the legacy ags_agent_drafts.provider_config jsonb shape
-- (raw apiKey / apiKeyEnvVar) with a structured row that pairs an
-- ASDB draft with a Provider Connection ID + AI Types catalog refs.
--
-- This table lives in ASDB (Agent Studio's owned database) alongside
-- the rest of ags_*.

CREATE TABLE IF NOT EXISTS "ags_agent_provider_bindings" (
  "id" serial PRIMARY KEY,
  "workspace_id" integer NOT NULL,
  "agent_id" integer NOT NULL,
  "draft_id" integer NOT NULL,
  "role" varchar(32) NOT NULL DEFAULT 'primary',
  "provider_catalog_entry_id" integer,
  "model_catalog_entry_id" integer,
  "provider_connection_id" integer,
  "model_ref" varchar(255) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'binding_v1',
  "status_reason" varchar(64),
  "legacy_env_var_hint" varchar(255),
  "created_by" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ags_agent_provider_bindings_draft_role"
  ON "ags_agent_provider_bindings" ("draft_id", "role");

CREATE INDEX IF NOT EXISTS "idx_ags_agent_provider_bindings_ws_agent"
  ON "ags_agent_provider_bindings" ("workspace_id", "agent_id");

CREATE INDEX IF NOT EXISTS "idx_ags_agent_provider_bindings_provider_connection"
  ON "ags_agent_provider_bindings" ("provider_connection_id");

CREATE INDEX IF NOT EXISTS "idx_ags_agent_provider_bindings_status"
  ON "ags_agent_provider_bindings" ("status");
