/**
 * Recommendation Service runtime — T-G.4.1.
 *
 * Wires the existing contracts (T-G.4 surface) + assemble-response
 * (T-G.8 pure decision logic) into a runnable service. The runtime
 * itself is intentionally thin per the assemble-response.ts comment:
 *
 *   "This is the **decision logic** the eventual runtime needs at
 *    the tRPC boundary. Pinning it here so the runtime is a thin
 *    shell."
 *
 * Architecture (precedent (q) — source-of-truth boundary INSIDE
 * the domain doesn't strictly apply because this is a read service,
 * not an ingestion pipeline; instead the boundary here is between
 * (a) candidate fetch — operator-supplied via DI — and (b) decision
 * logic — already pure in assemble-response).
 *
 * Why dependency injection on the fetch function:
 *   - Production wires the GraphRAG router → candidate mapper.
 *   - The GraphRAG router knows which closed-taxonomy
 *     RecommendationKind maps to which underlying retrieval shape
 *     (e.g., `relevant_notes` → graph-rag note retrieval;
 *     `relevant_tools` → MCP registry traversal).
 *   - Tests inject a stub returning fixed candidates so the runtime
 *     can be unit-tested without booting GraphRAG.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports. Runtime is shape-only.
 *   - No `process.env.*_API_KEY` reads.
 *   - GraphRAG router (Phase 12, done) is the sole knowledge-
 *     retrieval path — wired via the injected fetch function;
 *     not imported here.
 */

import { assembleRecommendationResponse } from "../assemble-response.js";
import type {
  RecommendationCandidate,
} from "../assemble-response.js";
import type {
  RecommendationRequest,
  RecommendationResponse,
} from "../contracts.js";

// ============================================================================
// Fetch-fn boundary contract
// ============================================================================

/**
 * Caller-injected candidate fetcher. The runtime calls this once
 * per `recommend()` invocation; the implementation translates the
 * `RecommendationRequest` into one or more underlying retrieval
 * calls (GraphRAG router, MCP registry traversal, etc.) and returns
 * the union of candidates.
 *
 * Contract:
 *   - Returns ONLY candidates whose `kind` matches the request's
 *     `kind`. The runtime does not re-filter by kind.
 *   - Returns candidates with `permissionStatus` already classified
 *     (the runtime drops `hidden` + redacts `redacted` per the
 *     assemble-response policy).
 *   - May return more candidates than `request.limit` — the runtime
 *     truncates after rank-sort.
 *   - May return zero candidates — the runtime returns an empty
 *     `RecommendationResponse`.
 */
export type RecommendationCandidateFetchFn = (
  request: RecommendationRequest,
) => Promise<ReadonlyArray<RecommendationCandidate>>;

// ============================================================================
// Service interface
// ============================================================================

export interface RecommendationService {
  /**
   * Run a recommendation against the underlying retrieval surface.
   * Returns the assembled response with ranked + permission-filtered
   * results.
   */
  recommend(request: RecommendationRequest): Promise<RecommendationResponse>;
}

// ============================================================================
// Factory
// ============================================================================

export interface CreateRecommendationServiceOptions {
  /** Caller-injected candidate fetcher. Production wires this to
   *  the GraphRAG router (Phase 12, done); tests pass a stub. */
  readonly fetchCandidates: RecommendationCandidateFetchFn;
}

export function createRecommendationService(
  options: CreateRecommendationServiceOptions,
): RecommendationService {
  return {
    async recommend(
      request: RecommendationRequest,
    ): Promise<RecommendationResponse> {
      const candidates = await options.fetchCandidates(request);
      return assembleRecommendationResponse(candidates, { request });
    },
  };
}
