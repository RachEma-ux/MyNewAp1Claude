-- RAC Phase 2 — Source Registry
--
-- Four ASDB tables that let an agent declare which retrieval sources
-- (documents, memory, graph index, workspace context, etc.) are eligible
-- for retrieval, with their priority, embedding binding (D-EMB-1), and
-- per-profile retrieval policy overrides (D-RET-5).
--
-- - ags_rac_profiles:
--     A retrieval profile per agent draft (multiple permitted via
--     `profile_key`, e.g. "default" / "research"). Sources and policies
--     attach to a profile.
-- - ags_rac_sources:
--     Per-source row carrying the (provider_connection_id, model_ref,
--     dim, version) embedding binding (NULL → workspace default).
--     Per D-RET-2, chunk_size / chunk_overlap may be overridden per source.
-- - ags_rac_policies:
--     Per-profile retrieval-policy overrides (D-RET-5). NULL columns
--     fall back to the canonical defaults documented in the decision
--     record.
-- - ags_rac_workspace_embedding_default:
--     Workspace-level embedding fallback (D-EMB-4). Required before a
--     source row is inserted with NULL embedding refs (D-EMB-5: no
--     silent vendor fallback).
--
-- Cross-module FKs are deliberately not declared (the AS module owns no
-- foreign keys to other modules' tables); referential integrity is
-- enforced at the service layer via the cross-module gateway.
--
-- Idempotent (CREATE IF NOT EXISTS) so re-runs against partially-migrated
-- DBs survive. Journal entry idx=40, when=1781395200000.

CREATE TABLE IF NOT EXISTS "ags_rac_profiles" (
  "id"                serial PRIMARY KEY,
  "workspace_id"      integer NOT NULL,
  "agent_id"          integer NOT NULL,
  "agent_draft_id"    integer NOT NULL,
  "profile_key"       varchar(64) NOT NULL DEFAULT 'default',
  "enabled"           boolean NOT NULL DEFAULT true,
  "timeout_ms"        integer,
  "notes"             text,
  "created_by"        integer NOT NULL,
  "created_at"        timestamp NOT NULL DEFAULT now(),
  "updated_at"        timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ags_rac_profile_draft_key"
  ON "ags_rac_profiles" ("agent_draft_id", "profile_key");

CREATE INDEX IF NOT EXISTS "idx_ags_rac_profile_ws_agent"
  ON "ags_rac_profiles" ("workspace_id", "agent_id");

CREATE TABLE IF NOT EXISTS "ags_rac_sources" (
  "id"                                serial PRIMARY KEY,
  "workspace_id"                      integer NOT NULL,
  "profile_id"                        integer NOT NULL REFERENCES "ags_rac_profiles" ("id") ON DELETE CASCADE,
  "source_type"                       varchar(32) NOT NULL,
  "owner_module"                      varchar(32) NOT NULL,
  "external_ref_id"                   varchar(255),
  "display_name"                      varchar(255),
  "enabled"                           boolean NOT NULL DEFAULT true,
  "priority"                          integer NOT NULL DEFAULT 50,
  -- D-EMB-1: embedding binding (NULL → workspace default per D-EMB-4)
  "embedding_provider_connection_id"  integer,
  "embedding_model_ref"               varchar(255),
  "embedding_model_dim"               integer,
  "embedding_model_version"           varchar(64),
  "embedding_model_pinned_at"         timestamp,
  -- D-RET-2: chunk override (NULL → defaults)
  "chunk_size_override"               integer,
  "chunk_overlap_override"            integer,
  "metadata_json"                     jsonb,
  "created_by"                        integer NOT NULL,
  "created_at"                        timestamp NOT NULL DEFAULT now(),
  "updated_at"                        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ags_rac_sources_profile"
  ON "ags_rac_sources" ("profile_id");

CREATE INDEX IF NOT EXISTS "idx_ags_rac_sources_ws_type"
  ON "ags_rac_sources" ("workspace_id", "source_type");

CREATE INDEX IF NOT EXISTS "idx_ags_rac_sources_priority"
  ON "ags_rac_sources" ("profile_id", "priority" DESC);

CREATE TABLE IF NOT EXISTS "ags_rac_policies" (
  "id"                        serial PRIMARY KEY,
  "workspace_id"              integer NOT NULL,
  "profile_id"                integer NOT NULL REFERENCES "ags_rac_profiles" ("id") ON DELETE CASCADE,
  -- D-RET-5: NULL columns mean "use canonical defaults"
  "min_score"                 real,
  "max_chunks"                integer,
  "dedupe_by"                 varchar(32),
  "freshness_max_age_days"    integer,
  "citation_required"         boolean,
  "source_permission_filter"  varchar(64),
  "pii_policy"                varchar(16),
  "license_policy"            varchar(16),
  "timeout_ms"                integer,
  "created_by"                integer NOT NULL,
  "created_at"                timestamp NOT NULL DEFAULT now(),
  "updated_at"                timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ags_rac_policy_profile"
  ON "ags_rac_policies" ("profile_id");

CREATE TABLE IF NOT EXISTS "ags_rac_workspace_embedding_default" (
  "workspace_id"                      integer PRIMARY KEY,
  "embedding_provider_connection_id"  integer NOT NULL,
  "embedding_model_ref"               varchar(255) NOT NULL,
  "embedding_model_dim"               integer NOT NULL,
  "created_by"                        integer NOT NULL,
  "created_at"                        timestamp NOT NULL DEFAULT now(),
  "updated_at"                        timestamp NOT NULL DEFAULT now()
);
