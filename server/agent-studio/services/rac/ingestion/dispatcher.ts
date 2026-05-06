/**
 * RAC Ingestion — adapter dispatch + embedding binding resolution.
 *
 * Two helpers the router and the P4 retrieval executor consume:
 *
 *   - `pickAdapter(sourceType)` — return the registered adapter for
 *     a source type, or null when no adapter binding exists.
 *   - `resolveEmbeddingBinding(source, workspaceDefault)` — produce the
 *     `(providerConnectionId, modelRef, dim)` tuple to embed a query.
 *     Falls back to the workspace default when the source row is
 *     NULL on every embedding column (D-EMB-4). Throws
 *     `EmbeddingProviderUnavailableError` when neither is set
 *     (D-EMB-5: silent vendor fallback is forbidden).
 */

import type { RacIngestionAdapter, RacSource, RacWorkspaceEmbeddingDefault } from "./types";
import { EmbeddingProviderUnavailableError } from "./types";
import { graphragAdapter } from "./graphrag-adapter";
import { localPgvectorAdapter } from "./local-pgvector-adapter";
import { knowledgeUnitAdapter } from "./knowledge-unit-adapter";

export interface ResolvedEmbeddingBinding {
  providerConnectionId: number;
  modelRef: string;
  dim: number;
  /** "source" when the binding came off the source row, "workspace_default" when from the fallback. */
  resolvedFrom: "source" | "workspace_default";
}

/**
 * Map a source type to its adapter. Returns null for in-process types
 * (`memory`, `workspace_context`, `tool_result_context`,
 * `manual_context`, `cag_pack`) — those are handled by the executor's
 * built-in synthesizers, not by the ingestion adapter contract.
 *
 * `document_collection` and `external_connector` are listed but stay
 * unbound until P4 lands the Qdrant wrapper / per-registration adapter.
 */
export function pickAdapter(sourceType: string): RacIngestionAdapter | null {
  switch (sourceType) {
    case "graph_index":
      return graphragAdapter;
    case "vector_index":
      return localPgvectorAdapter;
    // Retrofit P4: NormalizedKnowledgeUnit retrieval over agsKnowledgeUnits.
    case "knowledge_unit":
      return knowledgeUnitAdapter;
    // Retrofit P7: tool knowledge units share the knowledge_unit adapter
    // since tool_knowledge units are persisted in the SAME agsKnowledgeUnits
    // table per D-NKU-6 (no parallel pipeline). The Phase 7 sync service
    // populates the rows; retrieval is the same shape.
    case "tool_knowledge":
      return knowledgeUnitAdapter;
    // In-process source types — no separate ingestion adapter.
    case "cag_pack":
    case "memory":
    case "workspace_context":
    case "project_context":
    case "tool_result_context":
    case "manual_context":
      return null;
    // Wired in P4 when Qdrant + external-connector adapters land.
    case "document_collection":
    case "external_connector":
      return null;
    default:
      return null;
  }
}

/**
 * Resolve the embedding tuple for a source. Pure function — no I/O,
 * no upstream calls. The caller is expected to pass the workspace
 * default already loaded from the source registry store.
 *
 * Decision tree (locked by D-EMB-4 + D-EMB-5):
 *   1. If the source row has all three (`providerConnectionId`,
 *      `modelRef`, `dim`) non-null → use them; `resolvedFrom = "source"`.
 *   2. Else if the workspace default exists → use it;
 *      `resolvedFrom = "workspace_default"`.
 *   3. Else → throw `EmbeddingProviderUnavailableError`. Never silently
 *      pick "some other" provider.
 */
export function resolveEmbeddingBinding(
  source: Pick<
    RacSource,
    | "id"
    | "workspaceId"
    | "embeddingProviderConnectionId"
    | "embeddingModelRef"
    | "embeddingModelDim"
  >,
  workspaceDefault: RacWorkspaceEmbeddingDefault | null,
): ResolvedEmbeddingBinding {
  if (
    source.embeddingProviderConnectionId != null &&
    source.embeddingModelRef != null &&
    source.embeddingModelDim != null
  ) {
    return {
      providerConnectionId: source.embeddingProviderConnectionId,
      modelRef: source.embeddingModelRef,
      dim: source.embeddingModelDim,
      resolvedFrom: "source",
    };
  }
  if (workspaceDefault) {
    return {
      providerConnectionId: workspaceDefault.embeddingProviderConnectionId,
      modelRef: workspaceDefault.embeddingModelRef,
      dim: workspaceDefault.embeddingModelDim,
      resolvedFrom: "workspace_default",
    };
  }
  throw new EmbeddingProviderUnavailableError(source.workspaceId, source.id);
}
