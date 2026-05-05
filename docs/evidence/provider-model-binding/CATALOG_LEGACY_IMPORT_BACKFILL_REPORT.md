# Plan v3 Phase 24 — Catalog Legacy-Import Backfill Report

**Captured:** 2026-05-04 against main@8517385.

The Phase 24 backfill driver classifies pre-Plan-v3 `catalog_entries`
rows by populating `legacy_import_state` and `active_source_version_id`
(the Phase 23 columns). This report documents what the script does,
how to invoke it, and the dry-run shape captured at the snapshot.

---

## Script

`scripts/catalog/phase-24-backfill-legacy-import.ts` (~254 lines).

Three modes via CLI flag:

| Mode | Effect |
|---|---|
| `--dry-run` (default) | Reads rows, classifies, prints counts. No writes. |
| `--apply` | Same scan + writes the classifier verdict back to each row. Idempotent — rows already populated are skipped. |
| `--validate` | Runs the dry-run scan and exits non-zero if any row's current state disagrees with what the classifier would write. |

Cross-DB: reads `mynewap1claude` (catalog_entries) and `asdb`
(ags_agent_releases) to resolve `activeSourceVersionId` for
sourceType=agent rows.

---

## Classifier rules

Implemented in `server/ai-types/legacy-import.ts` `classifyLegacyImport`:

| Verdict | Triggered when |
|---|---|
| `legacy_imported_unresolved` | Row has `(sourceType, sourceId)` but no resolvable upstream source row (the AS agent or provider model the row points at no longer exists, or has no published version). |
| `legacy_imported` | Row has `(sourceType, sourceId)` AND the upstream resolves AND `activeSourceVersionId` can be derived. |
| `manually_reconciled` | Pre-existing administrative override carried in `metadata.reconciliation` — left alone by the backfill. |
| `null` | Plan-v3-native row (post-Phase 25). The backfill writes nothing. |

---

## Dry-run shape

Sample output from the dry-run mode against the local dev fixture:

```
[phase-24-backfill] mode=dry-run
[phase-24-backfill] scanning catalog_entries…
  total rows: <N>
  classifier verdicts:
    legacy_imported            : <count>
    legacy_imported_unresolved : <count>
    manually_reconciled        : <count>
    null (plan-v3-native)      : <count>
[phase-24-backfill] no writes performed (use --apply to persist).
```

The `--apply` mode prints the same scan summary plus the per-row
write count and any rows that failed individual writes (with the
DB error preserved).

---

## How the result connects to Phase 25 + Phase 41

- **Phase 25** uses `legacy_import_state` to gate `aiTypes.catalog.register`:
  - `null` → modern row, register may update via `updateCatalogEntry`.
  - `legacy_imported` → `RegisterDuplicateError` ("use update for modern rows").
  - `manually_reconciled` → `RegisterDuplicateError` (same reason).
  - `legacy_imported_unresolved` → `RegisterDuplicateError`
    ("must use reconcileLegacyImport").

- **Phase 41** reads the same column when classifying drift cases:
  rows in `legacy_imported_unresolved` are not eligible for the
  bulk sync repair — they need the per-row `reconcileLegacyImport`
  override (Phase 24-owned, exposed as
  `agentStudio.exportCatalog.reconcileImports` from Phase 30).

---

## Test coverage

`server/ai-types/legacy-import.test.ts` covers:

- The classifier function across all four verdicts
- `checkDuplicateLegacyImport` for the four register-guard outcomes
- `reconcileLegacyImport` round-trip (legacy_imported_unresolved →
  manually_reconciled with `metadata.reconciliation` set)
- `scanUnclassifiedRows` boundary cases

---

## Migration status

The backfill script is idempotent and re-runnable. As of the
snapshot, the live cut at main@8517385 carries the Phase 23 columns
and the Phase 24 classifier. The `--apply` mode hasn't been run
against production data yet — the production run is a separate
operational step not gated by Plan v3 phase progression.

A failed apply would not break Phase 25's register path: the guard
treats any non-null `legacy_import_state` value as "use the right
write path" and rejects bare register attempts. Pre-apply rows
(`legacy_import_state = NULL`) are treated as Plan-v3-native and
go through `updateCatalogEntry` on register collision.

---

## Where to read more

- `server/ai-types/legacy-import.ts` — classifier + reconcile primitives
- `scripts/catalog/phase-24-backfill-legacy-import.ts` — driver
- `docs/architecture/provider-model-binding/CATALOG_SOURCE_MAPPING.md` — Phase 23 schema rationale
- `docs/architecture/provider-model-binding/CATALOG_WRITER_MIGRATION_MATRIX.md` — Phase 25 caller fates
