/**
 * KGIA Domain — Path Reasoning
 *
 * Candidate path expansion, ranking, pruning, alternative path
 * comparison, and missing-direct-fact fallback behavior.
 */

import type {
  PathCandidate,
  EvidenceNode,
  EvidenceEdge,
  EvidenceGraph,
  GraphSource,
} from "./types";

// ── Path Expansion ───────────────────────────────────────────────

export function expandPaths(
  queryResults: Record<string, unknown>[],
  source: GraphSource
): PathCandidate[] {
  const candidates: PathCandidate[] = [];

  for (let i = 0; i < queryResults.length; i++) {
    const result = queryResults[i];
    const path = extractPathFromResult(result, i);
    if (path) {
      candidates.push(path);
    }
  }

  return candidates;
}

function extractPathFromResult(
  result: Record<string, unknown>,
  index: number
): PathCandidate | null {
  const nodes: EvidenceNode[] = [];
  const edges: EvidenceEdge[] = [];

  // Extract nodes from result columns
  for (const [key, value] of Object.entries(result)) {
    if (value && typeof value === "object" && "labels" in (value as any)) {
      const nodeData = value as Record<string, unknown>;
      nodes.push({
        id: `node-${index}-${key}`,
        nodeType: "entity",
        label: String((nodeData.labels as string[])?.[0] ?? key),
        properties: (nodeData.properties as Record<string, unknown>) ?? {},
        confidence: 1.0,
      });
    } else if (value && typeof value === "object" && "type" in (value as any)) {
      const edgeData = value as Record<string, unknown>;
      edges.push({
        id: `edge-${index}-${key}`,
        fromNodeId: `node-${index}-start`,
        toNodeId: `node-${index}-end`,
        relationshipType: String(edgeData.type ?? key),
        properties: (edgeData.properties as Record<string, unknown>) ?? {},
        confidence: 1.0,
      });
    }
  }

  if (nodes.length === 0 && edges.length === 0) {
    // Treat flat result as a single entity node
    nodes.push({
      id: `node-${index}-flat`,
      nodeType: "entity",
      label: `Result ${index + 1}`,
      properties: result,
      confidence: 0.8,
    });
  }

  return {
    id: `path-${index}`,
    nodes,
    edges,
    score: 1.0 / (1 + index * 0.1), // decreasing score by position
    hops: edges.length,
    explanation: `Path extracted from result ${index + 1} (${nodes.length} nodes, ${edges.length} edges)`,
  };
}

// ── Path Ranking ─────────────────────────────────────────────────

export function rankPaths(candidates: PathCandidate[]): PathCandidate[] {
  return [...candidates].sort((a, b) => {
    // Prefer shorter paths with higher confidence
    const scoreA = a.score * (1 / (1 + a.hops * 0.2));
    const scoreB = b.score * (1 / (1 + b.hops * 0.2));
    return scoreB - scoreA;
  });
}

// ── Path Pruning ─────────────────────────────────────────────────

export function prunePaths(
  candidates: PathCandidate[],
  maxPaths: number = 10,
  minScore: number = 0.1
): PathCandidate[] {
  return candidates
    .filter((p) => p.score >= minScore)
    .slice(0, maxPaths);
}

// ── Alternative Path Comparison ──────────────────────────────────

export function compareAlternativePaths(
  primary: PathCandidate[],
  alternatives: PathCandidate[]
): { primary: PathCandidate[]; alternatives: PathCandidate[]; divergencePoints: string[] } {
  const divergencePoints: string[] = [];

  for (const alt of alternatives) {
    const matchingPrimary = primary.find(
      (p) => p.nodes.some((n) => alt.nodes.some((an) => an.label === n.label))
    );
    if (!matchingPrimary) {
      divergencePoints.push(
        `Alternative path "${alt.id}" has no overlapping nodes with primary paths`
      );
    }
  }

  return { primary, alternatives, divergencePoints };
}

// ── Missing Direct Fact Fallback ─────────────────────────────────

export function buildFallbackFromPaths(
  candidates: PathCandidate[]
): { inferredFacts: string[]; confidence: number } {
  if (candidates.length === 0) {
    return { inferredFacts: ["No direct facts found in graph"], confidence: 0 };
  }

  const inferredFacts: string[] = [];
  let totalConfidence = 0;

  for (const candidate of candidates.slice(0, 5)) {
    for (const node of candidate.nodes) {
      inferredFacts.push(
        `${node.label}: ${JSON.stringify(node.properties).slice(0, 200)}`
      );
    }
    totalConfidence += candidate.score;
  }

  return {
    inferredFacts,
    confidence: Math.min(totalConfidence / candidates.length, 1.0),
  };
}

// ── Evidence Path Assembly ───────────────────────────────────────

export function assembleEvidenceFromPaths(
  candidates: PathCandidate[]
): EvidenceGraph {
  const nodeMap = new Map<string, EvidenceNode>();
  const edgeMap = new Map<string, EvidenceEdge>();

  for (const candidate of candidates) {
    for (const node of candidate.nodes) {
      if (!nodeMap.has(node.id)) {
        nodeMap.set(node.id, node);
      }
    }
    for (const edge of candidate.edges) {
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
