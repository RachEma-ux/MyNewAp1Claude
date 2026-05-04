# Catalog Source Mapping — Plan v3 Phase 23 Evidence Report

**Plan v3 Phase 23 deliverable.** Documents the `catalog_entries` source linkage shape and how legacy rows map onto it. The migration `0038_catalog_source_versioning.sql` adds two new columns (`active_source_version_id`, `legacy_import_state`) which, combined with the existing `sourceType` + `sourceId` pair, give Phase 25's `aiTypes.catalog.register` everything it needs to update / register catalog entries without inventing yet another module-of-record.

## Schema verification (Phase 23 spec checklist)

| Spec item | Column | Verified |
|---|---|---|
| `catalog_entries` has `entryType` | `entryType varchar(50)` | ✓ — present since 0000 |
| `catalog_entries` has `sourceModule` or equivalent | `sourceType varchar(50)` *(equivalent — see "sourceType conventions" below)* | ✓ |
| `catalog_entries` has `sourceRefId` or equivalent | `sourceId integer` | ✓ |
| Add `activeSourceVersionId` or metadata equivalent | `active_source_version_id integer` *(NEW — Phase 23)* | ✓ |
| Add `legacyImport` fields or metadata | `legacy_import_state varchar(50)` *(NEW — Phase 23)* | ✓ |

## sourceType conventions

The existing `sourceType` column is the de facto "source module" pointer. After Phase 23, the canonical value table is:

| `sourceType` value | Meaning | `sourceId` points at | `active_source_version_id` points at |
|---|---|---|---|
| `ags_agent` | Agent Studio-published agent | `ags_agents.id` | `ags_agent_releases.id` (the published release) |
| `ai_type` | AI Types catalog row (loop — same table referenced for entry-of-entry mapping in legacy imports) | `catalog_entries.id` | n/a (use `ai_types_versions` once that table lands) |
| `provider` | Legacy `providers` table row | `providers.id` | `provider_versions.id` *(if/when versioning added)* |
| `model` | Legacy `models` table row | `models.id` | `model_versions.id` |
| `bot` | Legacy `bots` table row | `bots.id` | n/a |
| `llm` | Legacy LLM authority row | `llm_authority.id` | n/a |
| **null** | **Admin-created entry with no source linkage** | — | — |

Phase 23 does NOT change any existing values. It only adds the two new columns + documents the conventions.

## Mapping from legacy `sourceType` / `sourceId`

Pre-Plan-v3 catalog rows were written by:
- `server/llm/authority.ts:107` → `sourceType="llm"`, `sourceId=llm_authority.id`
- `server/routers/catalog-manage.ts:607-710` → various, depends on entry type
- `server/agent-studio/<old-publish-path>` *(deleted; rows persist)* → `sourceType="ags_agent"`, `sourceId=ags_agents.id`

For Agent Studio-sourced legacy rows (`sourceType="ags_agent"`), Phase 24's reconciliation will:
1. Look up `ags_agents.id = sourceId`.
2. If found AND that agent has a published release (`ags_agents.publishedVersionId IS NOT NULL`), set:
   - `legacy_import_state = "legacy_imported"`
   - `active_source_version_id = (SELECT id FROM ags_agent_releases WHERE agent_id = sourceId AND state = 'published' ORDER BY published_at DESC LIMIT 1)`
3. If `ags_agents.id = sourceId` is missing OR has no published release, set:
   - `legacy_import_state = "legacy_imported_unresolved"`
   - leave `active_source_version_id = null`

For other legacy `sourceType`s (`llm`, `model`, `provider`, `bot`), Phase 24 sets `legacy_import_state = "legacy_imported"` if the FK target exists, else `"legacy_imported_unresolved"`. Active version pointers stay null until those modules ship versioning.

For rows with `sourceType IS NULL`, `legacy_import_state` stays NULL — these are admin-created direct entries; they're not "legacy imports" in the Plan v3 sense, just rows that have no source domain.

## Backfill plan (Phase 24)

Phase 23 does NOT run any data writes. It ships:
- The schema migration `0038_catalog_source_versioning.sql` (adds columns + index).
- The drizzle table update.
- This evidence report.
- A schema-shape test that asserts the new columns exist.

Phase 24's backfill script (`scripts/catalog/phase-24-backfill-legacy-import.ts` — pending) implements the rules above with a `--dry-run` default. The reconciliation output gets a separate evidence report that lands with the Phase 24 PR.

## What Phase 23 explicitly does NOT do

- Does NOT change `sourceType` values for any existing row.
- Does NOT write `legacy_import_state` for any existing row (Phase 24 owns the backfill).
- Does NOT change behavior of any catalog read path — every read still returns the same shape; the new columns are present-but-unset on existing rows (`null`).
- Does NOT touch the `catalog_entry_versions` table — that's a separate versioning concept (snapshots of the entry's `config` blob), orthogonal to "which source-module version is this entry tracking".
