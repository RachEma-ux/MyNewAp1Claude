/**
 * Neo4j Schema Reader
 *
 * Reads graph schema metadata: node labels, relationship types,
 * property keys, indexes, and constraints.
 * Schema detail materially affects NL→query performance.
 */

import type { GraphSource } from "../../../domain/types";

export interface Neo4jSchema {
  nodeLabels: string[];
  relationshipTypes: string[];
  propertyKeys: Record<string, string[]>; // label → property names
  indexes: Array<{ name: string; type: string; labels: string[]; properties: string[] }>;
  constraints: Array<{ name: string; type: string; label: string; properties: string[] }>;
}

/**
 * Read the full schema from a Neo4j source.
 * V1: Returns cached schemaSnapshot if available.
 * Future: Live introspection via db.schema.visualization() / db.labels() / db.relationshipTypes().
 */
export async function readNeo4jFullSchema(source: GraphSource): Promise<Neo4jSchema> {
  // Use cached schema snapshot if available
  const snapshot = (source as any).schemaSnapshot as Neo4jSchema | undefined;
  if (snapshot?.nodeLabels) return snapshot;

  // V1: Return empty schema — real driver integration in V2
  return {
    nodeLabels: [],
    relationshipTypes: [],
    propertyKeys: {},
    indexes: [],
    constraints: [],
  };
}

/**
 * Extract a schema slice relevant to a question.
 * Filters labels and relationship types by keyword matching.
 */
export function sliceNeo4jSchema(
  schema: Neo4jSchema,
  keywords: string[]
): Neo4jSchema {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  const matchedLabels = schema.nodeLabels.filter((l) =>
    lowerKeywords.some((k) => l.toLowerCase().includes(k))
  );

  const matchedRelTypes = schema.relationshipTypes.filter((r) =>
    lowerKeywords.some((k) => r.toLowerCase().includes(k))
  );

  const matchedProps: Record<string, string[]> = {};
  for (const label of matchedLabels) {
    if (schema.propertyKeys[label]) {
      matchedProps[label] = schema.propertyKeys[label];
    }
  }

  return {
    nodeLabels: matchedLabels.length > 0 ? matchedLabels : schema.nodeLabels.slice(0, 10),
    relationshipTypes: matchedRelTypes.length > 0 ? matchedRelTypes : schema.relationshipTypes.slice(0, 10),
    propertyKeys: Object.keys(matchedProps).length > 0 ? matchedProps : {},
    indexes: schema.indexes,
    constraints: schema.constraints,
  };
}
