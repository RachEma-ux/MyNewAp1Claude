-- Manual ops migration — agsMcpToolKnowledge.knowledge_unit_id FK
--
-- Authority: M2-c5 closure (cycle-5 audit
--   `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md` §M2-c5).
-- Companion to PR-A drizzle declaration (`.references(() =>
--   agsKnowledgeUnits.id, { onDelete: "set null" })`).
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/ags-mcp-tool-knowledge-fk.sql
--
-- Pre-cycle-5 the column was bare `integer("knowledge_unit_id")` with
-- only a doc-comment claiming "FK to ags_knowledge_units" — no actual
-- constraint. If a knowledge unit was deleted the mirror row's
-- pointer became dangling silently.
--
-- Post-cycle-5 (PR-A) the drizzle declaration carries the FK with
-- `onDelete: "set null"` so historic-trace context survives unit
-- deletion (D-NKU-6: mirror rows are read by the trace path even
-- after their underlying unit is GC'd).
--
-- Why is this manual?
--   ASDB uses an idempotent table-by-table reconciler (see
--   `server/agent-studio/db/seed.ts`) that does NOT apply FK
--   constraints from drizzle declarations — verified empirically
--   (zero `references|foreign|FK` matches in seed.ts). ASDB-only
--   constraint changes live here and are operator-applied. Same
--   pattern as `kb-listing-partial-index.sql` and
--   `pgvector-optional-engine.sql`.
--
-- Impact when NOT applied:
--   New ASDB instances created by the reconciler get the column
--   without the FK constraint. Code-level lifecycle still works
--   (mirror rows carry `available=false` on disappearance), but
--   referential integrity at the DB layer is missing — a manual
--   `DELETE FROM ags_knowledge_units WHERE ...` outside the
--   application path can leave dangling mirror rows that the
--   constraint would have caught.

BEGIN;

-- 1. Cleanup any pre-existing orphan references first. Without this
--    the ALTER TABLE will fail if any mirror row points at a deleted
--    knowledge unit. Idempotent — no-op if all references are valid.
UPDATE ags_mcp_tool_knowledge mtk
   SET knowledge_unit_id = NULL,
       updated_at = NOW()
 WHERE mtk.knowledge_unit_id IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
         FROM ags_knowledge_units ku
        WHERE ku.id = mtk.knowledge_unit_id
   );

-- 2. Drop any prior FK on the column (idempotent re-application path).
ALTER TABLE ags_mcp_tool_knowledge
  DROP CONSTRAINT IF EXISTS ags_mcp_tool_knowledge_knowledge_unit_id_fkey;

-- 3. Add the FK with `ON DELETE SET NULL` semantics.
--    `set null` (not cascade) preserves the mirror row when its
--    underlying unit is deleted — the row still resolves historic
--    traces (D-NKU-6), with the unit pointer cleared. The mirror's
--    `available=false` semantics handle the lifecycle separately.
ALTER TABLE ags_mcp_tool_knowledge
  ADD CONSTRAINT ags_mcp_tool_knowledge_knowledge_unit_id_fkey
  FOREIGN KEY (knowledge_unit_id)
  REFERENCES ags_knowledge_units(id)
  ON DELETE SET NULL;

COMMIT;

-- Verification (run after the script completes):
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'ags_mcp_tool_knowledge_knowledge_unit_id_fkey';
--   -- Should show: FOREIGN KEY (knowledge_unit_id) REFERENCES
--   --              ags_knowledge_units(id) ON DELETE SET NULL
--
-- Back-out (returns to pre-cycle-5 bare-column state):
--   ALTER TABLE ags_mcp_tool_knowledge
--     DROP CONSTRAINT IF EXISTS
--     ags_mcp_tool_knowledge_knowledge_unit_id_fkey;
