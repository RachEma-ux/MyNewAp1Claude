/**
 * KGIA Subgraph: GraphRAG Retrieval
 *
 * Composes: runGraphRagRetrieval → assembleEvidence
 * Used when the question requires hybrid graph + text retrieval
 * over ingested documents.
 */

import type { RuntimeState, GraphSource } from "../../domain/types";
import { runGraphRagRetrievalNode } from "../nodes/run-graphrag-retrieval";
import { assembleEvidenceNode } from "../nodes/assemble-evidence";

export async function runGraphRagSubgraph(
  state: RuntimeState,
  source: GraphSource
): Promise<RuntimeState> {
  // 1. Run GraphRAG retrieval (V1: pass-through)
  let current = await runGraphRagRetrievalNode(state);

  // 2. Assemble any evidence from retrieval
  current = assembleEvidenceNode(current, source);

  return current;
}
