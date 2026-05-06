-- RAC Phase 7 — Trace, observability, feedback
--
-- Three ASDB tables persist the RuntimeTraceMetrics object the P6
-- orchestrator already emits, plus a per-chunk context block ledger
-- (so the inspector can show what made it into the prompt) and a
-- thumbs-up/down feedback row keyed off the chat message.
--
-- - ags_rac_runtime_traces:
--     One row per chat turn that touched RAC. Mirrors the
--     RuntimeTraceMetrics shape one-to-one. retrieval_latency_ms is
--     REQUIRED non-null when retrieval ran (D-RET-6).
-- - ags_rac_context_blocks:
--     Per-source rendered chunk row — what citation, what content
--     hash, what score. Drives the per-chunk view in P11 UI.
-- - ags_rac_feedback:
--     thumbs_up | thumbs_down per (workspace, message_id).
--     Append-only via best-effort writes; one row per message.
--
-- Idempotent (CREATE IF NOT EXISTS). Journal entry idx=41,
-- when=1781481600000.

CREATE TABLE IF NOT EXISTS "ags_rac_runtime_traces" (
  "id"                          serial PRIMARY KEY,
  "workspace_id"                integer NOT NULL,
  "agent_id"                    integer NOT NULL,
  "agent_draft_id"              integer NOT NULL,
  "session_id"                  integer,
  "message_id"                  integer,
  "actor_id"                    integer NOT NULL,
  "mode"                        varchar(16) NOT NULL,
  "cag_pack_id"                 integer,
  "cag_pack_version"            integer,
  "retrieval_enabled"           boolean NOT NULL DEFAULT false,
  "retrieval_latency_ms"        integer,
  "chunks_returned"             integer NOT NULL DEFAULT 0,
  "chunks_filtered"             integer NOT NULL DEFAULT 0,
  "chunks_included"             integer NOT NULL DEFAULT 0,
  "truncated_by_budget"         integer NOT NULL DEFAULT 0,
  "token_budget_used"           integer,
  "token_budget_truncated"      integer NOT NULL DEFAULT 0,
  "citation_coverage"           real,
  "groundedness_score"          real,
  "fallback_reason"             varchar(64),
  "warnings_json"               jsonb,
  "per_source_latency_json"     jsonb,
  "created_at"                  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ags_rac_traces_ws_agent_created"
  ON "ags_rac_runtime_traces" ("workspace_id", "agent_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_ags_rac_traces_message"
  ON "ags_rac_runtime_traces" ("message_id");

CREATE INDEX IF NOT EXISTS "idx_ags_rac_traces_session"
  ON "ags_rac_runtime_traces" ("session_id");

CREATE TABLE IF NOT EXISTS "ags_rac_context_blocks" (
  "id"                  serial PRIMARY KEY,
  "trace_id"            integer NOT NULL REFERENCES "ags_rac_runtime_traces" ("id") ON DELETE CASCADE,
  "workspace_id"        integer NOT NULL,
  "source_id"           integer NOT NULL,
  "source_type"         varchar(32) NOT NULL,
  "source_chunk_id"     varchar(255) NOT NULL,
  "citation"            varchar(512),
  "content_hash"        varchar(128) NOT NULL,
  "score"               real NOT NULL,
  "rank"                integer NOT NULL,
  "source_latency_ms"   integer,
  "metadata_json"       jsonb,
  "created_at"          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ags_rac_blocks_trace"
  ON "ags_rac_context_blocks" ("trace_id", "rank");

CREATE INDEX IF NOT EXISTS "idx_ags_rac_blocks_source"
  ON "ags_rac_context_blocks" ("source_id");

CREATE TABLE IF NOT EXISTS "ags_rac_feedback" (
  "id"            serial PRIMARY KEY,
  "workspace_id"  integer NOT NULL,
  "agent_id"      integer NOT NULL,
  "message_id"    integer NOT NULL,
  "trace_id"      integer,
  "verdict"       varchar(16) NOT NULL,
  "note"          text,
  "created_by"    integer NOT NULL,
  "created_at"    timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ags_rac_feedback_message"
  ON "ags_rac_feedback" ("message_id");

CREATE INDEX IF NOT EXISTS "idx_ags_rac_feedback_ws_agent"
  ON "ags_rac_feedback" ("workspace_id", "agent_id");
