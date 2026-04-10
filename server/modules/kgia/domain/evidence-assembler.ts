/**
 * KGIA Domain — Evidence Assembler
 *
 * Assembles evidence graph from query results, path candidates,
 * and memory graph contributions. Produces the evidence substructure
 * of the AnswerEnvelope.
 */

import type {
  EvidenceGraph,
  EvidenceNode,
  EvidenceEdge,
  PathCandidate,
  ProvenanceRef,
  TemporalClaim,
  GraphSource,
  TaskMemoryGraph,
} from "./types";

// ── Evidence Assembly from Query Results ─────────────────────────

export function assembleEvidenceFromResults(
  results: Record<string, unknown>[],
  source: GraphSource,
  queryText: string
): { graph: EvidenceGraph; provenance: ProvenanceRef[] } {
  const nodes: EvidenceNode[] = [];
  const edges: EvidenceEdge[] = [];
  const provenance: ProvenanceRef[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const nodeId = `result-${source.id}-${i}`;

    nodes.push({
      id: nodeId,
      nodeType: "entity",
      label: extractLabel(result),
      properties: result,
      sourceRef: `source:${source.id}`,
      confidence: 1.0,
    });

    provenance.push({
      sourceId: source.id,
      sourceName: source.name,
      queryText,
      resultIndex: i,
      timestamp: new Date().toISOString(),
    });
  }

  // Connect sequential results with implicit edges
  for (let i = 1; i < nodes.length && i < 20; i++) {
    edges.push({
      id: `edge-seq-${i}`,
      fromNodeId: nodes[i - 1].id,
      toNodeId: nodes[i].id,
      relationshipType: "RESULT_SEQUENCE",
      properties: {},
      confidence: 0.5,
    });
  }

  return { graph: { nodes, edges }, provenance };
}

// ── Merge Evidence Graphs ────────────────────────────────────────

export function mergeEvidenceGraphs(...graphs: EvidenceGraph[]): EvidenceGraph {
  const nodeMap = new Map<string, EvidenceNode>();
  const edgeMap = new Map<string, EvidenceEdge>();

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      const existing = nodeMap.get(node.id);
      if (!existing || node.confidence > existing.confidence) {
        nodeMap.set(node.id, node);
      }
    }
    for (const edge of graph.edges) {
      if (!edgeMap.has(edge.id)) {
        edgeMap.set(edge.id, edge);
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

// ── Incorporate Path Candidates ──────────────────────────────────

export function incorporatePathEvidence(
  baseGraph: EvidenceGraph,
  candidates: PathCandidate[]
): EvidenceGraph {
  const pathGraphs = candidates.map((c) => ({
    nodes: c.nodes,
    edges: c.edges,
  }));
  return mergeEvidenceGraphs(baseGraph, ...pathGraphs);
}

// ── Incorporate Memory Graph ─────────────────────────────────────

export function incorporateMemoryEvidence(
  baseGraph: EvidenceGraph,
  memory: TaskMemoryGraph
): EvidenceGraph {
  const memoryNodes: EvidenceNode[] = memory.nodes
    .filter((n) => n.status === "active")
    .map((n) => ({
      id: `mem-${n.id}`,
      nodeType: "claim" as const,
      label: n.label,
      properties: { content: n.content, memoryType: n.nodeType },
      sourceRef: `memory:session`,
      confidence: n.confidence,
    }));

  const memoryEdges: EvidenceEdge[] = memory.edges.map((e) => ({
    id: `mem-${e.id}`,
    fromNodeId: `mem-${e.fromNodeId}`,
    toNodeId: `mem-${e.toNodeId}`,
    relationshipType: e.relationshipType,
    properties: {},
    confidence: 0.7,
  }));

  return mergeEvidenceGraphs(baseGraph, { nodes: memoryNodes, edges: memoryEdges });
}

// ── Extract Temporal Claims ──────────────────────────────────────

export function extractTemporalClaims(
  graph: EvidenceGraph,
  source: GraphSource
): TemporalClaim[] {
  const claims: TemporalClaim[] = [];
  const temporalKeys = ["createdAt", "updatedAt", "validFrom", "validTo", "date", "timestamp", "startDate", "endDate"];

  for (const node of graph.nodes) {
    for (const [key, value] of Object.entries(node.properties)) {
      if (temporalKeys.includes(key) && value) {
        claims.push({
          claim: `${node.label} has ${key} = ${String(value)}`,
          validFrom: key.includes("start") || key === "validFrom" ? String(value) : undefined,
          validTo: key.includes("end") || key === "validTo" ? String(value) : undefined,
          confidence: node.confidence,
          source: {
            sourceId: source.id,
            sourceName: source.name,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  }

  return claims;
}

// ── Extract Observed Facts ───────────────────────────────────────

export function extractObservedFacts(graph: EvidenceGraph): string[] {
  const facts: string[] = [];

  for (const node of graph.nodes) {
    if (node.nodeType === "entity") {
      const propSummary = Object.entries(node.properties)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 50)}`)
        .join(", ");
      facts.push(`[${node.label}] ${propSummary}`);
    }
  }

  return facts.slice(0, 20);
}

// ── Identify Missing Knowledge ───────────────────────────────────

export function identifyMissingKnowledge(
  question: string,
  graph: EvidenceGraph,
  queryPlanErrors: string[]
): string[] {
  const missing: string[] = [];

  if (graph.nodes.length === 0) {
    missing.push("No matching entities found in any graph source");
  }

  if (graph.edges.length === 0 && question.toLowerCase().includes("relationship")) {
    missing.push("No relationships found between entities");
  }

  if (queryPlanErrors.length > 0) {
    missing.push(`Query validation issues: ${queryPlanErrors.join("; ")}`);
  }

  if (graph.nodes.length < 3 && question.split(" ").length > 10) {
    missing.push("Complex question with limited evidence — results may be incomplete");
  }

  return missing;
}

// ── Helpers ──────────────────────────────────────────────────────

function extractLabel(result: Record<string, unknown>): string {
  const labelKeys = ["name", "label", "title", "id", "uri"];
  for (const key of labelKeys) {
    if (result[key] && typeof result[key] === "string") {
      return String(result[key]).slice(0, 200);
    }
  }
  return `Entity(${Object.keys(result).slice(0, 3).join(",")})`;
}
