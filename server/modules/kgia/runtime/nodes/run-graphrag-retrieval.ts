/**
 * KGIA Runtime Node — Run GraphRAG Retrieval
 *
 * V1: Pass-through node. Future: vector search + graph traversal fusion
 * for hybrid graph + text retrieval.
 */

import type { RuntimeState } from "../../domain/types";
import { advanceNode } from "../state";

export async function runGraphRagRetrievalNode(
  state: RuntimeState
): Promise<RuntimeState> {
  // V1: GraphRAG retrieval is a pass-through.
  // Future implementation will:
  // 1. Vector search over ingested chunks
  // 2. Extract entities from top-k chunks
  // 3. Expand subgraph around those entities
  // 4. Merge with direct query evidence

  return advanceNode(state, "runGraphRagRetrieval");
}
