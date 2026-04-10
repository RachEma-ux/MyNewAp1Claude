/**
 * KGIA Runtime — State Factory & Helpers
 *
 * Creates and manages RuntimeState objects for the pipeline.
 */

import type { RuntimeState, RuntimeNodeName } from "../domain/types";

/**
 * Create a fresh RuntimeState for a new run.
 */
export function createRuntimeState(params: {
  workspaceId: number;
  sessionId: number;
  runId: number;
  question: string;
  sourceIds?: number[];
  requestedMode?: string;
}): RuntimeState {
  return {
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    runId: params.runId,
    question: params.question,
    sourceIds: params.sourceIds ?? [],
    requestedMode: params.requestedMode,
    currentNode: "classifyIntent",
    completedNodes: [],
    intent: undefined,
    selectedMode: undefined,
    schemaSlice: undefined,
    queryPlan: undefined,
    safetyVerdict: undefined,
    queryResults: [],
    pathCandidates: [],
    evidenceGraph: { nodes: [], edges: [] },
    memoryGraph: { nodes: [], edges: [] },
    provenanceRefs: [],
    temporalClaims: [],
    envelope: undefined,
    errors: [],
    startedAt: new Date(),
  };
}

/**
 * Advance the pipeline to the next node.
 */
export function advanceNode(
  state: RuntimeState,
  completedNode: RuntimeNodeName
): RuntimeState {
  return {
    ...state,
    completedNodes: [...state.completedNodes, completedNode],
    currentNode: completedNode,
  };
}

/**
 * Record an error in the pipeline state.
 */
export function addError(state: RuntimeState, error: string): RuntimeState {
  return {
    ...state,
    errors: [...state.errors, error],
  };
}
