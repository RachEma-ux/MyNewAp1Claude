/**
 * KGIA Domain — Answer Synthesizer
 *
 * Synthesizes the final AnswerEnvelope from all pipeline outputs:
 * evidence graph, temporal claims, provenance, governance verdict,
 * and missing knowledge flags.
 */

import type {
  AnswerEnvelope,
  EvidenceGraph,
  ProvenanceRef,
  TemporalClaim,
  SafetyVerdict,
  Confidence,
  KgiaMode,
  PathCandidate,
} from "./types";
import { extractObservedFacts, identifyMissingKnowledge } from "./evidence-assembler";

// ── Confidence Calculation ───────────────────────────────────────

export function calculateConfidence(
  evidenceGraph: EvidenceGraph,
  pathCandidates: PathCandidate[],
  queryErrors: string[]
): Confidence {
  const nodeCount = evidenceGraph.nodes.length;
  const edgeCount = evidenceGraph.edges.length;

  // Data completeness: more evidence = higher completeness
  const dataCompleteness = Math.min(nodeCount / 10, 1.0);

  // Path strength: average path score
  const pathStrength =
    pathCandidates.length > 0
      ? pathCandidates.reduce((sum, p) => sum + p.score, 0) / pathCandidates.length
      : 0.5;

  // Source trust: based on average node confidence
  const avgNodeConfidence =
    nodeCount > 0
      ? evidenceGraph.nodes.reduce((sum, n) => sum + n.confidence, 0) / nodeCount
      : 0.3;
  const sourceTrust = avgNodeConfidence;

  // Penalize for query errors
  const errorPenalty = queryErrors.length * 0.1;

  const overall = Math.max(
    0,
    Math.min(1.0, (dataCompleteness + pathStrength + sourceTrust) / 3 - errorPenalty)
  );

  return {
    overall: Math.round(overall * 100) / 100,
    dataCompleteness: Math.round(dataCompleteness * 100) / 100,
    pathStrength: Math.round(pathStrength * 100) / 100,
    sourceTrust: Math.round(sourceTrust * 100) / 100,
  };
}

// ── Answer Text Generation ───────────────────────────────────────

export function generateAnswerText(
  question: string,
  evidenceGraph: EvidenceGraph,
  pathCandidates: PathCandidate[],
  mode: KgiaMode
): string {
  const facts = extractObservedFacts(evidenceGraph);

  if (facts.length === 0) {
    return `Unable to find definitive evidence in the knowledge graph for: "${question}". No matching entities or relationships were found in the queried sources.`;
  }

  const factSummary = facts.slice(0, 5).map((f) => `- ${f}`).join("\n");

  let modeNote = "";
  switch (mode) {
    case "direct_query":
      modeNote = "Based on direct graph query results";
      break;
    case "graph_rag":
      modeNote = "Based on GraphRAG hybrid retrieval";
      break;
    case "memory":
      modeNote = "Based on task memory graph analysis";
      break;
    case "hybrid":
      modeNote = "Based on hybrid multi-source analysis";
      break;
  }

  const pathNote =
    pathCandidates.length > 0
      ? `\n\nPath analysis found ${pathCandidates.length} candidate path(s) with up to ${Math.max(...pathCandidates.map((p) => p.hops))} hops.`
      : "";

  return `${modeNote}:\n\nEvidence found:\n${factSummary}${pathNote}\n\n${evidenceGraph.nodes.length} entities and ${evidenceGraph.edges.length} relationships examined.`;
}

// ── Inferred Claims Extraction ───────────────────────────────────

export function extractInferredClaims(
  evidenceGraph: EvidenceGraph,
  pathCandidates: PathCandidate[]
): string[] {
  const claims: string[] = [];

  // Claims from multi-hop paths
  for (const path of pathCandidates) {
    if (path.hops >= 2) {
      claims.push(
        `Multi-hop inference (${path.hops} hops): ${path.explanation}`
      );
    }
  }

  // Claims from node aggregation
  const labelCounts = new Map<string, number>();
  for (const node of evidenceGraph.nodes) {
    labelCounts.set(node.label, (labelCounts.get(node.label) ?? 0) + 1);
  }
  for (const [label, count] of labelCounts) {
    if (count > 1) {
      claims.push(`Multiple instances of "${label}" found (${count} occurrences)`);
    }
  }

  return claims.slice(0, 10);
}

// ── Full Envelope Synthesis ──────────────────────────────────────

export function synthesizeAnswerEnvelope(params: {
  question: string;
  selectedMode: KgiaMode;
  evidenceGraph: EvidenceGraph;
  pathCandidates: PathCandidate[];
  provenanceRefs: ProvenanceRef[];
  temporalClaims: TemporalClaim[];
  safetyVerdict: SafetyVerdict;
  queryErrors: string[];
}): AnswerEnvelope {
  const {
    question,
    selectedMode,
    evidenceGraph,
    pathCandidates,
    provenanceRefs,
    temporalClaims,
    safetyVerdict,
    queryErrors,
  } = params;

  const confidence = calculateConfidence(evidenceGraph, pathCandidates, queryErrors);
  const answer = generateAnswerText(question, evidenceGraph, pathCandidates, selectedMode);
  const observedFacts = extractObservedFacts(evidenceGraph);
  const inferredClaims = extractInferredClaims(evidenceGraph, pathCandidates);
  const missingKnowledge = identifyMissingKnowledge(question, evidenceGraph, queryErrors);

  return {
    answer,
    selectedMode,
    confidence,
    observedFacts,
    inferredClaims,
    evidenceGraph,
    provenanceRefs,
    temporalValidity: temporalClaims,
    missingKnowledge,
    governanceVerdict: safetyVerdict,
  };
}
