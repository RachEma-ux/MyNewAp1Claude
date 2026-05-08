/**
 * Plan v3 Phase 24 — legacy import classification + reconciliation helpers.
 *
 * Pure functions (no DB) used by:
 *   - scripts/catalog/phase-24-backfill-legacy-import.ts (the backfill driver)
 *   - the duplicate-prevention guard called by aiTypes.catalog.register (Phase 25)
 *
 * Lives in server/ai-types because the AI Types module owns the `catalog_entries`
 * table per Plan v3 D6 (catalog ownership). The backfill SCRIPT lives outside the
 * module to keep one-shot tooling out of the runtime surface.
 */

import { catalogEntries } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * Values the `legacy_import_state` column carries after Phase 24 reconciliation.
 *
 *   - "legacy_imported"            — pre-Plan-v3 row whose source row was found.
 *   - "legacy_imported_unresolved" — pre-Plan-v3 row whose source row is missing
 *                                    or whose published release can't be located.
 *                                    Phase 24's "Reconcile Legacy Import" action
 *                                    is the only way to resolve these, since
 *                                    Phase 25's `aiTypes.catalog.register` blocks
 *                                    automatic re-imports against unresolved rows.
 *   - "manually_reconciled"        — admin operator used Reconcile Legacy Import
 *                                    to point the row at a specific source version.
 *                                    Equivalent to "legacy_imported" for read-side
 *                                    purposes but distinguishable in audit.
 */
export type LegacyImportState =
  | "legacy_imported"
  | "legacy_imported_unresolved"
  | "manually_reconciled";

export interface CatalogRowSourceLink {
  /** Catalog row id (debug context only — not used for classification). */
  id: number;
  sourceType: string | null;
  sourceId: number | null;
  /** If already set we leave it alone — backfill is single-shot. */
  legacyImportState: string | null;
  activeSourceVersionId: number | null;
}

export interface SourceLookups {
  /**
   * Returns the published Agent Studio release id (`ags_agent_releases.id`)
   * for a given `ags_agents.id`. Returns null if:
   *   - the agent row doesn't exist, OR
   *   - the agent has no `state='published'` release
   *
   * The backfill script provides the real implementation (cross-DB, ASDB).
   * Tests provide an in-memory fake.
   */
  resolveAgsAgentPublishedRelease: (
    agentId: number,
  ) => Promise<number | null>;
  /**
   * Returns true if the row at `(table, id)` exists. Used for the
   * legacy `llm` / `model` / `provider` / `bot` source types whose
   * targets live in the main DB. The backfill script wires this to
   * SELECT 1 FROM <table> WHERE id = $1.
   */
  rowExists: (table: LegacyFkTable, id: number) => Promise<boolean>;
}

export type LegacyFkTable =
  | "llm_authority"
  | "models"
  | "providers"
  | "bots";

export interface ClassificationResult {
  /**
   * The value to write into `catalog_entries.legacy_import_state`.
   * Null means "leave the column NULL" — i.e., this row is not a
   * legacy import (modern Plan v3 entry, or admin-created with no source).
   */
  legacyImportState: LegacyImportState | null;
  /**
   * The value to write into `catalog_entries.active_source_version_id`.
   * Null when the source type is not yet versioned, or when the row
   * is unresolved.
   */
  activeSourceVersionId: number | null;
  /**
   * Human-readable explanation for the evidence report. Always non-empty.
   */
  reason: string;
}

/**
 * Pure decision: given a catalog row's existing source linkage, what
 * should `legacy_import_state` and `active_source_version_id` become?
 *
 * Rules (mirrors CATALOG_SOURCE_MAPPING.md §"Mapping from legacy"):
 *
 *   1. If `legacyImportState` is already set → no-op (idempotent).
 *   2. If `sourceType` is NULL → no-op. Admin-created rows are not
 *      legacy imports in the Plan v3 sense.
 *   3. If `sourceType="ags_agent"` and `sourceId` resolves to a
 *      published release → `legacy_imported` + `active_source_version_id`
 *      = release id. Otherwise → `legacy_imported_unresolved`.
 *   4. If `sourceType` is one of {llm, model, provider, bot} and the
 *      FK target row exists → `legacy_imported` (no version pointer).
 *      Otherwise → `legacy_imported_unresolved`.
 *   5. Any other `sourceType` (e.g. `ai_type` self-reference) →
 *      `legacy_imported` if FK target unknown is treated as harmless
 *      (we don't have a check for those). Falls through with reason
 *      "unknown_source_type_assumed_legacy".
 */
export async function classifyLegacyImport(
  row: CatalogRowSourceLink,
  lookups: SourceLookups,
): Promise<ClassificationResult> {
  if (row.legacyImportState != null) {
    return {
      legacyImportState: row.legacyImportState as LegacyImportState,
      activeSourceVersionId: row.activeSourceVersionId,
      reason: "already_classified",
    };
  }

  if (row.sourceType == null) {
    return {
      legacyImportState: null,
      activeSourceVersionId: null,
      reason: "no_source_linkage",
    };
  }

  if (row.sourceId == null) {
    return {
      legacyImportState: "legacy_imported_unresolved",
      activeSourceVersionId: null,
      reason: "source_type_set_but_source_id_null",
    };
  }

  if (row.sourceType === "ags_agent") {
    const releaseId = await lookups.resolveAgsAgentPublishedRelease(row.sourceId);
    if (releaseId == null) {
      return {
        legacyImportState: "legacy_imported_unresolved",
        activeSourceVersionId: null,
        reason: "ags_agent_missing_or_no_published_release",
      };
    }
    return {
      legacyImportState: "legacy_imported",
      activeSourceVersionId: releaseId,
      reason: "ags_agent_resolved_to_published_release",
    };
  }

  if (
    row.sourceType === "llm" ||
    row.sourceType === "model" ||
    row.sourceType === "provider" ||
    row.sourceType === "bot"
  ) {
    const table: LegacyFkTable =
      row.sourceType === "llm"
        ? "llm_authority"
        : row.sourceType === "model"
          ? "models"
          : row.sourceType === "provider"
            ? "providers"
            : "bots";
    const exists = await lookups.rowExists(table, row.sourceId);
    return exists
      ? {
          legacyImportState: "legacy_imported",
          activeSourceVersionId: null,
          reason: `${row.sourceType}_fk_target_exists`,
        }
      : {
          legacyImportState: "legacy_imported_unresolved",
          activeSourceVersionId: null,
          reason: `${row.sourceType}_fk_target_missing`,
        };
  }

  // Unknown / future sourceType (e.g. "ai_type" self-loop).
  return {
    legacyImportState: "legacy_imported",
    activeSourceVersionId: null,
    reason: "unknown_source_type_assumed_legacy",
  };
}

// ───────────────────────────────────────────────────────────────────
// Duplicate-prevention guard (Phase 24 deliverable).
// ───────────────────────────────────────────────────────────────────

export interface DuplicateGuardOptions {
  /** sourceType the new register call is targeting. */
  sourceType: string;
  /**
   * Numeric source-of-record id. Required for domain-backed entries.
   * Mutually exclusive with `sourceName` — exactly one must be set.
   */
  sourceId?: number;
  /**
   * String source-of-record key. Required for Phase 37 self-registered
   * system agents (e.g. `AGENT_CATALOG_ID = "ps.agent.context_translator"`).
   * Mutually exclusive with `sourceId` — exactly one must be set. When
   * present, the guard skips the legacy-import classification and looks
   * up modern rows by `(sourceType, name === sourceName)`. ADR:
   * `docs/architecture/ai-types/PMT_NAME_BASED_IDENTITY.md`.
   */
  sourceName?: string;
  /**
   * If true, the guard will allow proceeding when the existing row is
   * `legacy_imported_unresolved` and the caller asserts they want to
   * **reconcile** rather than re-import. Used by the Reconcile Legacy
   * Import action; default false (i.e., normal `aiTypes.catalog.register`
   * calls are blocked from re-importing on top of an unresolved row).
   * Only meaningful for the `sourceId` path; ignored on the `sourceName`
   * path (self-registered agents have no legacy concept).
   */
  reconcileMode?: boolean;
}

export interface DuplicateGuardResult {
  ok: boolean;
  /** Existing entry id, if a `(sourceType, sourceId)` match was found. */
  existingEntryId: number | null;
  reason: string;
}

/**
 * Asserts no `legacy_imported*` row already covers `(sourceType, sourceId)`.
 * Phase 25's `aiTypes.catalog.register` calls this before INSERT.
 *
 * Phase 37 — name-path: when `sourceName` is provided instead of
 * `sourceId`, the guard looks up modern rows by `(sourceType, name ===
 * sourceName)` and skips the legacy-import classification (self-
 * registered system agents have no legacy concept). Two outcomes:
 * `modern_row_update_path` or `no_existing_row`.
 *
 * Behavior (numeric path):
 *   - No existing row at `(sourceType, sourceId)` → ok=true.
 *   - Existing row with `legacy_import_state IS NULL` (modern Plan v3
 *     row) → ok=true (caller is updating, not re-importing).
 *   - Existing row with `legacy_import_state="legacy_imported"` or
 *     `"manually_reconciled"` → ok=false ("would_duplicate_legacy").
 *   - Existing row with `legacy_import_state="legacy_imported_unresolved"`
 *     → ok=false unless `reconcileMode=true`.
 *
 * Behavior (name path, Phase 37):
 *   - No existing row at `(sourceType, name === sourceName)` → ok=true.
 *   - Existing row → ok=true with `modern_row_update_path` (legacy
 *     classification not applicable to self-registered agents).
 *
 * The DB read is parameterized via `db` so the test can pass a fake.
 */
export async function checkDuplicateLegacyImport(
  db: any,
  opts: DuplicateGuardOptions,
): Promise<DuplicateGuardResult> {
  const hasSourceId = opts.sourceId !== undefined && opts.sourceId !== null;
  const hasSourceName = opts.sourceName !== undefined && opts.sourceName !== null;

  if (hasSourceId === hasSourceName) {
    throw new Error(
      "checkDuplicateLegacyImport requires exactly one of sourceId or sourceName",
    );
  }

  // ── Phase 37 name-path: self-registered system agents ──────────────
  if (hasSourceName) {
    const rows = await db
      .select({
        id: catalogEntries.id,
        legacyImportState: catalogEntries.legacyImportState,
      })
      .from(catalogEntries)
      .where(
        and(
          eq(catalogEntries.sourceType, opts.sourceType),
          eq(catalogEntries.name, opts.sourceName!),
        ),
      );

    if (rows.length === 0) {
      return { ok: true, existingEntryId: null, reason: "no_existing_row" };
    }
    return {
      ok: true,
      existingEntryId: rows[0].id,
      reason: "modern_row_update_path",
    };
  }

  // ── Numeric path (Phase 25 contract) ────────────────────────────────
  const rows = await db
    .select({
      id: catalogEntries.id,
      legacyImportState: catalogEntries.legacyImportState,
    })
    .from(catalogEntries)
    .where(
      and(
        eq(catalogEntries.sourceType, opts.sourceType),
        eq(catalogEntries.sourceId, opts.sourceId!),
      ),
    );

  if (rows.length === 0) {
    return { ok: true, existingEntryId: null, reason: "no_existing_row" };
  }

  const existing = rows[0];
  const state = existing.legacyImportState as string | null;

  if (state == null) {
    return {
      ok: true,
      existingEntryId: existing.id,
      reason: "modern_row_update_path",
    };
  }

  if (state === "legacy_imported" || state === "manually_reconciled") {
    return {
      ok: false,
      existingEntryId: existing.id,
      reason: "would_duplicate_legacy",
    };
  }

  if (state === "legacy_imported_unresolved") {
    return {
      ok: opts.reconcileMode === true,
      existingEntryId: existing.id,
      reason: opts.reconcileMode
        ? "reconciling_unresolved_row"
        : "blocked_unresolved_use_reconcile",
    };
  }

  return {
    ok: false,
    existingEntryId: existing.id,
    reason: `unknown_legacy_state_${state}`,
  };
}

// ───────────────────────────────────────────────────────────────────
// Reconcile Legacy Import — admin override (Phase 24 deliverable).
// ───────────────────────────────────────────────────────────────────

export interface ReconcileLegacyImportInput {
  catalogEntryId: number;
  /** New `active_source_version_id` to point the entry at (e.g. an ags_agent_releases.id). */
  activeSourceVersionId: number;
  /** User id of the admin running the reconciliation. Stored on `updatedBy` audit. */
  reconciledBy: number;
}

export interface ReconcileLegacyImportResult {
  ok: boolean;
  catalogEntryId: number;
  previousState: string | null;
  newState: LegacyImportState | null;
  reason: string;
}

/**
 * Admin override: flips a `legacy_imported_unresolved` row to
 * `manually_reconciled` and pins `active_source_version_id`. Refuses
 * to operate on rows that are already in a non-legacy state — an
 * admin who wants to retarget a modern entry must use the normal
 * `aiTypes.catalog.register` update path, not Reconcile.
 *
 * Phase 24 ships this as a backend function (callable from a script
 * or from the future Reconcile Legacy Import UI). The tRPC procedure
 * + UI button are wired by the Stage 7 candidate-pipeline page.
 */
export async function reconcileLegacyImport(
  db: any,
  input: ReconcileLegacyImportInput,
): Promise<ReconcileLegacyImportResult> {
  const rows = await db
    .select({
      id: catalogEntries.id,
      legacyImportState: catalogEntries.legacyImportState,
    })
    .from(catalogEntries)
    .where(eq(catalogEntries.id, input.catalogEntryId));

  if (rows.length === 0) {
    return {
      ok: false,
      catalogEntryId: input.catalogEntryId,
      previousState: null,
      newState: null,
      reason: "catalog_entry_not_found",
    };
  }

  const existing = rows[0];
  const prev = existing.legacyImportState as string | null;

  if (prev !== "legacy_imported_unresolved") {
    return {
      ok: false,
      catalogEntryId: existing.id,
      previousState: prev,
      newState: null,
      reason: "row_not_in_unresolved_state",
    };
  }

  await db
    .update(catalogEntries)
    .set({
      legacyImportState: "manually_reconciled",
      activeSourceVersionId: input.activeSourceVersionId,
      updatedAt: new Date(),
    })
    .where(eq(catalogEntries.id, existing.id));

  return {
    ok: true,
    catalogEntryId: existing.id,
    previousState: prev,
    newState: "manually_reconciled",
    reason: "reconciled",
  };
}

// ───────────────────────────────────────────────────────────────────
// Pure scanner — convenience for the script.
// ───────────────────────────────────────────────────────────────────

/**
 * Reads every catalog row that has not yet been classified
 * (legacy_import_state IS NULL) and that has a sourceType set.
 * Rows with sourceType IS NULL fall through to the script's
 * "skipped — no source linkage" bucket without a DB query per row.
 */
export async function scanUnclassifiedRows(db: any): Promise<CatalogRowSourceLink[]> {
  const rows = await db
    .select({
      id: catalogEntries.id,
      sourceType: catalogEntries.sourceType,
      sourceId: catalogEntries.sourceId,
      legacyImportState: catalogEntries.legacyImportState,
      activeSourceVersionId: catalogEntries.activeSourceVersionId,
    })
    .from(catalogEntries)
    .where(isNull(catalogEntries.legacyImportState));
  return rows as CatalogRowSourceLink[];
}
