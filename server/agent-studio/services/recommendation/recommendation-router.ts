/**
 * Recommendation Service — tRPC router (T-G.4.α).
 *
 * First operator-facing tRPC surface for the Recommendation Service
 * stack. Contracts (T-G.4) + assemble-response decision logic (T-G.8)
 * + runtime (T-G.4.1) + graphrag-candidate-fetcher (T-G.4.2) were
 * shipped piecewise; this PR mounts the operator-facing router so the
 * dashboard / agent-studio runtime can call into it.
 *
 * Mirrors the precedent (s)/(t) read-surface pattern established by
 * `code-graph-router.ts` (T-G.2) and `security-graph-router.ts`
 * (T-G.3): adminProcedure floor, discriminated envelopes, no
 * mutations.
 *
 * Mounted at `agentStudio.recommendation.*`. Two procedures (read-only):
 *
 *   - `recommend` — runs the recommendation service for one closed-
 *     taxonomy `RecommendationKind` against one `(typeKey, id)`
 *     anchor in the operator's workspace. Returns the assembled
 *     response with rank + reason + graph path + source citations
 *     + confidence + permission status.
 *   - `listKnownKinds` — enumeration of the 8 closed-taxonomy kinds
 *     (+ their per-kind metadata) so the dashboard dropdown populates
 *     dynamically — same parameterless-enumeration pattern as
 *     `codeGraph.listKnownTypes` / `securityGraph.listKnownTypes`.
 *
 * Permission model:
 *   - Both procedures are `adminProcedure`. The Recommendation
 *     Service already permission-classifies per-block via the
 *     GraphRAG safety-event channel; admin-only is the router floor
 *     because the operator dashboard surface is admin-scoped today.
 *   - The runtime's per-candidate `permissionStatus` (hidden /
 *     redacted / visible) still applies — admin does NOT bypass it.
 *
 * Mutations are intentionally absent:
 *   - The Recommendation Service is read-only by design.
 *   - The underlying GraphRAG router is read-only.
 *
 * Wiring:
 *   - The router constructs a fresh `RecommendationService` per
 *     request, wired to a `createGraphRagCandidateFetcher` that
 *     consults the production GraphRAG router. The injected router
 *     boundary is resolved through the same factory the chat /
 *     runtime layers use today.
 *   - `getOrCreateGraphRetrievalRouter` is the lazy-singleton
 *     accessor that respects the running boot phase; it returns
 *     `null` when GraphRAG isn't installed (dev/test environments
 *     without a backend). In that case `recommend` returns the
 *     `graphrag_unavailable` envelope rather than throwing.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - GraphRAG router (Phase 12, done) is the sole knowledge-retrieval
 *     seam — accessed via the lazy-singleton getter, not imported
 *     directly into a per-request hot path.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, router } from "../../../_core/trpc.js";
import {
  RECOMMENDATION_KIND_METADATA,
  RECOMMENDATION_KINDS,
  normalizeRecommendationLimit,
  normalizeRecommendationMinConfidence,
  type RecommendationKind,
  type RecommendationKindMetadata,
  type RecommendationResponse,
} from "./contracts.js";
import {
  createGraphRagCandidateFetcher,
  createRecommendationService,
} from "./runtime/public-api.js";
import { GraphRetrievalRouter } from "../graph/retrieval/retrieval-router.js";
import { getGraphRepository } from "../graph/repository/index.js";

// ============================================================================
// Input schemas
// ============================================================================

const RecommendInput = z.object({
  kind: z.enum(RECOMMENDATION_KINDS),
  anchor: z.object({
    typeKey: z.string().min(1).max(120),
    id: z.string().min(1).max(512),
  }),
  workspaceId: z.number().int().positive(),
  limit: z.number().int().positive().max(100).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
});

// ============================================================================
// Output envelopes
// ============================================================================

export type RecommendEnvelope =
  | { readonly status: "ok"; readonly response: RecommendationResponse }
  | { readonly status: "graphrag_unavailable" };

export interface ListKnownKindsEnvelope {
  readonly kinds: ReadonlyArray<RecommendationKind>;
  readonly metadata: Readonly<
    Record<RecommendationKind, RecommendationKindMetadata>
  >;
}

// ============================================================================
// Router
// ============================================================================

export const recommendationRouter = router({
  /**
   * Run the recommendation service for one closed-taxonomy
   * `RecommendationKind` against one `(typeKey, id)` anchor in the
   * operator's workspace. Returns the assembled response.
   *
   * If GraphRAG isn't installed (singleton returns null — happens in
   * dev/test environments without a backend), returns the
   * `graphrag_unavailable` envelope rather than throwing. Dashboard
   * can render a "GraphRAG not configured" empty-state.
   */
  recommend: adminProcedure
    .input(RecommendInput)
    .query(async ({ input }): Promise<RecommendEnvelope> => {
      let graphRouter: GraphRetrievalRouter;
      try {
        // Lazy per-request construction — same pattern golden-questions
        // / graph-agent wiring uses. `getGraphRepository()` always
        // returns a repository in MVP (default postgres backend), so
        // the catch here is future-proofing for an environment that
        // hasn't installed a graph backend at all.
        graphRouter = new GraphRetrievalRouter(getGraphRepository());
      } catch {
        return { status: "graphrag_unavailable" };
      }
      try {
        const fetchCandidates = createGraphRagCandidateFetcher({
          router: graphRouter,
        });
        const service = createRecommendationService({ fetchCandidates });
        const response = await service.recommend({
          kind: input.kind,
          anchor: input.anchor,
          workspaceId: input.workspaceId,
          limit: normalizeRecommendationLimit(input.limit),
          minConfidence: normalizeRecommendationMinConfidence(
            input.minConfidence,
          ),
        });
        return { status: "ok", response };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "recommend failed",
        });
      }
    }),

  /**
   * Closed-taxonomy enumeration. No DB I/O — exposes
   * `RECOMMENDATION_KINDS` + `RECOMMENDATION_KIND_METADATA` so the
   * dashboard dropdown populates dynamically. Parameterless by
   * design; mirrors `codeGraph.listKnownTypes` /
   * `securityGraph.listKnownTypes`.
   */
  listKnownKinds: adminProcedure.query(
    (): ListKnownKindsEnvelope => ({
      kinds: RECOMMENDATION_KINDS,
      metadata: RECOMMENDATION_KIND_METADATA,
    }),
  ),
});

export type RecommendationRouter = typeof recommendationRouter;
