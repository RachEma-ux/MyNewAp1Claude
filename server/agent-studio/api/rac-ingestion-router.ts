/**
 * Agent Studio — RAC Ingestion tRPC sub-router.
 *
 * RAC Phase 3. Surfaces the adapter contract to the frontend / curl
 * smoke tests:
 *
 *   - `ingestPreview({ workspaceId, sourceId, sampleSize? })` →
 *     adapter-rendered sample chunks (gap-shaped today for
 *     graph_index / vector_index until concrete backends land).
 *   - `registerIndexedSource({ workspaceId, sourceId })` → resolves
 *     the embedding binding (D-EMB-4 fallback to workspace default;
 *     D-EMB-5 fail-closed) and stamps `embedding_model_pinned_at` on
 *     the source row when it had no row-level ref.
 *   - `validateIndex({ workspaceId, sourceId })` → adapter health +
 *     index-validation pair, surfacing structured `source_unavailable`
 *     reasons.
 *
 * All `protectedProcedure`. Read-only; the writes are limited to
 * stamping `embedding_model_pinned_at`. Embedding HTTP calls go
 * through `withEmbeddingCredential` once concrete adapters land —
 * today's stubs return empty results without touching credentials.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import {
  getSource,
  updateSource,
  getWorkspaceEmbeddingDefault,
} from "../services/rac/sources";
import {
  pickAdapter,
  resolveEmbeddingBinding,
  EmbeddingProviderUnavailableError,
  type RacIndexValidationResult,
} from "../services/rac/ingestion";

const sourceRefSchema = z.object({
  workspaceId: z.number().int().positive(),
  sourceId: z.number().int().positive(),
});

async function loadSourceOr404(workspaceId: number, sourceId: number) {
  const source = await getSource(sourceId);
  if (!source) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `RAC source ${sourceId} not found`,
    });
  }
  if (source.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `RAC source ${sourceId} belongs to a different workspace`,
    });
  }
  return source;
}

export const racIngestionRouter = router({
  ingestPreview: protectedProcedure
    .input(
      sourceRefSchema.extend({
        sampleSize: z.number().int().positive().max(50).default(5),
      }),
    )
    .query(async ({ input }) => {
      const source = await loadSourceOr404(input.workspaceId, input.sourceId);
      const adapter = pickAdapter(source.sourceType);
      if (!adapter || !adapter.preview) {
        return {
          sourceType: source.sourceType,
          sampleChunks: [],
          warnings: [
            `no_preview_available: source_type=${source.sourceType} has no preview-capable adapter (in-process types do not run through the ingestion contract)`,
          ],
        };
      }
      const out = await adapter.preview({
        workspaceId: input.workspaceId,
        sourceId: input.sourceId,
        sampleSize: input.sampleSize,
      });
      return {
        sourceType: source.sourceType,
        sampleChunks: out.sampleChunks,
        warnings: out.warnings,
      };
    }),

  registerIndexedSource: protectedProcedure
    .input(sourceRefSchema)
    .mutation(async ({ input }) => {
      const source = await loadSourceOr404(input.workspaceId, input.sourceId);
      const wsDefault = await getWorkspaceEmbeddingDefault(input.workspaceId);

      // D-EMB-5: this throws when neither source-level nor workspace-default
      // embedding refs are available. Surface as BAD_REQUEST so the UI
      // can prompt the operator to register a workspace default first.
      let binding;
      try {
        binding = resolveEmbeddingBinding(source, wsDefault);
      } catch (err) {
        if (err instanceof EmbeddingProviderUnavailableError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message,
            cause: { code: err.code },
          });
        }
        throw err;
      }

      // If the source row was missing its embedding ref, copy the workspace
      // default onto it and stamp `embedding_model_pinned_at`. This pins
      // the dim at register-time (D-EMB-3) so a later workspace-default
      // change doesn't silently re-embed.
      if (binding.resolvedFrom === "workspace_default") {
        await updateSource({
          sourceId: input.sourceId,
          embeddingProviderConnectionId: binding.providerConnectionId,
          embeddingModelRef: binding.modelRef,
          embeddingModelDim: binding.dim,
        });
      }

      return {
        sourceId: input.sourceId,
        embeddingProviderConnectionId: binding.providerConnectionId,
        embeddingModelRef: binding.modelRef,
        embeddingModelDim: binding.dim,
        resolvedFrom: binding.resolvedFrom,
      };
    }),

  validateIndex: protectedProcedure
    .input(sourceRefSchema)
    .query(async ({ input }) => {
      const source = await loadSourceOr404(input.workspaceId, input.sourceId);
      const adapter = pickAdapter(source.sourceType);
      if (!adapter) {
        return {
          ok: true as const,
          reason: "in_process_source_type",
          health: { status: "ok" as const },
          details: {
            sourceType: source.sourceType,
            note: "in-process source types skip the ingestion adapter contract",
          },
        };
      }
      const [health, validation] = await Promise.all([
        adapter.health(),
        adapter.validateIndex
          ? adapter.validateIndex({
              workspaceId: input.workspaceId,
              sourceId: input.sourceId,
            })
          : Promise.resolve<RacIndexValidationResult>({ ok: true }),
      ]);
      return {
        ok: validation.ok,
        reason: validation.reason,
        health,
        details: validation.details,
      };
    }),
});
