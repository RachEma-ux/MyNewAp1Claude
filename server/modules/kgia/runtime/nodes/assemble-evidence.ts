/**
 * KGIA Runtime Node — Assemble Evidence
 *
 * Merges query results, path evidence, and memory into a unified
 * evidence graph with provenance and temporal claims.
 */

import type { RuntimeState, GraphSource } from "../../domain/types";
import {
  assembleEvidenceFromResults,
  mergeEvidenceGraphs,
  incorporatePathEvidence,
  extractTemporalClaims,
} from "../../domain/evidence-assembler";
import { advanceNode } from "../state";

export function assembleEvidenceNode(
  state: RuntimeState,
  source: GraphSource
): RuntimeState {
  // Build evidence from query results
  let evidence = { nodes: [] as any[], edges: [] as any[] };
  let provenance = state.provenanceRefs;

  if (state.queryResults.length > 0 && state.queryPlan) {
    const assembled = assembleEvidenceFromResults(
      state.queryResults,
      source,
      state.queryPlan.queryText
    );
    evidence = assembled.graph;
    provenance = [...provenance, ...assembled.provenance];
  }

  // Incorporate path evidence
  if (state.pathCandidates.length > 0) {
    evidence = incorporatePathEvidence(evidence, state.pathCandidates);
  }

  // Extract temporal claims
  const temporalClaims = extractTemporalClaims(evidence, source);

  return advanceNode(
    {
      ...state,
      evidenceGraph: evidence,
      provenanceRefs: provenance,
      temporalClaims,
    },
    "assembleEvidence"
  );
}
