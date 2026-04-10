/**
 * KGIA Runtime Node — Plan Query
 *
 * Generates a query plan for the question using the loaded schema slice.
 */

import type { RuntimeState, GraphSource } from "../../domain/types";
import { buildQueryPlan } from "../../domain/query-planner";
import { advanceNode } from "../state";

export function planQueryNode(
  state: RuntimeState,
  source: GraphSource,
  schema: Record<string, unknown>
): RuntimeState {
  const plan = buildQueryPlan(state.question, source, schema);

  return advanceNode(
    { ...state, queryPlan: plan },
    "planQuery"
  );
}
