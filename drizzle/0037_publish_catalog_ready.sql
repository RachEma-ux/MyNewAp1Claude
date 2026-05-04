-- Plan v3 Phase 22 — export-candidate marker.
-- Adds catalog_ready_at to ags_agent_releases so publish can mark a
-- release as a catalog candidate WITHOUT itself writing to
-- catalog_entries. Phase 25's aiTypes.catalog.register reads this
-- column.

ALTER TABLE "ags_agent_releases"
  ADD COLUMN IF NOT EXISTS "catalog_ready_at" timestamp;
