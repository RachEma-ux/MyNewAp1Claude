/**
 * Graph change proposals — tRPC router.
 *
 * Phase 11.5. Mounts the lifecycle into the Agent Studio tRPC tree.
 *
 * The `GraphChangeProposalAdapter` is supplied by the wiring layer
 * (boot.ts after `seedAsDb()`); MVP exposes the router signatures with
 * an explicit `PRECONDITION_FAILED` until the Drizzle-backed adapter is
 * injected, mirroring the Phase 11 promotion router shape.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../_core/trpc.js";
import {
  GraphChangeProposalLifecycle,
  type GraphChangeProposalAdapter,
  type GraphChangeProposalRequest,
} from "./lifecycle.js";
import { captureUnexpectedTrpcError } from "../workspace-observability/public-api.js";

/**
 * Fire-and-forget observability capture before throwing the TRPCError.
 * Same pattern as graph-quality (#490), graph-correction (#491),
 * workspace-observability self-instrument (#492). The classifier
 * inside `captureUnexpectedTrpcError` skips expected operator-side
 * codes; only INTERNAL_SERVER_ERROR + raw Errors persist.
 */
function throwTrpcAndCapture(trpcErr: TRPCError): never {
  void captureUnexpectedTrpcError("graphChangeProposals.router", trpcErr);
  throw trpcErr;
}

let cachedLifecycle: GraphChangeProposalLifecycle | null = null;

export function _setGraphChangeProposalAdapter(
  adapter: GraphChangeProposalAdapter,
): void {
  cachedLifecycle = new GraphChangeProposalLifecycle(adapter);
}

function lifecycle(): GraphChangeProposalLifecycle {
  if (!cachedLifecycle) {
    throwTrpcAndCapture(new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Graph change proposal adapter not yet wired. Operator must inject the Drizzle-backed GraphChangeProposalAdapter at boot.",
    }));
  }
  return cachedLifecycle;
}

const ProposalKindEnum = z.enum([
  "create_node",
  "update_node",
  "deprecate_node",
  "create_edge",
  "update_edge",
  "remove_edge",
  "entity_merge",
  "entity_split",
  "observation_correction",
  "provenance_correction",
  "projection_correction",
]);

const ProposalItemSchema = z.object({
  itemKind: z.string().min(1).max(100),
  itemPayload: z.record(z.string(), z.unknown()),
  sourceEvidence: z.record(z.string(), z.unknown()).optional(),
});

export const graphChangeProposalsRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        proposalKind: ProposalKindEnum,
        summary: z.string().max(2000).optional(),
        confidence: z.enum(["low", "medium", "high"]).optional(),
        proposedByAgentId: z.number().int().optional(),
        items: z.array(ProposalItemSchema).min(1).max(50),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "Submitting a graph change proposal requires authentication",
        }));
      }
      const request: GraphChangeProposalRequest = {
        proposalKind: input.proposalKind,
        proposedByUserId: userId,
        proposedByAgentId: input.proposedByAgentId,
        summary: input.summary,
        confidence: input.confidence,
        items: input.items,
      };
      return await lifecycle().submit(request);
    }),

  approve: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int(),
        rationale: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "Approval requires authentication",
        }));
      }
      return await lifecycle().approve(
        input.proposalId,
        userId,
        input.rationale,
      );
    }),

  reject: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int(),
        rationale: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "Rejection requires authentication",
        }));
      }
      return await lifecycle().reject(
        input.proposalId,
        userId,
        input.rationale,
      );
    }),

  withdraw: protectedProcedure
    .input(z.object({ proposalId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const userId = (ctx as unknown as { user?: { id?: number } }).user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "Withdrawing a proposal requires authentication",
        }));
      }
      return await lifecycle().withdraw(input.proposalId, userId);
    }),
});

export type GraphChangeProposalsRouter = typeof graphChangeProposalsRouter;
