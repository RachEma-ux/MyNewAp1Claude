/**
 * Graph Quality — tRPC Router.
 *
 * Phase 23 §1. Mounts the scan / agent-run / finding-conversion +
 * read surface under `agentStudio.graphQuality.*`. Operator UI calls
 * this router; the autonomous quality agent loop calls
 * `runQualityAgent` directly via the service barrel.
 *
 * Scope of THIS router:
 *   - runScan: dispatch a single scanner kind.
 *   - runAgent: wrap a batch of scanner kinds in an agent run row.
 *   - listScans / getScan: read recent quality scan rows.
 *   - listFindings / getFinding: read finding rows for triage.
 *   - convertFindingToProposal: bridge to graph-correction proposals.
 *   - listAgentRuns: read recent agent run rows.
 *
 * Errors are translated to TRPC codes:
 *   - UnknownScanKindError → BAD_REQUEST
 *   - FindingNotFoundError → NOT_FOUND
 *   - FindingAlreadyConvertedError → CONFLICT
 *   - AsdbUnavailableError → SERVICE_UNAVAILABLE
 *   - default → INTERNAL_SERVER_ERROR
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../../../_core/trpc.js";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphQualityScans,
  agsGraphQualityFindings,
  agsGraphQualityAgentRuns,
} from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import { getGraphRepository } from "../graph/repository/index.js";
import {
  runQualityScan,
  UnknownScanKindError,
} from "./scan-orchestrator.js";
import {
  convertFindingToProposal,
  FindingNotFoundError,
  FindingAlreadyConvertedError,
  AsdbUnavailableError as FindingConversionAsdbUnavailable,
} from "./finding-to-proposal.js";
import {
  runQualityAgent,
  AsdbUnavailableError as QualityAgentAsdbUnavailable,
} from "./agent-run.js";
import {
  applyApprovedProposal,
  AsdbUnavailableError as MutationWorkerAsdbUnavailable,
  ProposalNotFoundError,
  ProposalNotApprovedError,
  ProposalAlreadyAppliedError,
  InvalidProposalPayloadError,
} from "./mutation-worker.js";
import { QUALITY_SCANNER_REGISTRY } from "./public-api.js";

const ScanStatusEnum = z.enum(["pending", "running", "completed", "failed"]);
const AgentRunStatusEnum = z.enum(["running", "completed", "failed"]);
const SeverityEnum = z.enum(["low", "medium", "high", "critical"]);

function unwrapError(e: unknown): never {
  if (e instanceof UnknownScanKindError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
  }
  if (e instanceof FindingNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: e.message });
  }
  if (e instanceof FindingAlreadyConvertedError) {
    throw new TRPCError({ code: "CONFLICT", message: e.message });
  }
  if (
    e instanceof FindingConversionAsdbUnavailable ||
    e instanceof QualityAgentAsdbUnavailable ||
    e instanceof MutationWorkerAsdbUnavailable
  ) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: e.message,
    });
  }
  if (e instanceof ProposalNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: e.message });
  }
  if (e instanceof ProposalNotApprovedError) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message });
  }
  if (e instanceof ProposalAlreadyAppliedError) {
    throw new TRPCError({ code: "CONFLICT", message: e.message });
  }
  if (e instanceof InvalidProposalPayloadError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: e instanceof Error ? e.message : String(e),
  });
}

export const graphQualityRouter = router({
  // ----- mutations -----

  runScan: protectedProcedure
    .input(
      z.object({
        scanKind: z.string().min(1).max(100),
        scope: z.string().min(1).max(100).optional(),
        sampleSize: z.number().int().min(1).max(50_000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await runQualityScan(input, {
          registry: QUALITY_SCANNER_REGISTRY,
          repository: getGraphRepository(),
        });
      } catch (e) {
        unwrapError(e);
      }
    }),

  runAgent: protectedProcedure
    .input(
      z.object({
        scanKinds: z.array(z.string().min(1).max(100)).max(50).optional(),
        scope: z.string().min(1).max(100).optional(),
        sampleSize: z.number().int().min(1).max(50_000).optional(),
        autoConvertFindings: z.boolean().optional(),
        agentKey: z.string().min(1).max(100).optional(),
        proposedByAgentId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await runQualityAgent(input, {
          registry: QUALITY_SCANNER_REGISTRY,
          repository: getGraphRepository(),
        });
      } catch (e) {
        unwrapError(e);
      }
    }),

  convertFindingToProposal: protectedProcedure
    .input(
      z.object({
        findingId: z.number().int().positive(),
        rationale: z.string().max(2000).optional(),
        proposedByAgentId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      try {
        return await convertFindingToProposal({
          findingId: input.findingId,
          rationale: input.rationale,
          proposedByUserId: userId,
          proposedByAgentId: input.proposedByAgentId,
        });
      } catch (e) {
        unwrapError(e);
      }
    }),

  applyApprovedProposal: protectedProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await applyApprovedProposal({ proposalId: input.proposalId });
      } catch (e) {
        unwrapError(e);
      }
    }),

  // ----- queries -----

  listScans: protectedProcedure
    .input(
      z
        .object({
          status: ScanStatusEnum.optional(),
          scanKind: z.string().min(1).max(100).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getAsDb();
      if (!db) return [];
      const filters = [] as ReturnType<typeof eq>[];
      if (input?.status) {
        filters.push(eq(agsGraphQualityScans.status, input.status));
      }
      if (input?.scanKind) {
        filters.push(eq(agsGraphQualityScans.scanKind, input.scanKind));
      }
      const rows = await db
        .select()
        .from(agsGraphQualityScans)
        .where(
          filters.length === 0
            ? undefined
            : filters.length === 1
              ? filters[0]
              : and(...filters),
        )
        .orderBy(desc(agsGraphQualityScans.createdAt))
        .limit(input?.limit ?? 100);
      return rows;
    }),

  getScan: protectedProcedure
    .input(z.object({ scanId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getAsDb();
      if (!db) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Scan ${input.scanId} not found (ASDB unavailable)`,
        });
      }
      const rows = await db
        .select()
        .from(agsGraphQualityScans)
        .where(eq(agsGraphQualityScans.id, input.scanId))
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Scan ${input.scanId} not found`,
        });
      }
      return rows[0];
    }),

  listFindings: protectedProcedure
    .input(
      z
        .object({
          scanId: z.number().int().positive().optional(),
          findingClass: z.string().min(1).max(100).optional(),
          severity: SeverityEnum.optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getAsDb();
      if (!db) return [];
      const filters = [] as ReturnType<typeof eq>[];
      if (input?.scanId) {
        filters.push(eq(agsGraphQualityFindings.scanId, input.scanId));
      }
      if (input?.findingClass) {
        filters.push(
          eq(agsGraphQualityFindings.findingClass, input.findingClass),
        );
      }
      if (input?.severity) {
        filters.push(eq(agsGraphQualityFindings.severity, input.severity));
      }
      const rows = await db
        .select()
        .from(agsGraphQualityFindings)
        .where(
          filters.length === 0
            ? undefined
            : filters.length === 1
              ? filters[0]
              : and(...filters),
        )
        .orderBy(desc(agsGraphQualityFindings.createdAt))
        .limit(input?.limit ?? 100);
      return rows;
    }),

  getFinding: protectedProcedure
    .input(z.object({ findingId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getAsDb();
      if (!db) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Finding ${input.findingId} not found (ASDB unavailable)`,
        });
      }
      const rows = await db
        .select()
        .from(agsGraphQualityFindings)
        .where(eq(agsGraphQualityFindings.id, input.findingId))
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Finding ${input.findingId} not found`,
        });
      }
      return rows[0];
    }),

  listAgentRuns: protectedProcedure
    .input(
      z
        .object({
          status: AgentRunStatusEnum.optional(),
          agentKey: z.string().min(1).max(100).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getAsDb();
      if (!db) return [];
      const filters = [] as ReturnType<typeof eq>[];
      if (input?.status) {
        filters.push(eq(agsGraphQualityAgentRuns.status, input.status));
      }
      if (input?.agentKey) {
        filters.push(eq(agsGraphQualityAgentRuns.agentKey, input.agentKey));
      }
      const rows = await db
        .select()
        .from(agsGraphQualityAgentRuns)
        .where(
          filters.length === 0
            ? undefined
            : filters.length === 1
              ? filters[0]
              : and(...filters),
        )
        .orderBy(desc(agsGraphQualityAgentRuns.createdAt))
        .limit(input?.limit ?? 100);
      return rows;
    }),

  listRegisteredScanKinds: protectedProcedure.query(() => {
    return QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
  }),
});

export type GraphQualityRouter = typeof graphQualityRouter;
