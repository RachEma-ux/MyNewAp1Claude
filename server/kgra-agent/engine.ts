/**
 * KGRA Engine — TypeScript state machine orchestrator.
 * Ports the Python LangGraph graph into a sequential pipeline
 * with conditional routing between nodes.
 */

import { createInitialState, type KGRAState, type RuntimeMode } from "./state";
import type { KGRAAnswer } from "./adapter";
import { shouldUseHumanReview, getFallbackChain } from "./routing";
import {
  classifyIntentNode,
  resolveDomainTermsNode,
  loadSchemaSliceNode,
  chooseModeNode,
  planOperationNode,
  validateOperationNode,
  executeRetrievalNode,
  expandRankPathsNode,
  assembleEvidenceGraphNode,
  updateTaskMemoryNode,
  synthesizeAnswerNode,
  humanReviewNode,
  bundleMultiPassReviewNode,
  bundleCoherenceScoringNode,
  bundleReadinessScoringNode,
  bundleDecisionResolutionNode,
  bundleContractMappingNode,
} from "./nodes";

/**
 * Execute a full KGRA run — the complete 12-node pipeline.
 */
export async function executeKGRARun(params: {
  query: string;
  mode?: string;
  workspace_id?: string;
  session_id?: string;
}): Promise<KGRAAnswer> {
  const runId = `kgra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestId = `req-${Date.now()}`;

  const state = createInitialState(params.query, runId, requestId);
  state.workspace_id = params.workspace_id;
  state.session_id = params.session_id;

  // Override mode if explicitly provided
  if (params.mode) {
    state.mode = params.mode as RuntimeMode;
  }

  try {
    await runPipeline(state);
  } catch (err) {
    state.errors.push(`Pipeline error: ${(err as Error).message}`);
    if (!state.answer) {
      state.answer = `KGRA pipeline error: ${(err as Error).message}`;
    }
  }

  return stateToAnswer(state);
}

/**
 * Run the full KGRA pipeline with conditional routing.
 */
async function runPipeline(state: KGRAState): Promise<void> {
  // 1. Classify intent
  classifyIntentNode(state);

  // 2. Resolve domain terms
  resolveDomainTermsNode(state);

  // 3. Load schema slice
  loadSchemaSliceNode(state);

  // 4. Choose mode
  chooseModeNode(state);

  // 5. Route based on mode
  if (state.mode === "bundle_evaluation" && state.evaluation) {
    // Bundle evaluation subgraph
    await runBundleSubgraph(state);
  } else if (state.mode === "human_review") {
    humanReviewNode(state);
    return;
  } else {
    // Main reasoning flow
    await runMainFlow(state);
  }
}

/**
 * Main reasoning flow: plan → validate → execute → evidence → synthesize
 */
async function runMainFlow(state: KGRAState): Promise<void> {
  // 5. Plan operation
  planOperationNode(state);

  // 6. Validate operation
  validateOperationNode(state);

  // 7. Route after validation
  if (!state.query_validated) {
    // Try fallback chain
    const fallbacks = getFallbackChain(state.mode);
    if (fallbacks.length > 0) {
      state.mode = fallbacks[0];
      state.fallback_used = fallbacks[0];
      planOperationNode(state);
      validateOperationNode(state);
    }

    if (!state.query_validated) {
      // Give up — synthesize with error
      await synthesizeAnswerNode(state);
      return;
    }
  }

  // 8. Execute retrieval (async — queries real platform DB)
  await executeRetrievalNode(state);

  // 9. Path reasoning (if applicable)
  if (state.mode === "path_reasoning") {
    expandRankPathsNode(state);
  }

  // 10. Assemble evidence graph
  assembleEvidenceGraphNode(state);

  // 11. Update task memory
  updateTaskMemoryNode(state);

  // 12. Synthesize answer
  await synthesizeAnswerNode(state);

  // 13. Post-synthesis: check if human review needed
  if (shouldUseHumanReview(state)) {
    humanReviewNode(state);
  }
}

/**
 * Bundle evaluation subgraph: multi-pass → coherence → readiness → decisions → contracts
 */
async function runBundleSubgraph(state: KGRAState): Promise<void> {
  // Multi-pass review (3 passes)
  for (let pass = 0; pass < 3; pass++) {
    bundleMultiPassReviewNode(state);
    if ((state.evaluation?.current_pass || 0) > 3) break;
  }

  bundleCoherenceScoringNode(state);
  bundleReadinessScoringNode(state);
  bundleDecisionResolutionNode(state);
  bundleContractMappingNode(state);

  // Synthesize final answer
  await synthesizeAnswerNode(state);
}

/**
 * Convert final KGRAState to KGRAAnswer response shape.
 */
function stateToAnswer(state: KGRAState): KGRAAnswer {
  return {
    answer: state.answer,
    mode: state.mode,
    confidence: state.confidence,
    observed_facts: state.observed_facts,
    inferred_claims: state.inferred_claims,
    evidence_graph: {
      nodes: state.evidence_nodes,
      edges: state.evidence_edges,
    },
    provenance: state.provenance.map((p) => ({
      source_type: p.source_type,
      source_ref: p.source_ref,
      operation_ref: p.operation_ref,
    })),
    temporal: state.temporal,
    missing_knowledge: state.missing_knowledge,
    governance: state.governance,
    learning: state.learning,
    analytical: state.analytical,
    error: state.errors.length > 0
      ? { code: "PIPELINE_ERROR", message: state.errors.join("; "), failedSteps: [], fallbackUsed: state.fallback_used }
      : undefined,
    cost_estimate: state.cost,
    run_id: state.run_id,
    request_id: state.request_id,
  };
}
