/**
 * Impact Analysis — tRPC router (T-G.5.α).
 *
 * Operator-facing read-only surface for the Impact Analysis Lens.
 * Contracts (T-F.3) + summary helper (T-F.10) are already shipped;
 * this PR mounts a thin router so the dashboard can:
 *
 *   - Enumerate the 7 closed-taxonomy impact kinds (`listKnownKinds`)
 *     for dropdown population — same parameterless-enumeration
 *     pattern as `codeGraph.listKnownTypes` /
 *     `securityGraph.listKnownTypes` /
 *     `recommendation.listKnownKinds`.
 *   - Run the `summarizeImpactAnalysisResult` aggregator against a
 *     client-supplied `ImpactAnalysisResult` (`summarizeResult`).
 *     Useful for clients that already have a result in hand (e.g.,
 *     cached) and want the deterministic summary shape without
 *     re-implementing the aggregator in JS.
 *
 * **Deferred — actual traversal executor.**
 * T-F.4 / T-F.5 promise to wire each `ImpactAnalysisKind` to a
 * parameterized Cypher template in `ags_query_templates`. That work
 * needs careful Cypher review + cross-graph composition logic; it's
 * NOT shipped here. A future slice (T-G.5.β?) can add the
 * `runImpactAnalysis` mutation/query that executes the template.
 * This router stays read-only + pure for now.
 *
 * Mounted at `agentStudio.impactAnalysis.*`. Both procedures are
 * `adminProcedure` and read-only.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No DB I/O — both procedures are pure computation on
 *     compile-time constants + caller-supplied input.
 */

import { z } from "zod";

import { adminProcedure, router } from "../../../_core/trpc.js";
import {
  IMPACT_ANALYSIS_KIND_METADATA,
  IMPACT_ANALYSIS_KINDS,
  summarizeImpactAnalysisResult,
  type ImpactAnalysisKind,
  type ImpactAnalysisKindMetadata,
  type ImpactAnalysisResult,
  type ImpactAnalysisResultSummary,
} from "./impact-analysis-contracts.js";

// ============================================================================
// Input schemas
// ============================================================================

const ImpactAnalysisNodeInput = z.object({
  typeKey: z.string().min(1).max(120),
  id: z.string().min(1).max(512),
  depth: z.number().int().min(0).max(64),
  visible: z.boolean(),
  label: z.string().max(2048).optional(),
});

const ImpactAnalysisEdgeInput = z.object({
  typeKey: z.string().min(1).max(120),
  sourceNodeId: z.string().min(1).max(512),
  targetNodeId: z.string().min(1).max(512),
  visible: z.boolean(),
});

const SummarizeResultInput = z.object({
  kind: z.enum(IMPACT_ANALYSIS_KINDS),
  startingNodeId: z.string().min(1).max(512),
  nodes: z.array(ImpactAnalysisNodeInput).max(10_000),
  edges: z.array(ImpactAnalysisEdgeInput).max(50_000),
  truncated: z.boolean(),
  hiddenNodeCount: z.number().int().min(0),
});

// ============================================================================
// Output envelopes
// ============================================================================

export interface ListImpactAnalysisKindsEnvelope {
  readonly kinds: ReadonlyArray<ImpactAnalysisKind>;
  readonly metadata: Readonly<
    Record<ImpactAnalysisKind, ImpactAnalysisKindMetadata>
  >;
}

export interface SummarizeImpactAnalysisResultEnvelope {
  readonly summary: ImpactAnalysisResultSummary;
}

// ============================================================================
// Router
// ============================================================================

export const impactAnalysisRouter = router({
  /**
   * Closed-taxonomy enumeration. Parameterless. Mirrors
   * `codeGraph.listKnownTypes` / `securityGraph.listKnownTypes` /
   * `recommendation.listKnownKinds`.
   */
  listKnownKinds: adminProcedure.query(
    (): ListImpactAnalysisKindsEnvelope => ({
      kinds: IMPACT_ANALYSIS_KINDS,
      metadata: IMPACT_ANALYSIS_KIND_METADATA,
    }),
  ),

  /**
   * Pure aggregator. Takes a fully-constructed
   * `ImpactAnalysisResult` (typically a client-cached result from a
   * prior traversal) and returns the deterministic summary shape.
   * Lets the dashboard avoid re-implementing the aggregator client-
   * side.
   *
   * The procedure is `query` not `mutation` because it does no
   * side-effects — it's a pure transformation. The input caps
   * (10k nodes, 50k edges) prevent the dashboard from posting an
   * unbounded payload.
   */
  summarizeResult: adminProcedure
    .input(SummarizeResultInput)
    .query(
      ({ input }): SummarizeImpactAnalysisResultEnvelope => {
        // Strip undefined label by re-projecting through the
        // ImpactAnalysisResult shape — zod's `.optional()` allows
        // missing `label`, the contract requires `label?` semantics.
        const result: ImpactAnalysisResult = {
          kind: input.kind,
          startingNodeId: input.startingNodeId,
          nodes: input.nodes,
          edges: input.edges,
          truncated: input.truncated,
          hiddenNodeCount: input.hiddenNodeCount,
        };
        return { summary: summarizeImpactAnalysisResult(result) };
      },
    ),
});

export type ImpactAnalysisRouter = typeof impactAnalysisRouter;
