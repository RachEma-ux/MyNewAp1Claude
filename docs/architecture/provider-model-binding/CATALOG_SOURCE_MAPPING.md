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
| `model` | **Legacy** `models` table row (local-download / GGUF management — see `ARCHITECTURE.md` Database Schema) | `models.id` | `model_versions.id` |
| `ai_type_model` *(added 2026-05-23 — see §"AI Types domain-table extension")* | AI Types domain model row (the canonical model registry referenced by the binding picker + Model Access) | `ai_type_models.id` | n/a (versioning lives at the catalog-entry layer) |
| `bot` | Legacy `bots` table row | `bots.id` | n/a |
| `llm` | **Legacy** LLM authority row | `llm_authority.id` | n/a |
| `ai_type_llm` *(added 2026-05-23 — see §"AI Types domain-table extension")* | AI Types domain LLM row (the canonical LLM registry) | `ai_type_llms.id` | n/a |
| **null** | **Admin-created entry with no source linkage** | — | — |

Phase 23 does NOT change any existing values. It only adds the two new columns + documents the conventions. The 2026-05-23 extension at the end of this document adds two values to the table for the AI Types domain tables that were silently writing `sourceType="model"` / `"llm"` in disagreement with this table.

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

Phase 24's backfill script (`scripts/catalog/phase-24-backfill-legacy-import.ts`) implements the rules above with a `--dry-run` default. Modes: `--dry-run` (scan only), `--apply` (writes `legacy_import_state` and `active_source_version_id`), `--validate` (post-apply assertion that no source-bearing row remains unclassified). Output lands at `docs/evidence/provider-model-binding/CATALOG_LEGACY_IMPORT_BACKFILL_REPORT.md`. Idempotent — re-running `--apply` on already-classified rows is a no-op.

The classifier and the duplicate-prevention guard live in `server/ai-types/legacy-import.ts` (Plan v3 D6 — AI Types owns `catalog_entries`). Phase 25's `aiTypes.catalog.register` calls `checkDuplicateLegacyImport()` before INSERT to prevent a second row appearing on top of an already-imported `(sourceType, sourceId)` pair. The Reconcile Legacy Import action (`reconcileLegacyImport()`) is the only path that flips an `unresolved` row to `manually_reconciled`.

## What Phase 23 explicitly does NOT do

- Does NOT change `sourceType` values for any existing row.
- Does NOT write `legacy_import_state` for any existing row (Phase 24 owns the backfill).
- Does NOT change behavior of any catalog read path — every read still returns the same shape; the new columns are present-but-unset on existing rows (`null`).
- Does NOT touch the `catalog_entry_versions` table — that's a separate versioning concept (snapshots of the entry's `config` blob), orthogonal to "which source-module version is this entry tracking".

---

## AI Types domain-table extension (2026-05-23)

This section extends the canonical `sourceType` table above with two new values — `ai_type_model` and `ai_type_llm` — for the AI Types domain tables that landed after Phase 23 was first written.

### Motivation

Phase 23 (above) named the `model` / `llm` sourceTypes as pointers to the **legacy** `models` / `llm_authority` tables. The AI Types domain build-out (`docs/architecture/ai-types-domain.md`) added two new domain-truth tables — `ai_type_models` and `ai_type_llms` — but the projection code (`server/ai-types/projection.ts:124` `linkCatalogToDomain` + its callers in `server/ai-types/migration.ts:93,125` and `server/ai-types/service.ts`) silently overloaded the existing `"model"` and `"llm"` values to point at the new tables, contradicting the canonical mapping. A 2026-05-23 audit of the Agent Studio binding picker exposed the drift: the picker reader queried one convention, the writer wrote another, and neither matched this doc.

The extension resolves the conflict by **adding** two canonical values rather than re-using the legacy ones. The legacy `model` / `llm` values keep their original Phase 23 semantics; the new `ai_type_model` / `ai_type_llm` values are the canonical sourceType for AI Types domain rows from this date forward.

### Locked rules

1. **Domain-row writers MUST use the new values.** `server/ai-types/projection.ts` `linkCatalogToDomain` and every caller (`migration.ts`, `service.ts`) write `sourceType="ai_type_model"` for `ai_type_models.id` and `sourceType="ai_type_llm"` for `ai_type_llms.id`.
2. **Domain-row readers MUST query the new values.** `server/ai-types/provider-models-availability.ts:251` and any equivalent reader of `catalog_entries` for AI Types domain rows.
3. **The legacy `model` / `llm` values remain reserved** for any pre-existing rows still pointing at `models.id` / `llm_authority.id` (per the Phase 23 mapping). Phase 24's backfill report (`docs/evidence/provider-model-binding/CATALOG_LEGACY_IMPORT_BACKFILL_REPORT.md`) is the authority on which existing rows fall under the legacy mapping vs. the new mapping.
4. **`AIEntryType` is `entryType`, not `sourceType`.** The enum at `server/ai-types/types.ts:10` defines the `catalog_entries.entryType` taxonomy (`"provider" | "llm" | "model" | "agent" | "bot"` — what kind of asset). The `sourceType` column is a separate vocabulary tied to source-of-truth tables. Conflating the two is the root cause of the drift this extension corrects.

### Migration shape

Code changes that adopt this extension are tracked separately (PR #1700's `provider-models-availability.ts` change is being revised to align with this extension). Schema is unchanged — these are new permissible values for the existing `varchar(50)` `sourceType` column, not a new column.

### What this extension explicitly does NOT do

- Does NOT change the meaning of the existing `model` / `llm` sourceType values. Legacy rows that already use those values continue to point at `models.id` / `llm_authority.id`.
- Does NOT add new columns to `catalog_entries`. Only new permissible values for the existing `sourceType` text column.
- Does NOT prescribe a backfill of existing rows. Any rows currently written with `sourceType="model"` pointing at `ai_type_models.id` are pre-extension drift; their reconciliation strategy (rename to `ai_type_model` vs. leave + adapt readers) is the implementation PR's call, not this doc's.
- Does NOT change `entryType` semantics. The `entryType` column still uses the `AIEntryType` enum.
