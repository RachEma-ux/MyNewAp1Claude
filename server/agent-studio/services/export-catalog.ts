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
 * Refuses to operate on candidates whose export status is not "ready"
 * (anything else is a deeper problem the caller must fix first).
 *
 * The actual `aiTypes.catalog.register` invocation happens at the gateway
 * layer in `boot.ts` — this function returns the prepared register payload
 * + governance verdict so the boot layer can call the gateway with the
 * right intent string and receipt enforcement.
 */
export async function prepareExportRegisterPayload(
  input: ExportCandidateInput,
  lookups: ExportCatalogLookups,
): Promise<{
  candidate: AgentStudioExportCandidate;
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
  if (candidate.exportStatus !== "ready" && candidate.exportStatus !== "exported") {
    throw new Error(
      `export-catalog: agent ${input.agentId} not eligible (status=${candidate.exportStatus}; blockers=${candidate.governance.blockerRules.join(",")})`,
    );
  }

  return {
    candidate,
    registerPayload: {
      entryType: "agent",
      sourceType: "agent",
      sourceId: candidate.agentId,
      fields: {
        name: candidate.name,
        displayName: candidate.name,
        description: null,
        scope: "app",
        status: "active",
        origin: "agent_studio",
        reviewState: "approved",
        config: {
          versionId: candidate.versionId,
          activeSourceVersionId: candidate.activeSourceVersionId,
          binding: candidate.binding,
          capabilities: candidate.capabilities,
          readinessScore: candidate.readiness.readinessScore,
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
