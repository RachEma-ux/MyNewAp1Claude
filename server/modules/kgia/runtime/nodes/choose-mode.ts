/**
 * KGIA Runtime Node — Choose Mode
 *
 * Selects the execution mode based on intent and available sources.
 */

import type { RuntimeState, KgiaMode, GraphSource } from "../../domain/types";
import { advanceNode } from "../state";

export function chooseModeNode(
  state: RuntimeState,
  sources: GraphSource[]
): RuntimeState {
  // Honor explicit request
  if (state.requestedMode) {
    return advanceNode(
      { ...state, selectedMode: state.requestedMode as KgiaMode },
      "chooseMode"
    );
  }

  let mode: KgiaMode;

  if (sources.length === 0) {
    mode = "memory";
  } else if (state.intent === "path_traversal" || state.intent === "relationship_query") {
    mode = "hybrid";
  } else if (state.intent === "pattern_match" || state.intent === "aggregation") {
    mode = "direct_query";
  } else {
    mode = "direct_query";
  }

  return advanceNode(
    { ...state, selectedMode: mode },
    "chooseMode"
  );
}
