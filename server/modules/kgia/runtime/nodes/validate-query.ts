/**
 * KGIA Runtime Node — Validate Query
 *
 * Runs the query plan through governance safety gates.
 * Non-bypassable.
 */

import type { RuntimeState, GraphSource } from "../../domain/types";
import { gateQueryExecution } from "../../governance/safety";
import { advanceNode, addError } from "../state";

export async function validateQueryNode(
  state: RuntimeState,
  source: GraphSource
): Promise<RuntimeState> {
  if (!state.queryPlan) {
    return addError(state, "No query plan to validate");
  }

  const verdict = await gateQueryExecution({
    workspaceId: state.workspaceId,
    runId: state.runId,
    sessionId: state.sessionId,
    queryText: state.queryPlan.queryText,
    source,
    actorId: undefined,
  });

  let updated = { ...state, safetyVerdict: verdict };

  if (!verdict.safe) {
    updated = addError(updated, `Query blocked: ${verdict.violations.join("; ")}`);
  }

  return advanceNode(updated, "validateQuery");
}
