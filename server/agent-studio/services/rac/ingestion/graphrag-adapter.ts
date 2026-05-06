/**
 * GraphRAG ingestion adapter — gap-shaped (Phase 3).
 *
 * Per `docs/evidence/agent-studio-rac/GRAPHRAG_CONTRACT_GAP_REPORT.md`:
 *   - GraphRAG runs as an external worker; today's public surface
 *     (`dataAnalysis.graphRag.query`) is async/job-shaped, not the
 *     synchronous retrieval contract RAC needs.
 *   - Until Data Analysis exposes a synchronous `dataAnalysis.graphrag.retrieve`
 *     action, this adapter ships **interface-real, backend-conditional**:
 *     `search()` returns an empty result with a structured
 *     `source_unavailable` warning so the executor can surface the
 *     gap to operators without faking results.
 *
 * When the public contract lands, swap the body of `search()` to
 * issue a `gatewayCall` against `dataAnalysis.graphrag.retrieve`. The
 * caller-facing shape (`RacIngestionAdapter`) will not change.
 */

import type {
  RacIngestionAdapter,
  RacIndexValidationResult,
  RacIngestionPreview,
  RacRetrievalHealth,
  RacRetrievalRequest,
  RacRetrievalResult,
} from "./types";

const SOURCE_UNAVAILABLE_REASON =
  "graphrag_public_retrieve_contract_missing — see docs/evidence/agent-studio-rac/GRAPHRAG_CONTRACT_GAP_REPORT.md";

export const graphragAdapter: RacIngestionAdapter = {
  async search(input: RacRetrievalRequest): Promise<RacRetrievalResult> {
    const start = Date.now();
    return {
      chunks: [],
      latencyMs: Date.now() - start,
      warnings: [
        `source_unavailable: source=${input.sourceId} type=graph_index — ${SOURCE_UNAVAILABLE_REASON}`,
      ],
    };
  },

  async health(): Promise<RacRetrievalHealth> {
    return {
      status: "unavailable",
      reason: SOURCE_UNAVAILABLE_REASON,
    };
  },

  async validateIndex(input: {
    workspaceId: number;
    sourceId: number;
  }): Promise<RacIndexValidationResult> {
    return {
      ok: false,
      reason: "source_unavailable",
      details: {
        sourceId: input.sourceId,
        workspaceId: input.workspaceId,
        gap: SOURCE_UNAVAILABLE_REASON,
      },
    };
  },

  async preview(): Promise<RacIngestionPreview> {
    return {
      sampleChunks: [],
      warnings: [SOURCE_UNAVAILABLE_REASON],
    };
  },
};
