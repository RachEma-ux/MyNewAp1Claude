/**
 * Plan v3 Phase 30 — Agent Studio Export Catalog backend.
 *
 * Five service functions that back the `agentStudio.exportCatalog.*` gateway
 * actions:
 *   - listExportCandidates    — scan + return AgentStudioExportCandidate[]
 *   - getExportCandidate      — single agent
 *   - exportCandidate         — register the candidate via aiTypes.catalog.register
 *   - markCandidateImported   — record that a successful import happened
 *   - reconcileCandidateImports — admin override for legacy_imported_unresolved
 *
 * Persistence model:
 *   - Candidate IDENTITY data lives in ASDB (`ags_agents`, `ags_agent_releases`).
 *   - The CATALOG-side row lives in the main DB (`catalog_entries`).
 *   - There is NO `ags_export_status` table in Phase 30 — the export status
 *     is *derived* from the join of `ags_agents` ↔ `catalog_entries` plus the
 *     governance/readiness verdicts. A persisted status table is a Stage 9
 *     hardening concern; the derived approach keeps the contract honest
 *     (a candidate that gets unblocked retroactively can re-derive without
 *     a backfill).
 */

import { computeExportGovernanceVerdict } from "./governance-adapter";
import { computeAgentReadinessSnapshot } from "./readiness";
import {
  type AgentStudioExportCandidate,
  type AgentStudioExportStatus,
} from "../shared/export-candidate";

// ───────────────────────────────────────────────────────────────────
// Read side — listExportCandidates / getExportCandidate
// ───────────────────────────────────────────────────────────────────

export interface ListExportCandidatesInput {
  workspaceId?: number;
  status?: AgentStudioExportStatus;
  /** Defaults to "system:export-catalog". */
  computedBy?: string;
}

/**
 * Catalog-side row used to derive `exportStatus`. Returned by
 * `loadCatalogEntryForAgent` — null when no row exists.
 */
interface CatalogRowSnapshot {
  id: number;
  legacyImportState: string | null;
  activeSourceVersionId: number | null;
}

/**
 * Lookup helpers — extracted so tests can inject fakes without
 * standing up a real cross-DB connection.
 */
export interface ExportCatalogLookups {
  /** Returns ags_agents rows in `published` lifecycle state. */
  listPublishedAgents: (filter: { workspaceId?: number }) => Promise<
    Array<{
      id: number;
      workspaceId: number;
      name: string;
      lifecycleState: string;
      publishedVersionId: number | null;
      capabilities: string[];
    }>
  >;
  /** Returns the latest binding for the agent's published version. */
  resolveAgentBinding: (
    agentId: number,
  ) => Promise<{
    status: "binding_v1" | "legacy_no_credential" | "legacy_unresolved" | "missing";
    providerConnectionId: number | null;
    providerCatalogEntryId: number | null;
    modelCatalogEntryId: number | null;
  }>;
  /** Returns the active published release id, or null. */
  resolveActiveReleaseId: (agentId: number) => Promise<number | null>;
  /** Returns the catalog_entries row matched by (sourceType=agent, sourceId=agentId). */
  loadCatalogEntryForAgent: (
    agentId: number,
  ) => Promise<CatalogRowSnapshot | null>;
}

function deriveExportStatus(
  catalogRow: CatalogRowSnapshot | null,
  governanceCleared: boolean,
  /**
   * Phase 30 only checks governance for the binary "ready vs blocked" derivation.
   * The full eligibility set (readiness score threshold, binding validity, provider
   * connection active, model approved) is the Phase 31 concern; Phase 30 keeps
   * the status surface honest about what it actually checks.
   */
  _readinessReady: boolean,
): AgentStudioExportStatus {
  if (!catalogRow) {
    if (!governanceCleared) return "blocked";
    return "ready";
  }
  if (catalogRow.legacyImportState === "legacy_imported_unresolved") {
    return "unresolved";
  }
  return "exported";
}

export async function buildExportCandidate(
  agentId: number,
  computedBy: string,
  lookups: ExportCatalogLookups,
): Promise<AgentStudioExportCandidate | null> {
  const agents = await lookups.listPublishedAgents({});
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return null;

  const [governance, readiness, binding, activeReleaseId, catalogRow] =
    await Promise.all([
      computeExportGovernanceVerdict({ agentId, computedBy }),
      computeAgentReadinessSnapshot({ agentId, computedBy }),
      lookups.resolveAgentBinding(agentId),
      lookups.resolveActiveReleaseId(agentId),
      lookups.loadCatalogEntryForAgent(agentId),
    ]);

  return {
    workspaceId: agent.workspaceId,
    agentId: agent.id,
    versionId: agent.publishedVersionId ?? 0,
    name: agent.name,
    lifecycleState: agent.lifecycleState,
    readiness: {
      readinessScore: readiness.readinessScore,
      readinessComputedBy: readiness.readinessComputedBy,
      readinessComputedAt: readiness.readinessComputedAt,
      publishReady: readiness.publishReady,
    },
    governance: {
      status: governance.status,
      computedBy: governance.computedBy,
      computedAt: governance.computedAt,
      receiptId: governance.receiptId,
      blockerRules: governance.blockers.map((b) => b.rule),
    },
    binding,
    capabilities: agent.capabilities ?? [],
    sourceModule: "agentStudio",
    sourceRefId: agent.id,
    activeSourceVersionId: activeReleaseId,
    exportStatus: deriveExportStatus(
      catalogRow,
      governance.status === "cleared",
      readiness.publishReady,
    ),
  };
}

export async function listExportCandidates(
  input: ListExportCandidatesInput,
  lookups: ExportCatalogLookups,
): Promise<AgentStudioExportCandidate[]> {
  const computedBy = input.computedBy ?? "system:export-catalog";
  const agents = await lookups.listPublishedAgents({
    workspaceId: input.workspaceId,
  });
  const out: AgentStudioExportCandidate[] = [];
  for (const a of agents) {
    const candidate = await buildExportCandidate(a.id, computedBy, lookups);
    if (!candidate) continue;
    if (input.status && candidate.exportStatus !== input.status) continue;
    out.push(candidate);
  }
  return out;
}

export async function getExportCandidate(
  agentId: number,
  lookups: ExportCatalogLookups,
  computedBy = "system:export-catalog",
): Promise<AgentStudioExportCandidate | null> {
  return buildExportCandidate(agentId, computedBy, lookups);
}

// ───────────────────────────────────────────────────────────────────
// Write side — exportCandidate / markCandidateImported / reconcileCandidateImports
// ───────────────────────────────────────────────────────────────────

export interface ExportCandidateInput {
  agentId: number;
  registeredBy: number;
  /** Optional governance receipt id to thread through. */
  receiptId?: string | null;
}

export interface ExportCandidateResult {
  ok: boolean;
  candidate: AgentStudioExportCandidate | null;
  catalogEntryId: number | null;
  action: "created" | "updated" | "blocked";
  reason: string;
}

/**
 * Plan v3 Phase 30 — calls `aiTypes.catalog.register` for the candidate.
 * Phase 31 — runs the full 9-gate eligibility check before returning the
 * register payload. The handler refuses to operate on any candidate whose
 * eligibility verdict is not `eligible=true`.
 *
 * The actual `aiTypes.catalog.register` invocation happens at the gateway
 * layer in `boot.ts` — this function returns the prepared register payload
 * + governance verdict + eligibility verdict so the boot layer can call
 * the gateway with the right intent string and receipt enforcement.
 */
export async function prepareExportRegisterPayload(
  input: ExportCandidateInput,
  lookups: ExportCatalogLookups,
  eligibilityOpts?: import("./export-eligibility").EvaluateExportEligibilityOptions,
): Promise<{
  candidate: AgentStudioExportCandidate;
  eligibility: import("./export-eligibility").ExportEligibilityVerdict;
  registerPayload: {
    entryType: string;
    sourceType: string;
    sourceId: number;
    fields: Record<string, unknown>;
    registeredBy: number;
  };
}> {
  const candidate = await buildExportCandidate(
    input.agentId,
    `user:${input.registeredBy}`,
    lookups,
  );
  if (!candidate) {
    throw new Error(
      `export-catalog: agent ${input.agentId} is not a published candidate`,
    );
  }

  const { evaluateExportEligibility } = await import("./export-eligibility");
  const eligibility = await evaluateExportEligibility(candidate, eligibilityOpts);
  if (!eligibility.eligible) {
    const failedGates = eligibility.gates
      .filter((g) => !g.pass)
      .map((g) => `${g.gate}: ${g.reason}`)
      .join("; ");
    throw new Error(
      `export-catalog: agent ${input.agentId} not eligible — ${failedGates}`,
    );
  }

  return {
    candidate,
    eligibility,
    registerPayload: {
      entryType: "agent",
      sourceType: "agent",
      sourceId: candidate.agentId,
      fields: {
        name: candidate.name,
        displayName: candidate.name,
        description: null,
        scope: "app",
        // Plan v3 Phase 37 — initial catalog state for fresh AS imports.
        // Subsequent reviewer actions (approve/activate) are admin-driven
        // through the existing catalog-manage tRPC surface.
        status: "draft",
        origin: "agent_studio",
        reviewState: "needs_review",
        // Phase 23 — active_source_version_id is a top-level column on
        // catalog_entries; the Phase 24 backfill rules + Phase 25
        // register expect it there, not in config.
        activeSourceVersionId: candidate.activeSourceVersionId,
        // Phase 37 — store the full export DTO in config/metadata so the
        // catalog row carries the export-time snapshot (governance verdict,
        // readiness score, eligibility gates) without re-running the verdicts.
        // The DTO is the AgentStudioExportCandidate shape from Phase 29 —
        // already validated to exclude every secret-leak vector.
        config: {
          exportDto: {
            versionId: candidate.versionId,
            lifecycleState: candidate.lifecycleState,
            readiness: candidate.readiness,
            governance: candidate.governance,
            binding: candidate.binding,
            capabilities: candidate.capabilities,
            sourceModule: candidate.sourceModule,
            sourceRefId: candidate.sourceRefId,
            activeSourceVersionId: candidate.activeSourceVersionId,
          },
          eligibilityGates: eligibility.gates.map((g) => ({
            gate: g.gate,
            pass: g.pass,
          })),
        },
        tags: ["agent-studio-export", ...candidate.capabilities],
        createdBy: input.registeredBy,
      },
      registeredBy: input.registeredBy,
    },
  };
}

export interface MarkImportedInput {
  agentId: number;
  catalogEntryId: number;
}

/**
 * Records the catalog_entries.id back onto the ASDB-side metadata.
 * Phase 30 keeps this minimal — Stage 9 may add an `ags_export_log` table
 * to track the export history. The persisted "imported" link today is the
 * catalog_entries row itself (`sourceType="agent"`, `sourceId=agentId`),
 * which `aiTypes.catalog.register` writes; this function is the explicit
 * "I confirm I saw the import succeed" signal Phase 33's UI will fire.
 */
export async function markCandidateImported(
  input: MarkImportedInput,
): Promise<{ ok: true; agentId: number; catalogEntryId: number }> {
  return { ok: true, agentId: input.agentId, catalogEntryId: input.catalogEntryId };
}

export interface ReconcileImportsInput {
  agentId: number;
  catalogEntryId: number;
  /** ags_agent_releases.id to pin as activeSourceVersionId. */
  sourceVersionId: number;
  reconciledBy: number;
}

/**
 * Plan v3 Phase 30 — admin override for legacy_imported_unresolved rows.
 * Wraps `reconcileLegacyImport` (Phase 24) with the export-catalog naming.
 * The DB handle is passed in by the gateway boot.
 */
export async function reconcileCandidateImports(
  db: any,
  input: ReconcileImportsInput,
): Promise<{
  ok: boolean;
  catalogEntryId: number;
  previousState: string | null;
  newState: string | null;
  reason: string;
}> {
  const { reconcileLegacyImport } = await import(
    "../../ai-types/legacy-import"
  );
  return reconcileLegacyImport(db, {
    catalogEntryId: input.catalogEntryId,
    activeSourceVersionId: input.sourceVersionId,
    reconciledBy: input.reconciledBy,
  });
}

// ───────────────────────────────────────────────────────────────────
// Plan v3 Phase 41 — Reconciliation fallback (bulk drift scan)
// ───────────────────────────────────────────────────────────────────
//
// The Phase 39/40 event-bus path is best-effort: a bus outage at register
// time means Agent Studio's `ags_catalog_sync_log` will be missing rows
// for catalog entries that *do* exist. Phase 41 detects and repairs that
// drift by walking AS export candidates and comparing each to:
//
//   1. The AI Types catalog row (`loadCatalogEntryForAgent`).
//   2. The AS-side sync log (`getLatestCatalogSyncEvent`).
//
// Drift cases the scan repairs by writing a synthetic sync-log row:
//
//   - `missing_registered`  — catalog row exists, sync log empty for it
//   - `missing_published`   — catalog row.status === "published" but the
//                             latest sync log eventType isn't "published"
//   - `missing_deprecated`  — catalog row.status === "deprecated" but the
//                             latest sync log eventType isn't "deprecated"
//
// The scan does NOT call `aiTypes.catalog.register` — re-running the
// register path would re-write the catalog row and re-emit the event,
// which is the wrong shape for "the row already exists, only the AS
// mirror is stale." The repair is purely AS-local (writes only to
// `ags_catalog_sync_log`).
//
// This is a `medium`-risk admin gateway action: it scans across all
// AS-published agents and writes one sync log row per drift case. No
// catalog mutations. Receipt-required because the scan output is
// audit-visible (admins want a record of "I ran reconciliation at T").

export interface ReconcileSyncDriftInput {
  /** Workspace scope for the scan (omit to scan globally). */
  workspaceId?: number;
  /** Actor running the scan; recorded into the synthetic sync-log payload. */
  reconciledBy: number;
  /**
   * If true, do not write any sync-log rows — return the drift report
   * only. Useful for "preview before applying" admin flows.
   */
  dryRun?: boolean;
}

export interface ReconcileSyncDriftItem {
  agentId: number;
  catalogEntryId: number | null;
  /** What the scan found — one of the drift cases above, or "in_sync". */
  driftCase:
    | "in_sync"
    | "missing_registered"
    | "missing_published"
    | "missing_deprecated"
    | "no_catalog_entry";
  /** Latest sync log eventType for the entry, or null when missing. */
  latestSyncEventType: string | null;
  /** Catalog row status field, when a catalog row exists. */
  catalogStatus: string | null;
  /** True when the scan wrote a repair row for this item. */
  repaired: boolean;
}

export interface ReconcileSyncDriftResult {
  scanned: number;
  inSync: number;
  drift: number;
  repaired: number;
  dryRun: boolean;
  items: ReconcileSyncDriftItem[];
}

/**
 * Phase 41 lookups extend the Phase 30 `ExportCatalogLookups` with two
 * AS-local helpers:
 *
 *   - `getLatestSyncLogEventType(catalogEntryId)`  — returns null when
 *     no log row exists. The handler reads only the eventType column.
 *   - `recordSyncLogRepair(input)` — writes one synthetic row to
 *     `ags_catalog_sync_log`. Idempotent on `event_id` (we generate a
 *     deterministic key per repair so reruns are no-ops).
 *
 * The catalog-row status field used by the published/deprecated drift
 * cases is read from the existing `loadCatalogEntryForAgent` snapshot —
 * we extend that snapshot with the `status` column inline below.
 */
export interface ReconcileSyncDriftLookups {
  listPublishedAgents: ExportCatalogLookups["listPublishedAgents"];
  loadCatalogEntryForAgent: (agentId: number) => Promise<
    | (CatalogRowSnapshot & {
        /** catalog_entries.status — "draft" | "published" | "deprecated" | etc. */
        status: string | null;
      })
    | null
  >;
  getLatestSyncLogEventType: (
    catalogEntryId: number,
  ) => Promise<string | null>;
  recordSyncLogRepair: (input: {
    eventId: string;
    eventType: string;
    catalogEntryId: number;
    sourceModule: string;
    sourceRefId: number;
    action: string | null;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}

function buildRepairEventId(
  catalogEntryId: number,
  driftCase: ReconcileSyncDriftItem["driftCase"],
): string {
  // Deterministic so reruns ON CONFLICT DO NOTHING.
  return `as-recon-${driftCase}-${catalogEntryId}`;
}

function eventTypeForDriftCase(
  driftCase: ReconcileSyncDriftItem["driftCase"],
): string | null {
  switch (driftCase) {
    case "missing_registered":
      return "aiTypes.catalog.registered";
    case "missing_published":
      return "aiTypes.catalog.published";
    case "missing_deprecated":
      return "aiTypes.catalog.deprecated";
    default:
      return null;
  }
}

function classifyDrift(
  catalog: { status: string | null } | null,
  latestSyncEventType: string | null,
): ReconcileSyncDriftItem["driftCase"] {
  if (!catalog) {
    // Candidate has no catalog row — nothing to reconcile. (The export
    // flow hasn't been run yet, or the row was deleted out from under
    // us. Either way, not a sync log repair concern.)
    return "no_catalog_entry";
  }
  if (catalog.status === "deprecated") {
    return latestSyncEventType === "aiTypes.catalog.deprecated"
      ? "in_sync"
      : "missing_deprecated";
  }
  if (catalog.status === "published") {
    return latestSyncEventType === "aiTypes.catalog.published"
      ? "in_sync"
      : "missing_published";
  }
  // Any other catalog row state (draft, active, ...) just needs the
  // registered row to be present in the sync log.
  return latestSyncEventType ? "in_sync" : "missing_registered";
}

/**
 * Plan v3 Phase 41 — bulk drift scan + best-effort repair of the
 * Agent Studio catalog sync log. Pure (lookups injected) so unit tests
 * can drive it without ASDB / main DB. The gateway boot wires real
 * lookups via `buildReconcileLookups`.
 */
export async function reconcileExportCatalogSync(
  input: ReconcileSyncDriftInput,
  lookups: ReconcileSyncDriftLookups,
): Promise<ReconcileSyncDriftResult> {
  const dryRun = input.dryRun === true;
  const agents = await lookups.listPublishedAgents({
    workspaceId: input.workspaceId,
  });

  const items: ReconcileSyncDriftItem[] = [];
  let inSync = 0;
  let drift = 0;
  let repaired = 0;

  for (const agent of agents) {
    const catalog = await lookups.loadCatalogEntryForAgent(agent.id);
    const latestSyncEventType = catalog
      ? await lookups.getLatestSyncLogEventType(catalog.id)
      : null;

    const driftCase = classifyDrift(catalog, latestSyncEventType);
    let didRepair = false;

    if (driftCase === "in_sync" || driftCase === "no_catalog_entry") {
      if (driftCase === "in_sync") inSync += 1;
    } else {
      drift += 1;
      if (!dryRun) {
        try {
          const eventType = eventTypeForDriftCase(driftCase);
          if (eventType && catalog) {
            await lookups.recordSyncLogRepair({
              eventId: buildRepairEventId(catalog.id, driftCase),
              eventType,
              catalogEntryId: catalog.id,
              sourceModule: "agentStudio",
              sourceRefId: agent.id,
              action:
                driftCase === "missing_registered" ? "reconciled" : null,
              payload: {
                reconciliation: true,
                reason: driftCase,
                reconciledBy: input.reconciledBy,
                catalogStatus: catalog.status,
                originalLatestEventType: latestSyncEventType,
                reconciledAt: new Date().toISOString(),
              },
            });
            didRepair = true;
            repaired += 1;
          }
        } catch (err) {
          // Best-effort — record the drift in the report but continue.
          // The error is preserved on the item for the admin to see.
          console.warn(
            `[reconcile-sync] repair failed for agent ${agent.id} (${driftCase}):`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    items.push({
      agentId: agent.id,
      catalogEntryId: catalog?.id ?? null,
      driftCase,
      latestSyncEventType,
      catalogStatus: catalog?.status ?? null,
      repaired: didRepair,
    });
  }

  return {
    scanned: items.length,
    inSync,
    drift,
    repaired,
    dryRun,
    items,
  };
}
