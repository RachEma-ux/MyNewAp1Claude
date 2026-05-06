-- Partial composite index on the dominant KB-listing query shape.
--
-- The kb-router's `listUnits` and `listFreshnessCounts` queries
-- (`server/agent-studio/api/kb-router.ts`) both filter on
-- `workspaceId` AND `archivedAt IS NULL` as the hot path; listUnits
-- additionally filters by sourceId; listFreshnessCounts groups by
-- freshnessState.
--
-- The existing indexes (`idx_ags_knowledge_units_ws_source`,
-- `idx_ags_knowledge_units_freshness`) cover those queries
-- partially. This partial index targets active-only rows (excluding
-- archived) and includes freshness_state in the column list so the
-- freshness-count query becomes index-only.

CREATE INDEX IF NOT EXISTS idx_ags_knowledge_units_active_listing
  ON ags_knowledge_units(workspace_id, source_id, freshness_state)
  WHERE archived_at IS NULL;
