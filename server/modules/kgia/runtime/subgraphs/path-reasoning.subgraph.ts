/**
 * KGIA Subgraph: Path Reasoning
 *
 * Composes: directQuery subgraph → expandPaths → assembleEvidence
 * Used when multi-hop path traversal is needed.
 */

import type { RuntimeState, GraphSource } from "../../domain/types";
import { runDirectQuerySubgraph } from "./direct-query.subgraph";
import { expandPathsNode } from "../nodes/expand-paths";
import { assembleEvidenceNode } from "../nodes/assemble-evidence";

export async function runPathReasoningSubgraph(
  state: RuntimeState,
  source: GraphSource
): Promise<RuntimeState> {
  // 1. Run the direct query first
  let current = await runDirectQuerySubgraph(state, source);

  // 2. Expand paths from results
  current = expandPathsNode(current, source);

  // 3. Assemble evidence including path evidence
  current = assembleEvidenceNode(current, source);

  return current;
}
