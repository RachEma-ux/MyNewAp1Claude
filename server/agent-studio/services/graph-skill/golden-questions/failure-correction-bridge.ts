/**
 * Golden-question failure → correction-proposal bridge — T-D.5.
 *
 * Closes the last T-D acceptance criterion: "self-correcting" loop.
 * When the Phase 12 GraphRAG router answers a golden question wrong,
 * the live evaluator emits a `GraphCorrectionProposal` row tagged with
 * a new `review_golden_question_failure` proposal kind. A human
 * reviewer triages the failure and decides what graph change is
 * required (often: add a missing edge, fix a template registration,
 * register a missing skill pack).
 *
 * Why a proposal rather than an auto-mutation:
 *   - Golden-question failures are signal-rich but action-vague.
 *     The wrong-template-picked case might be a template-routing
 *     issue OR a missing edge OR a stale ingestion. Auto-mutation
 *     would be reckless.
 *   - Proposals flow through the existing approve-and-apply chain
 *     (T-D.4) so the operator triage UI already renders them.
 *
 * Boundary discipline:
 *   - The bridge is composition only. Insert is injected via the
 *     `proposalWriter` option so tests don't need ASDB and operators
 *     can swap the writer (e.g., for batched-write modes).
 *   - The default writer uses Drizzle against `agsGraphCorrectionProposals`.
 *   - No neo4j-driver / openrouter / process.env reads.
 *
 * Hook contract:
 *   - `convertFailureToProposal(score, options)` is pure (no I/O) —
 *     returns the row data to insert. The evaluator's emitter wrapper
 *     calls `proposalWriter(rowData)`.
 *   - Fire-and-forget at the call site (like `recordFailureStateEvent`)
 *     so a bridge failure cannot block the evaluation loop.
 */

import type { GoldenQuestionScore } from "./live-evaluator.js";

/**
 * Proposal-kind constant for golden-question failures. Sits ALONGSIDE
 * the existing graph-quality proposal taxonomy without conflicting
 * (those are produced by graph-quality scanners; this one is produced
 * by the golden-questions evaluator).
 */
export const GOLDEN_QUESTION_FAILURE_PROPOSAL_KIND =
  "review_golden_question_failure" as const;

/**
 * Row shape ready to insert into `ags_graph_correction_proposals`.
 * Mirrors the column types in `drizzle/tables/agent-studio-graph-quality.ts`.
 */
export interface GoldenQuestionFailureProposalRow {
  readonly proposalKind: typeof GOLDEN_QUESTION_FAILURE_PROPOSAL_KIND;
  readonly targetTypeKey: string;
  readonly targetId: number | null;
  readonly proposedChange: Record<string, unknown>;
  readonly confidence: number;
  readonly rationale: string;
  readonly proposedByAgentId: number | null;
  readonly status: "pending";
}

export interface ConvertFailureToProposalOptions {
  /**
   * Workspace context the evaluator ran under. Recorded in the
   * proposedChange payload for operator triage filtering.
   */
  readonly workspaceId: number;
  /**
   * Optional agent id attributed to the system-internal evaluator
   * (used for proposed_by_agent_id column).
   */
  readonly proposedByAgentId?: number;
  /**
   * Confidence the bridge assigns to the proposal. Golden-question
   * failures are HIGH-confidence "something is wrong" signals (the
   * suite is curated) so default = 0.95. Operator triage decides the
   * correct fix, not the bridge.
   */
  readonly confidence?: number;
}

/**
 * Pure: derive a `GraphCorrectionProposal` row from a failed
 * `GoldenQuestionScore`. The caller-supplied score MUST be a failure
 * (`score.passed === false`) — passing a passed score throws.
 */
export function convertFailureToProposal(
  score: GoldenQuestionScore,
  options: ConvertFailureToProposalOptions,
): GoldenQuestionFailureProposalRow {
  if (score.passed) {
    throw new Error(
      "[T-D.5] convertFailureToProposal called with a PASSED score — bridge only handles failures",
    );
  }
  const confidence = clamp01(options.confidence ?? 0.95);
  const rationale = buildRationale(score);
  return {
    proposalKind: GOLDEN_QUESTION_FAILURE_PROPOSAL_KIND,
    /**
     * The "target" of a golden-question failure is the routing /
     * retrieval surface, not a graph node. Use `agent_runtime` as the
     * canonical opaque typeKey and `null` for targetId so the operator
     * triage UI groups them under "agent / retrieval issues".
     */
    targetTypeKey: "agent_runtime",
    targetId: null,
    proposedChange: {
      suiteKey: score.suiteKey,
      questionKey: score.questionKey,
      workspaceId: options.workspaceId,
      failures: score.failures,
      actualSkillPackKey: score.actualSkillPackKey ?? null,
      actualTemplateKey: score.actualTemplateKey ?? null,
      actualCitationCount: score.actualCitationCount,
      actualRetrievalMode: score.actualRetrievalMode,
      engineErrored: score.error !== undefined,
      hint: "Review the failure context; common fixes: add missing edge, register template, fix skill pack routing.",
    },
    confidence,
    rationale,
    proposedByAgentId: options.proposedByAgentId ?? null,
    status: "pending",
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.95;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function buildRationale(score: GoldenQuestionScore): string {
  const head = `Golden question ${score.suiteKey}/${score.questionKey} failed.`;
  if (score.error) {
    return `${head} Engine error: ${score.error}`;
  }
  if (score.failures.length === 0) {
    return `${head} (no specific failure reason recorded)`;
  }
  return `${head} Failures: ${score.failures.join("; ")}`;
}

// ============================================================================
// Emitter (impure — wraps writer + score for evaluator wiring)
// ============================================================================

/**
 * Writer-fn boundary. Production wires a Drizzle insert; tests inject
 * a recording stub. Returns the inserted proposal id (or `null` when
 * the writer chooses not to persist, e.g., ASDB-null).
 */
export type GoldenQuestionFailureProposalWriter = (
  row: GoldenQuestionFailureProposalRow,
) => Promise<{ readonly proposalId: number | null }>;

export interface GoldenQuestionFailureEmitterOptions
  extends ConvertFailureToProposalOptions {
  readonly proposalWriter: GoldenQuestionFailureProposalWriter;
}

/**
 * Fire-and-forget emitter shape matching `recordFailureStateEvent`'s
 * contract: returns a promise that the caller `void`s; never throws
 * out of the call site (errors swallowed + logged via console.warn
 * so the evaluation loop continues).
 */
export function emitGoldenQuestionFailureProposal(
  score: GoldenQuestionScore,
  options: GoldenQuestionFailureEmitterOptions,
): Promise<{ readonly proposalId: number | null } | null> {
  if (score.passed) {
    return Promise.resolve(null);
  }
  try {
    const row = convertFailureToProposal(score, options);
    return options.proposalWriter(row).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        "[T-D.5] golden-question failure proposal writer threw:",
        err instanceof Error ? err.message : String(err),
      );
      return { proposalId: null };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[T-D.5] convertFailureToProposal threw:",
      err instanceof Error ? err.message : String(err),
    );
    return Promise.resolve({ proposalId: null });
  }
}
