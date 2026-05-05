-- RAC Phase 1A — CAG (Capability Pack) schema
--
-- Adds two append-friendly tables in ASDB for stable capability packs
-- and their event log. Per RAC_EXECUTION_PLAN.md Phase 1A.
--
-- - ags_cag_capability_packs:
--     One row per (agent_draft_id, pack_version). Versioned, status
--     transitions append a new pack rather than mutating in place.
-- - ags_cag_pack_events:
--     Append-only event log: pack_created / pack_marked_stale /
--     pack_used / pack_validation_failed / etc.
--
-- Idempotent (CREATE IF NOT EXISTS) so re-runs against partially-migrated
-- DBs survive. Migration journal entry idx=39, when=1781308800000.

CREATE TABLE IF NOT EXISTS "ags_cag_capability_packs" (
  "id"                    serial PRIMARY KEY,
  "workspace_id"          integer NOT NULL,
  "agent_id"              integer NOT NULL,
  "agent_draft_id"        integer NOT NULL,
  "catalog_entry_id"      integer,
  "pack_type"             varchar(50) NOT NULL DEFAULT 'capability_v1',
  "pack_version"          integer NOT NULL DEFAULT 1,
  "status"                varchar(32) NOT NULL DEFAULT 'fresh',
  "content_json"           jsonb NOT NULL,
  "compressed_prompt"     text,
  "token_estimate"        integer,
  "source_manifest_json"   jsonb NOT NULL,
  "source_hashes_json"     jsonb NOT NULL,
  "injection_policy_json"  jsonb,
  "risk_summary_json"      jsonb,
  "created_by"            integer NOT NULL,
  "created_at"            timestamp NOT NULL DEFAULT now(),
  "updated_at"            timestamp NOT NULL DEFAULT now(),
  "expires_at"            timestamp,
  "last_used_at"          timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ags_cag_pack_draft_version"
  ON "ags_cag_capability_packs" ("agent_draft_id", "pack_version");

CREATE INDEX IF NOT EXISTS "idx_ags_cag_pack_status"
  ON "ags_cag_capability_packs" ("status");

CREATE INDEX IF NOT EXISTS "idx_ags_cag_pack_ws_agent"
  ON "ags_cag_capability_packs" ("workspace_id", "agent_id");

CREATE TABLE IF NOT EXISTS "ags_cag_pack_events" (
  "id"              serial PRIMARY KEY,
  "workspace_id"    integer NOT NULL,
  "agent_draft_id"  integer NOT NULL,
  "pack_id"         integer,
  "event_type"      varchar(50) NOT NULL,
  "event_severity"  varchar(20) NOT NULL DEFAULT 'info',
  "reason"          varchar(255),
  "old_hash"        varchar(128),
  "new_hash"        varchar(128),
  "runtime_run_id"  integer,
  "actor_type"      varchar(20),
  "source_type"     varchar(50),
  "pack_version"    integer,
  "created_by"      integer,
  "created_at"      timestamp NOT NULL DEFAULT now(),
  "metadata_json"   jsonb
);

CREATE INDEX IF NOT EXISTS "idx_ags_cag_events_draft_created"
  ON "ags_cag_pack_events" ("agent_draft_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_ags_cag_events_pack"
  ON "ags_cag_pack_events" ("pack_id");
