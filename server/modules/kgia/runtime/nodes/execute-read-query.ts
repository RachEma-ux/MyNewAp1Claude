/**
 * KGIA Runtime Node — Execute Read Query
 *
 * Dispatches the validated query to the appropriate graph adapter.
 */

import type { RuntimeState, GraphSource } from "../../domain/types";
import { executeNeo4jQuery } from "../../infrastructure/neo4j-adapter";
import { executeSparqlQuery } from "../../infrastructure/sparql-adapter";
import { advanceNode, addError } from "../state";

export async function executeReadQueryNode(
  state: RuntimeState,
  source: GraphSource
): Promise<RuntimeState> {
  if (!state.queryPlan) {
    return addError(state, "No query plan to execute");
  }

  if (state.safetyVerdict && !state.safetyVerdict.safe) {
    return advanceNode(state, "executeReadQuery");
  }

  const isSparql = source.type === "sparql" || source.type === "neptune_sparql";

  try {
    let records: Record<string, unknown>[] = [];

    if (isSparql) {
      const result = await executeSparqlQuery(source, state.queryPlan.queryText);
      records = result.bindings;
    } else {
      const result = await executeNeo4jQuery(source, state.queryPlan.queryText);
      records = result.records;
    }

    return advanceNode(
      { ...state, queryResults: records },
      "executeReadQuery"
    );
  } catch (err) {
    return advanceNode(
      addError(state, `Query execution failed: ${(err as Error).message}`),
      "executeReadQuery"
    );
  }
}
