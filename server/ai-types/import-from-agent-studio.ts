/**
 * Plan v3 Phase 36 — AI Types ⇐ Agent Studio import flow.
 *
 * Wraps `agentStudio.exportCatalog.*` gateway actions so the AI Types
 * import surface (Phase 35's "Import from Agent Studio" entry in the
 * Catalog Import Modal) can list + import Agent Studio candidates
 * without reaching into Agent Studio private code or ASDB.
 *
 * D6 boundary: this file is the ONE place inside `server/ai-types/`
 * that touches Agent Studio. It does so via `gatewayCall` only —
 * never imports `server/agent-studio/*` directly. The Phase 26 baseline
 * lint enforces this asymmetrically: AI Types has no public-API
 * exemption to import Agent Studio internals.
 */

import { gatewayCall } from "../platform/modules/module-gateway";
import { randomUUID } from "crypto";

/**
 * Re-export of the export-candidate shape, sourced via gateway. We
 * declare it locally as `unknown` and pass through; the type is owned
 * by Agent Studio (`server/agent-studio/shared/export-candidate.ts`)
 * but cross-module type sharing must go through `shared/` modules,
 * not direct imports across the AS boundary. Phase 38 may promote a
 * shared type into `shared/agent-studio-export.ts` if other consumers
 * appear.
 */
export type AgentStudioExportCandidateRef = Record<string, unknown>;

export interface ImportFromAgentStudioListInput {
  workspaceId?: number;
  /**
   * Filter to "ready" candidates by default — the import flow has no
   * reason to surface blocked or unresolved rows. Caller can override
   * to "exported" to see what's already imported, etc.
   */
  status?: "not_started" | "ready" | "exported" | "blocked" | "unresolved";
  /** Acting actor id for audit. */
  actorId: number;
}

/**
 * Plan v3 Phase 36 — list AS candidates available for import via gateway.
 * Returns the candidates as opaque DTOs; Phase 37 (catalog entry creation
 * from export DTO) consumes the result.
 */
export async function listImportableAgentStudioCandidates(
  input: ImportFromAgentStudioListInput,
): Promise<AgentStudioExportCandidateRef[]> {
  const result = await gatewayCall<unknown, AgentStudioExportCandidateRef[]>({
    ctx: {
      sourceModule: "aiTypes",
      targetModule: "agentStudio",
      actionKey: "agentStudio.exportCatalog.listCandidates",
      actorId: input.actorId,
      correlationId: randomUUID(),
    },
    input: {
      workspaceId: input.workspaceId,
      status: input.status ?? "ready",
      computedBy: `system:aiTypes-import:${input.actorId}`,
    },
  });
  return Array.isArray(result) ? result : [];
}

export interface ImportFromAgentStudioExportInput {
  agentId: number;
  /** AI Types user driving the import (becomes registeredBy on the catalog row). */
  registeredBy: number;
  /**
   * Optional governance receipt id. The export action is medium-risk +
   * receipt-required; if the caller is already inside a receipt-bearing
   * flow, pass the same id through. Otherwise this function generates a
   * stub receipt id `aitypes-import-<agentId>-<ts>` per the Phase 20
   * pattern used elsewhere.
   */
  governanceReceiptId?: string;
}

export interface ImportFromAgentStudioExportResult {
  ok: boolean;
  candidate: AgentStudioExportCandidateRef | null;
  /** Output of the gateway register call, opaque pass-through. */
  registerResult: unknown;
  /** Human-readable reason for failure when ok=false. */
  reason: string;
}

/**
 * Plan v3 Phase 36 — invoke `agentStudio.exportCatalog.exportCandidate`
 * via gateway. Agent Studio's handler in turn calls
 * `aiTypes.catalog.register` via the gateway, so the actual catalog row
 * write happens back inside AI Types under the canonical register path
 * (Phase 25). This function is the AI Types-side import-flow entry
 * point that Phase 37's "create catalog entry from export DTO" wraps.
 */
export async function importAgentStudioCandidate(
  input: ImportFromAgentStudioExportInput,
): Promise<ImportFromAgentStudioExportResult> {
  const receiptId =
    input.governanceReceiptId ??
    `aitypes-import-${input.agentId}-${Date.now()}`;
  try {
    const exportResult = await gatewayCall<
      unknown,
      {
        ok?: boolean;
        candidate?: AgentStudioExportCandidateRef;
        registerResult?: unknown;
      }
    >({
      ctx: {
        sourceModule: "aiTypes",
        targetModule: "agentStudio",
        actionKey: "agentStudio.exportCatalog.exportCandidate",
        actorId: input.registeredBy,
        governanceReceiptId: receiptId,
        correlationId: randomUUID(),
      },
      input: {
        agentId: input.agentId,
        registeredBy: input.registeredBy,
      },
    });
    return {
      ok: Boolean(exportResult?.ok ?? true),
      candidate: exportResult?.candidate ?? null,
      registerResult: exportResult?.registerResult ?? null,
      reason: "exported",
    };
  } catch (err) {
    return {
      ok: false,
      candidate: null,
      registerResult: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
