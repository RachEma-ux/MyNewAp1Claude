/**
 * KGIA Subgraph: Direct Query
 *
 * Composes: loadSchemaSlice → planQuery → validateQuery → executeReadQuery
 * Used when the intent maps to a direct graph lookup or aggregation.
 */

import type { RuntimeState, GraphSource } from "../../domain/types";
import { loadSchemaSliceNode } from "../nodes/load-schema-slice";
import { planQueryNode } from "../nodes/plan-query";
import { validateQueryNode } from "../nodes/validate-query";
import { executeReadQueryNode } from "../nodes/execute-read-query";
import { readNeo4jSchema, readSparqlSchema } from "../../infrastructure/neo4j-adapter";

export async function runDirectQuerySubgraph(
  state: RuntimeState,
  source: GraphSource
): Promise<RuntimeState> {
  // 1. Load schema slice
  let current = await loadSchemaSliceNode(state, [source]);

  // 2. Plan query
  const isSparql = source.type === "sparql" || source.type === "neptune_sparql";
  const schema = isSparql
    ? await (await import("../../infrastructure/sparql-adapter")).readSparqlSchema(source)
    : await (await import("../../infrastructure/neo4j-adapter")).readNeo4jSchema(source);

  current = planQueryNode(current, source, schema);

  // 3. Validate (governance gate)
  current = await validateQueryNode(current, source);

  // 4. Execute if safe
  if (current.safetyVerdict?.safe !== false) {
    current = await executeReadQueryNode(current, source);
  }

  return current;
}
