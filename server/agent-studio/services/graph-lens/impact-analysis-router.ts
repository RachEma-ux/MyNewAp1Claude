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
 * **Stub executor surface (T-G.5.β).** `runImpactAnalysis` is wired
 * to the stub executor in `impact-analysis-executor.ts`, returning an
 * anchor-only result for every kind. The envelope carries a `mode:
 * "stub" | "template"` discriminant so the dashboard can render a
 * "Stub mode" badge per kind. When templates land in T-F.4, per-kind
 * modes flip to `"template"` without breaking the envelope shape.
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
  type ImpactAnalysisRequest,
  type ImpactAnalysisResult,
  type ImpactAnalysisResultSummary,
} from "./impact-analysis-contracts.js";
import {
  classifyImpactAnalysisExecutorMode,
  runImpactAnalysisStub,
} from "./impact-analysis-executor.js";

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

const RunImpactAnalysisInput = z.object({
  kind: z.enum(IMPACT_ANALYSIS_KINDS),
  startingNode: z.object({
    typeKey: z.string().min(1).max(120),
    id: z.string().min(1).max(512),
  }),
  maxDepth: z.number().int().min(1).max(64).optional(),
  nodeTypeKeyFilter: z
    .array(z.string().min(1).max(120))
    .max(64)
    .optional(),
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

/**
 * `runImpactAnalysis` envelope. The `mode` discriminant tells the
 * dashboard whether the result came from the stub (anchor-only) or
 * from a future template-backed executor. Today every kind is
 * `"stub"` — see `classifyImpactAnalysisExecutorMode`. When templates
 * land (T-F.4 work), per-kind modes flip to `"template"` without
 * breaking the envelope shape.
 */
export interface RunImpactAnalysisEnvelope {
  readonly result: ImpactAnalysisResult;
  readonly mode: "stub" | "template";
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

  /**
   * Stub executor surface (T-G.5.β). Delegates to
   * `runImpactAnalysisStub` — returns an anchor-only result for every
   * kind. The `mode` field on the envelope tells the dashboard
   * whether this kind has a Cypher template registered (future state)
   * or is still anchor-only (today: always `"stub"`).
   *
   * Procedure is `query` not `mutation` because the stub does no
   * side-effects. When templates land in T-F.4, this stays `query`
   * (the underlying executeTemplate path is read-only by hard rule —
   * mutations on graph state route through the change-proposal flow
   * per CLAUDE.md §Native Graph Workspace).
   */
  runImpactAnalysis: adminProcedure
    .input(RunImpactAnalysisInput)
    .query(
      ({ input }): RunImpactAnalysisEnvelope => {
        const request: ImpactAnalysisRequest = {
          kind: input.kind,
          startingNode: input.startingNode,
          ...(input.maxDepth !== undefined ? { maxDepth: input.maxDepth } : {}),
          ...(input.nodeTypeKeyFilter !== undefined
            ? { nodeTypeKeyFilter: input.nodeTypeKeyFilter }
            : {}),
        };
        return {
          result: runImpactAnalysisStub(request),
          mode: classifyImpactAnalysisExecutorMode(input.kind),
        };
      },
    ),
});

export type ImpactAnalysisRouter = typeof impactAnalysisRouter;
