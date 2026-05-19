-- Manual migration: tsvector GIN index for vault search.
--
-- Slice 27 of the no-deferral continuation catalogue (2026-05-19).
-- Closes the `services/vault/router.ts:search` skeleton with a
-- tsvector-backed `AsdbVaultSearchService`.
--
-- ASDB does not run Drizzle SQL migrations (it uses a table-by-table
-- seed reconciler). This file is operator-applied via
-- `psql $DATABASE_URL_ASDB -f scripts/migrations/manual/ags-vault-notes-content-tsvector.sql`
-- once per deployment.
--
-- Index is functional + expression-based (matches the executor's
-- `to_tsvector('english', content_md)` predicate exactly).
--
-- Safe to re-run: uses `IF NOT EXISTS` + `CONCURRENTLY` skipped to keep
-- the statement atomic. CONCURRENTLY can be added by the operator if
-- the table has grown large enough that an exclusive lock matters.

CREATE INDEX IF NOT EXISTS ags_vault_note_versions_content_tsvector
  ON ags_vault_note_versions
  USING GIN (to_tsvector('english', content_md));
