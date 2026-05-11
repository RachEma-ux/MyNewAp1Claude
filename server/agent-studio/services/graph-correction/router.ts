/**
 * Graph Correction — tRPC Router.
 *
 * Phase 23. Mounts the proposal submit / approve / reject / list /
 * audit surface under `agentStudio.graphCorrection.*`.
 *
 * The actual application of an approved correction (Postgres
 * mutation + Neo4j re-projection) is OUT OF SCOPE for this router;
 * the approval flips the proposal status + records the decision +
 * writes an audit event. The downstream mutation worker reads the
 * approved rows and applies the change in a follow-on phase
 * (Phase 7.5 Neo4j live wiring + Phase 11.5 graph change proposal
 * adapter).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../_core/trpc.js";
import {
  submitCorrectionProposal,
  getProposalById,
  listProposals,
  approveCorrectionProposal,
  rejectCorrectionProposal,
  requestRevisionForProposal,
  listAuditEvents,
  CorrectionProposalNotFoundError,
  ProposalAlreadyDecidedError,
} from "./lifecycle.js";
import { captureUnexpectedTrpcError } from "../workspace-observability/public-api.js";

/**
 * Fire-and-forget observability capture before throwing the TRPCError.
 * The classifier inside `captureUnexpectedTrpcError` filters out
 * expected operator-side codes (BAD_REQUEST / NOT_FOUND / etc.) and
 * only persists INTERNAL_SERVER_ERROR + raw Errors. Same pattern as
 * the graph-quality router (PR #490).
 */
function throwTrpcAndCapture(trpcErr: TRPCError): never {
  void captureUnexpectedTrpcError("graphCorrection.router", trpcErr);
  throw trpcErr;
}

const ProposalStatusEnum = z.enum([
  "pending",
  "approved",
  "rejected",
  "revision_requested",
  "withdrawn",
]);

export const graphCorrectionRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        proposalKind: z.string().min(1).max(100),
        targetTypeKey: z.string().min(1).max(100).optional(),
        targetId: z.number().int().positive().optional(),
        proposedChange: z.record(z.string(), z.unknown()),
        confidence: z.number().min(0).max(1).optional(),
        rationale: z.string().max(2000).optional(),
        proposedByAgentId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      try {
        return await submitCorrectionProposal({
          proposalKind: input.proposalKind,
          targetTypeKey: input.targetTypeKey,
          targetId: input.targetId,
          proposedChange: input.proposedChange,
          confidence: input.confidence,
          rationale: input.rationale,
          proposedByUserId: userId,
          proposedByAgentId: input.proposedByAgentId,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          status: ProposalStatusEnum.optional(),
          proposalKind: z.string().min(1).max(100).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      try {
        return await listProposals(input ?? {});
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  get: protectedProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const proposal = await getProposalById(input.proposalId);
      if (!proposal) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Graph correction proposal ${input.proposalId} not found`,
        }));
      }
      return proposal;
    }),

  approve: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        rationale: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "approve requires an authenticated user",
        }));
      }
      try {
        return await approveCorrectionProposal(
          input.proposalId,
          userId,
          input.rationale ?? null,
        );
      } catch (e) {
        if (e instanceof CorrectionProposalNotFoundError) {
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: e.message }));
        }
        if (e instanceof ProposalAlreadyDecidedError) {
          throwTrpcAndCapture(new TRPCError({ code: "CONFLICT", message: e.message }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  reject: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        rationale: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "reject requires an authenticated user",
        }));
      }
      try {
        return await rejectCorrectionProposal(
          input.proposalId,
          userId,
          input.rationale ?? null,
        );
      } catch (e) {
        if (e instanceof CorrectionProposalNotFoundError) {
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: e.message }));
        }
        if (e instanceof ProposalAlreadyDecidedError) {
          throwTrpcAndCapture(new TRPCError({ code: "CONFLICT", message: e.message }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  requestRevision: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        rationale: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "requestRevision requires an authenticated user",
        }));
      }
      try {
        return await requestRevisionForProposal(
          input.proposalId,
          userId,
          input.rationale ?? null,
        );
      } catch (e) {
        if (e instanceof CorrectionProposalNotFoundError) {
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: e.message }));
        }
        if (e instanceof ProposalAlreadyDecidedError) {
          throwTrpcAndCapture(new TRPCError({ code: "CONFLICT", message: e.message }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  listAudit: protectedProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await listAuditEvents(input.proposalId);
    }),
});

export type GraphCorrectionRouter = typeof graphCorrectionRouter;
