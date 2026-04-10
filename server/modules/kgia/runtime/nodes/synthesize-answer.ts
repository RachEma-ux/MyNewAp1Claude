/**
 * KGIA Runtime Node — Synthesize Answer
 *
 * Produces the final AnswerEnvelope from accumulated state.
 */

import type { RuntimeState } from "../../domain/types";
import { synthesizeAnswerEnvelope } from "../../domain/answer-synthesizer";
import { advanceNode } from "../state";

export function synthesizeAnswerNode(state: RuntimeState): RuntimeState {
  const envelope = synthesizeAnswerEnvelope({
    question: state.question,
    selectedMode: state.selectedMode ?? "direct_query",
    evidenceGraph: state.evidenceGraph,
    pathCandidates: state.pathCandidates,
    provenanceRefs: state.provenanceRefs,
    temporalClaims: state.temporalClaims,
    safetyVerdict: state.safetyVerdict ?? {
      safe: true,
      readOnly: true,
      violations: [],
      blockedPatterns: [],
      reviewRequired: false,
    },
    queryErrors: state.errors,
  });

  return advanceNode(
    { ...state, envelope },
    "synthesizeAnswer"
  );
}
