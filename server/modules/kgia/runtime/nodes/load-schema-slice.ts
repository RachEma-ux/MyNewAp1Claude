/**
 * KGIA Runtime Node — Load Schema Slice
 *
 * Reads schema from source adapters and extracts the relevant slice
 * based on the question.
 */

import type { RuntimeState, GraphSource } from "../../domain/types";
import { extractRelevantSchemaSlice } from "../../domain/query-planner";
import { readNeo4jSchema } from "../../infrastructure/neo4j-adapter";
import { readSparqlSchema } from "../../infrastructure/sparql-adapter";
import { advanceNode } from "../state";

export async function loadSchemaSliceNode(
  state: RuntimeState,
  sources: GraphSource[]
): Promise<RuntimeState> {
  if (sources.length === 0) {
    return advanceNode(
      { ...state, schemaSlice: { nodeLabels: [], relationshipTypes: [], properties: {} } },
      "loadSchemaSlice"
    );
  }

  // Use the first source's schema as primary
  const source = sources[0];
  const isSparql = source.type === "sparql" || source.type === "neptune_sparql";

  const schema = isSparql
    ? await readSparqlSchema(source)
    : await readNeo4jSchema(source);

  const slice = extractRelevantSchemaSlice(schema, state.question, source);

  return advanceNode(
    { ...state, schemaSlice: slice },
    "loadSchemaSlice"
  );
}
