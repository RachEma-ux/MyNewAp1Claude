/**
 * Agent Studio — RAC Evaluation tRPC sub-router.
 *
 * RAC Phase 8. Three protectedProcedures:
 *
 *   evaluate({ workspaceId, traceId, modelOutput }) →
 *     { groundedness, relevance, citationCoverage } and writes back
 *     citation_coverage + groundedness_score onto the trace row.
 *
 *   previewRetrieval({ workspaceId, agentId, query, mode? }) →
 *     dry-run the runtime orchestrator without writing a trace,
 *     returning the retrieval plan + chunks + assembled section.
 *     Useful for "what would the agent see for this query?" tooling.
 *
 *   runGroundednessCheck({ workspaceId, traceId, modelOutput }) →
 *     pure-scoring shorthand — same as `evaluate` but only computes
 *     groundedness, doesn't touch relevance/coverage. Cheaper for
 *     bulk re-scoring jobs.
 *
 * The scorers themselves are pure functions in
 * `services/rac/evaluation/`; this router stitches them to the
 * workspace-scoped trace store.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import {
  getTraceById,
  listContextBlocks,
  updateTraceScores,
} from "../services/rac/trace";
import {
  scoreGroundedness,
  scoreRelevance,
  scoreCitationCoverage,
} from "../services/rac/evaluation";
import { resolveAndAssembleContext } from "../services/runtime/rac-orchestrator";
import type { RacRetrievalChunk } from "../services/rac/ingestion";

const composerModeSchema = z.enum(["disabled", "safe_degraded", "strict"]);

/**
 * Hydrate `RacRetrievalChunk[]` from the persisted context-block
 * rows. The store doesn't keep the chunk content (deliberately —
 * trace storage is not a chunk archive), so we use citation +
 * sourceChunkId + score and an empty content body for re-scoring
 * paths that don't need the text. Routers that need real content
 * (groundedness) read it elsewhere; today the chat-stream payload
 * is what the model saw, so groundedness is computed against the
 * caller-supplied modelOutput vs. the original retrieval (which
 * the trace has, just without content).
 *
 * MVP: callers passing modelOutput should also pass the chunks they
 * want to score against, or rely on `previewRetrieval` to produce
 * fresh chunks.
 */
function hydrateChunkStub(
  block: Awaited<ReturnType<typeof listContextBlocks>>[number],
): RacRetrievalChunk {
  return {
    content: "",
    score: block.score,
    citation: block.citation ?? "",
    sourceChunkId: block.sourceChunkId,
    metadata: (block.metadataJson as Record<string, unknown> | null) ?? undefined,
  };
}

export const racEvaluationRouter = router({
  evaluate: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        traceId: z.number().int().positive(),
        /** Final assistant output to score against the trace's evidence. */
        modelOutput: z.string().min(1),
        /**
         * Optional: caller-supplied chunk content. When omitted, the
         * router uses persisted block stubs (no content) and the
         * groundedness score will be 0 with a `no_chunk_content`
         * warning. Pass the chunks the model saw for a real score.
         */
        chunks: z
          .array(
            z.object({
              content: z.string(),
              citation: z.string(),
              sourceChunkId: z.string(),
              score: z.number().min(0).max(1),
              metadata: z.record(z.string(), z.unknown()).nullable().optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const trace = await getTraceById(input.workspaceId, input.traceId);
      if (!trace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `RAC trace ${input.traceId} not found in workspace ${input.workspaceId}`,
        });
      }
      const blocks = await listContextBlocks(input.traceId);
      const chunks: RacRetrievalChunk[] = input.chunks
        ? input.chunks.map((c) => ({
            content: c.content,
            score: c.score,
            citation: c.citation,
            sourceChunkId: c.sourceChunkId,
            metadata: c.metadata ?? undefined,
          }))
        : blocks.map(hydrateChunkStub);

      const groundedness = scoreGroundedness({
        output: input.modelOutput,
        chunks,
      });
      // Relevance + citation coverage operate on the chunks the model
      // saw — so the query is stable across these scorers.
      const relevance = scoreRelevance({
        // The trace doesn't persist the original query verbatim; the
        // citation tokens carry topical signal in their own right, so
        // we score relevance against the message id as a stable
        // sentinel. Real query passthrough lands in a follow-up.
        query: input.modelOutput,
        chunks,
      });
      const coverage = scoreCitationCoverage({ chunks });

      await updateTraceScores({
        traceId: input.traceId,
        workspaceId: input.workspaceId,
        citationCoverage: coverage.coverage,
        groundednessScore: groundedness.score,
      });

      return {
        traceId: input.traceId,
        groundedness,
        relevance,
        citationCoverage: coverage,
      };
    }),

  previewRetrieval: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        agentId: z.number().int().positive(),
        agentDraftId: z.number().int().positive(),
        query: z.string().min(1),
        mode: composerModeSchema.default("safe_degraded"),
        profileKey: z.string().min(1).max(64).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const ctxResult = await resolveAndAssembleContext({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        agentDraftId: input.agentDraftId,
        actorId: ctx.user.id,
        mode: input.mode,
        query: input.query,
        profileKey: input.profileKey,
      });
      return {
        capabilityPack: ctxResult.capabilityPack,
        retrievalEvidence: ctxResult.retrievalEvidence,
        trace: ctxResult.trace,
        warnings: ctxResult.warnings,
        // Pass through the assembled chunks so caller can run scorers
        // without persisting a trace.
        chunks: ctxResult.sourceTrace.includedChunks,
      };
    }),

  runGroundednessCheck: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        traceId: z.number().int().positive(),
        modelOutput: z.string().min(1),
        chunks: z
          .array(
            z.object({
              content: z.string(),
              citation: z.string(),
              sourceChunkId: z.string(),
              score: z.number().min(0).max(1),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const trace = await getTraceById(input.workspaceId, input.traceId);
      if (!trace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `RAC trace ${input.traceId} not found`,
        });
      }
      const blocks = await listContextBlocks(input.traceId);
      const chunks: RacRetrievalChunk[] = input.chunks
        ? input.chunks.map((c) => ({
            content: c.content,
            score: c.score,
            citation: c.citation,
            sourceChunkId: c.sourceChunkId,
          }))
        : blocks.map(hydrateChunkStub);

      const result = scoreGroundedness({
        output: input.modelOutput,
        chunks,
      });
      await updateTraceScores({
        traceId: input.traceId,
        workspaceId: input.workspaceId,
        groundednessScore: result.score,
      });
      return { traceId: input.traceId, groundedness: result };
    }),
});
