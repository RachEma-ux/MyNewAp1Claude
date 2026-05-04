-- Plan v3 Phase 23 — catalog schema verification + source versioning.
--
-- Adds:
--   - active_source_version_id (int): pointer to the versioned source
--     (e.g. ags_agent_releases.id for Agent Studio-sourced entries).
--   - legacy_import_state (varchar(50)): classification for rows that
--     pre-date Plan v3's aiTypes.catalog.register pipeline.
--
-- Phase 24 will run a backfill against this column to classify every
-- existing row.

ALTER TABLE "catalog_entries"
  ADD COLUMN IF NOT EXISTS "active_source_version_id" integer;

ALTER TABLE "catalog_entries"
  ADD COLUMN IF NOT EXISTS "legacy_import_state" varchar(50);

CREATE INDEX IF NOT EXISTS "idx_catalog_entry_legacy_import"
  ON "catalog_entries" ("legacy_import_state");
