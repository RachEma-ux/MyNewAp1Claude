/**
 * KGIA Runtime Node — Classify Intent
 *
 * Wraps domain/query-planner.classifyIntent into a pipeline node.
 */

import type { RuntimeState } from "../../domain/types";
import { classifyIntent } from "../../domain/query-planner";
import { advanceNode } from "../state";

export function classifyIntentNode(state: RuntimeState): RuntimeState {
  const intent = classifyIntent(state.question);

  return advanceNode(
    { ...state, intent },
    "classifyIntent"
  );
}
