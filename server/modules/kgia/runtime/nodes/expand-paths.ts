/**
 * KGIA Runtime Node — Expand Paths
 *
 * Expands, ranks, and prunes multi-hop path candidates from query results.
 */

import type { RuntimeState, GraphSource } from "../../domain/types";
import { expandPaths, rankPaths, prunePaths } from "../../domain/path-reasoning";
import { advanceNode } from "../state";

export function expandPathsNode(
  state: RuntimeState,
  source: GraphSource
): RuntimeState {
  if (state.queryResults.length === 0) {
    return advanceNode(state, "expandPaths");
  }

  const paths = expandPaths(state.queryResults, source);
  const ranked = rankPaths(paths);
  const pruned = prunePaths(ranked);

  return advanceNode(
    { ...state, pathCandidates: pruned },
    "expandPaths"
  );
}
