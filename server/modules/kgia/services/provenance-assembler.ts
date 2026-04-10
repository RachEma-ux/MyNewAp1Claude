/**
 * KGIA — Provenance Assembler
 *
 * Builds PROV-style provenance chains for KGIA runs.
 * Each answer traces back through: source → query → execution → evidence → answer.
 */

import type { ProvenanceRef, GraphSource } from "../domain/types";

/**
 * Build provenance refs for a query execution against a source.
 */
export function buildQueryProvenance(
  source: GraphSource,
  queryText: string,
  executionId?: number
): ProvenanceRef[] {
  return [
    {
      sourceType: "graph",
      sourceRef: `${source.type}://${source.name}(id=${source.id})`,
      operationRef: `query:${queryText.slice(0, 80)}`,
      executionId,
      timestamp: new Date().toISOString(),
    },
  ];
}

/**
 * Build provenance refs for a GraphRAG retrieval.
 */
export function buildRetrievalProvenance(
  ingestionId: number,
  chunkIds: string[],
  documentName?: string
): ProvenanceRef[] {
  return [
    {
      sourceType: "document",
      sourceRef: documentName ? `doc://${documentName}` : `ingestion://${ingestionId}`,
      operationRef: `retrieval:chunks=[${chunkIds.slice(0, 5).join(",")}]`,
      timestamp: new Date().toISOString(),
    },
  ];
}

/**
 * Build provenance refs for memory graph evidence.
 */
export function buildMemoryProvenance(
  sessionId: number,
  nodeIds: string[]
): ProvenanceRef[] {
  return [
    {
      sourceType: "memory",
      sourceRef: `session://${sessionId}`,
      operationRef: `memory:nodes=[${nodeIds.slice(0, 10).join(",")}]`,
      timestamp: new Date().toISOString(),
    },
  ];
}

/**
 * Merge and deduplicate provenance refs.
 */
export function mergeProvenance(...refSets: ProvenanceRef[][]): ProvenanceRef[] {
  const seen = new Set<string>();
  const merged: ProvenanceRef[] = [];

  for (const refs of refSets) {
    for (const ref of refs) {
      const key = `${ref.sourceType}:${ref.sourceRef}:${ref.operationRef}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(ref);
      }
    }
  }

  return merged;
}

/**
 * Generate a human-readable provenance summary.
 */
export function summarizeProvenance(refs: ProvenanceRef[]): string {
  if (refs.length === 0) return "No provenance data available.";

  const bySrcType: Record<string, number> = {};
  for (const ref of refs) {
    bySrcType[ref.sourceType] = (bySrcType[ref.sourceType] || 0) + 1;
  }

  const parts = Object.entries(bySrcType).map(
    ([type, count]) => `${count} ${type} source${count !== 1 ? "s" : ""}`
  );

  return `Evidence drawn from ${parts.join(", ")}.`;
}
