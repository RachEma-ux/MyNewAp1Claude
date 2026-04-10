/**
 * KGIA — Confidence Scorer
 *
 * Multi-dimensional confidence scoring for KGIA answers.
 * Produces an overall score from 4 components:
 *   dataCompleteness, pathStrength, sourceTrust, queryQuality
 */

import type { Confidence, EvidenceGraph, PathCandidate } from "../domain/types";

interface ScoringInputs {
  evidenceGraph: EvidenceGraph;
  pathCandidates: PathCandidate[];
  queryErrors: string[];
  sourceCount: number;
  allowlistedCount: number;
  validatedQuery: boolean;
}

/**
 * Calculate multi-dimensional confidence score.
 */
export function scoreConfidence(inputs: ScoringInputs): Confidence {
  const dataCompleteness = scoreDataCompleteness(inputs.evidenceGraph);
  const pathStrength = scorePathStrength(inputs.pathCandidates);
  const sourceTrust = scoreSourceTrust(inputs.sourceCount, inputs.allowlistedCount);
  const queryQuality = scoreQueryQuality(inputs.queryErrors, inputs.validatedQuery);

  // Weighted average
  const overall =
    dataCompleteness * 0.35 +
    pathStrength * 0.25 +
    sourceTrust * 0.20 +
    queryQuality * 0.20;

  return {
    overall: Math.round(overall * 100) / 100,
    dataCompleteness: Math.round(dataCompleteness * 100) / 100,
    pathStrength: Math.round(pathStrength * 100) / 100,
    sourceTrust: Math.round(sourceTrust * 100) / 100,
  };
}

/**
 * Determine confidence band from overall score.
 */
export function confidenceBand(score: number): "low" | "medium" | "high" {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

function scoreDataCompleteness(graph: EvidenceGraph): number {
  if (graph.nodes.length === 0) return 0;
  const nodeScore = Math.min(graph.nodes.length / 10, 1);
  const edgeScore = graph.edges.length > 0 ? Math.min(graph.edges.length / 5, 1) : 0;
  const avgConfidence = graph.nodes.reduce((sum, n) => sum + (n.confidence ?? 0.5), 0) / graph.nodes.length;
  return (nodeScore * 0.3 + edgeScore * 0.3 + avgConfidence * 0.4);
}

function scorePathStrength(paths: PathCandidate[]): number {
  if (paths.length === 0) return 0.3; // No paths doesn't mean bad — direct lookups don't need them
  const avgScore = paths.reduce((sum, p) => sum + p.score, 0) / paths.length;
  const shortPaths = paths.filter((p) => p.hops <= 3).length / Math.max(paths.length, 1);
  return avgScore * 0.6 + shortPaths * 0.4;
}

function scoreSourceTrust(sourceCount: number, allowlistedCount: number): number {
  if (sourceCount === 0) return 0;
  const allowlistRatio = allowlistedCount / sourceCount;
  const multiSourceBonus = sourceCount > 1 ? 0.1 : 0;
  return Math.min(allowlistRatio * 0.8 + 0.2 + multiSourceBonus, 1);
}

function scoreQueryQuality(errors: string[], validated: boolean): number {
  if (errors.length > 0) return Math.max(0, 0.5 - errors.length * 0.15);
  return validated ? 1.0 : 0.7;
}
