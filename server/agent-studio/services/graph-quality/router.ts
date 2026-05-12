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
 *   - convertFindingToProposal: bridge to graph-correction proposals.
 *   - applyApprovedProposal: dispatch the mutation worker on an
 *     already-approved proposal.
 *   - approveAndApply: operator convenience combo (approve + apply).
 *   - listScans / getScan: read recent quality scan rows.
 *   - listFindings / getFinding: read finding rows for triage.
 *   - listAgentRuns: read recent agent run rows.
 *   - listRegisteredScanKinds: enumerate scanners for the UI picker.
 *
 * Errors are translated to TRPC codes:
 *   - UnknownScanKindError → BAD_REQUEST
 *   - InvalidProposalPayloadError → BAD_REQUEST
 *   - FindingNotFoundError → NOT_FOUND
 *   - ProposalNotFoundError → NOT_FOUND
 *   - CorrectionProposalNotFoundError → NOT_FOUND
 *   - ProposalNotApprovedError → PRECONDITION_FAILED
 *   - FindingAlreadyConvertedError → CONFLICT
 *   - ProposalAlreadyAppliedError → CONFLICT
 *   - ProposalAlreadyDecidedError → CONFLICT
 *   - AsdbUnavailableError → INTERNAL_SERVER_ERROR
 *   - default → INTERNAL_SERVER_ERROR
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, isNotNull, inArray } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure } from "../../../_core/trpc.js";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphQualityScans,
  agsGraphQualityFindings,
  agsGraphQualityAgentRuns,
  agsGraphCorrectionProposals,
  agsGraphCorrectionAuditEvents,
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
import { approveAndApplyProposal } from "./approve-and-apply.js";
import { getFindingAuditTrail } from "./finding-audit-trail.js";
import {
  dismissFinding,
  bulkDismissFindings,
  AsdbUnavailableError as DismissFindingAsdbUnavailable,
  FindingNotFoundError as DismissFindingNotFound,
  FindingAlreadyResolvedError,
} from "./dismiss-finding.js";
import { getGraphQualityStats } from "./stats.js";
import {
  CorrectionProposalNotFoundError,
  ProposalAlreadyDecidedError,
} from "../graph-correction/public-api.js";
import { captureUnexpectedTrpcError } from "../workspace-observability/public-api.js";
import { getOperatorDashboard } from "./operator-dashboard.js";
import { QUALITY_SCANNER_REGISTRY } from "./public-api.js";

const ScanStatusEnum = z.enum(["pending", "running", "completed", "failed"]);
const AgentRunStatusEnum = z.enum(["running", "completed", "failed"]);
const SeverityEnum = z.enum(["low", "medium", "high", "critical"]);
const FindingStatusEnum = z.enum(["open", "triaged", "applied", "dismissed"]);

function buildTrpcError(e: unknown): TRPCError {
  if (e instanceof UnknownScanKindError) {
    return new TRPCError({ code: "BAD_REQUEST", message: e.message });
  }
  if (e instanceof InvalidProposalPayloadError) {
    return new TRPCError({ code: "BAD_REQUEST", message: e.message });
  }
  if (e instanceof FindingNotFoundError || e instanceof DismissFindingNotFound) {
    return new TRPCError({ code: "NOT_FOUND", message: e.message });
  }
  if (e instanceof FindingAlreadyResolvedError) {
    return new TRPCError({ code: "CONFLICT", message: e.message });
  }
  if (e instanceof DismissFindingAsdbUnavailable) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: e.message,
    });
  }
  if (
    e instanceof ProposalNotFoundError ||
    e instanceof CorrectionProposalNotFoundError
  ) {
    return new TRPCError({ code: "NOT_FOUND", message: e.message });
  }
  if (e instanceof ProposalNotApprovedError) {
    return new TRPCError({ code: "PRECONDITION_FAILED", message: e.message });
  }
  if (e instanceof FindingAlreadyConvertedError) {
    return new TRPCError({ code: "CONFLICT", message: e.message });
  }
  if (e instanceof ProposalAlreadyAppliedError) {
    return new TRPCError({ code: "CONFLICT", message: e.message });
  }
  if (e instanceof ProposalAlreadyDecidedError) {
    return new TRPCError({ code: "CONFLICT", message: e.message });
  }
  if (
    e instanceof FindingConversionAsdbUnavailable ||
    e instanceof QualityAgentAsdbUnavailable ||
    e instanceof MutationWorkerAsdbUnavailable
  ) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: e.message,
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: e instanceof Error ? e.message : String(e),
  });
}

function unwrapError(e: unknown): never {
  const trpcErr = buildTrpcError(e);
  // Fire-and-forget observability capture. The classifier inside
  // `captureUnexpectedTrpcError` skips expected operator-side codes
  // (BAD_REQUEST / NOT_FOUND / CONFLICT / PRECONDITION_FAILED / ...)
  // and only persists INTERNAL_SERVER_ERROR + raw Error instances.
  // Awaiting would slow the error path and offer no value — if the
  // recorder fails it's already fail-soft inside the helper.
  void captureUnexpectedTrpcError("graphQuality.router", trpcErr);
  throw trpcErr;
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
        notifyMe: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      try {
        return await runQualityAgent(
          {
            ...input,
            notifyUserId: input.notifyMe && userId != null ? userId : undefined,
          },
          {
            registry: QUALITY_SCANNER_REGISTRY,
            repository: getGraphRepository(),
          },
        );
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
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        notifyMe: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      try {
        return await applyApprovedProposal({
          proposalId: input.proposalId,
          notifyUserId: input.notifyMe && userId != null ? userId : undefined,
        });
      } catch (e) {
        unwrapError(e);
      }
    }),

  dismissFinding: protectedProcedure
    .input(
      z.object({
        findingId: z.number().int().positive(),
        reason: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      try {
        return await dismissFinding({
          findingId: input.findingId,
          reason: input.reason,
          dismissedByUserId: userId,
        });
      } catch (e) {
        unwrapError(e);
      }
    }),

  bulkDismissFindings: protectedProcedure
    .input(
      z.object({
        findingIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(500),
        reason: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      try {
        return await bulkDismissFindings({
          findingIds: input.findingIds,
          reason: input.reason,
          dismissedByUserId: userId,
        });
      } catch (e) {
        unwrapError(e);
      }
    }),

  approveAndApply: protectedProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        rationale: z.string().max(2000).optional(),
        notifyMe: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "approveAndApply requires an authenticated user",
        });
      }
      try {
        return await approveAndApplyProposal({
          proposalId: input.proposalId,
          decidedByUserId: userId,
          rationale: input.rationale,
          notifyUserId: input.notifyMe ? userId : undefined,
        });
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
          status: FindingStatusEnum.optional(),
          proposalId: z.number().int().positive().optional(),
          untriagedOnly: z.boolean().optional(),
          triagedOnly: z.boolean().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getAsDb();
      if (!db) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filters = [] as any[];
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
      if (input?.status) {
        filters.push(eq(agsGraphQualityFindings.status, input.status));
      }
      if (input?.proposalId) {
        filters.push(eq(agsGraphQualityFindings.proposalId, input.proposalId));
      } else if (input?.untriagedOnly) {
        filters.push(isNull(agsGraphQualityFindings.proposalId));
      } else if (input?.triagedOnly) {
        filters.push(isNotNull(agsGraphQualityFindings.proposalId));
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

  listAppliedProposals: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getAsDb();
      if (!db) return [];
      // First, fetch the proposalIds with an "applied" audit event.
      const appliedAuditRows = await db
        .select({
          proposalId: agsGraphCorrectionAuditEvents.proposalId,
          appliedAt: agsGraphCorrectionAuditEvents.createdAt,
          metadata: agsGraphCorrectionAuditEvents.metadata,
        })
        .from(agsGraphCorrectionAuditEvents)
        .where(
          eq(agsGraphCorrectionAuditEvents.eventKind, "applied"),
        )
        .orderBy(desc(agsGraphCorrectionAuditEvents.createdAt))
        .limit(input?.limit ?? 100);

      if (appliedAuditRows.length === 0) return [];

      const proposalIds = appliedAuditRows.map((r) => Number(r.proposalId));
      const proposalRows = await db
        .select()
        .from(agsGraphCorrectionProposals)
        .where(inArray(agsGraphCorrectionProposals.id, proposalIds));

      // Build a proposal-id → audit-row map for the join. If an
      // operator-side retry path produces multiple "applied" rows for the
      // same proposal id, the first one wins (most-recent ordering).
      const auditByProposal = new Map<number, { appliedAt: Date; metadata: unknown }>();
      for (const a of appliedAuditRows) {
        const pid = Number(a.proposalId);
        if (auditByProposal.has(pid)) continue;
        auditByProposal.set(pid, {
          appliedAt: a.appliedAt as Date,
          metadata: a.metadata,
        });
      }

      return proposalRows
        .map((p) => {
          const audit = auditByProposal.get(Number(p.id));
          if (!audit) return null;
          return { ...p, appliedAt: audit.appliedAt, appliedMetadata: audit.metadata };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => {
          const at = (a.appliedAt as Date).getTime();
          const bt = (b.appliedAt as Date).getTime();
          return bt - at;
        });
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

  getStats: protectedProcedure.query(async () => {
    return await getGraphQualityStats();
  }),

  /**
   * Single-round-trip dashboard payload: bundles graph-quality stats,
   * workspace-observability stats, and the caller's unread notification
   * count so the operator dashboard renders all three summary cards
   * from one tRPC call. See `operator-dashboard.ts` for the
   * composition.
   */
  getOperatorDashboard: protectedProcedure.query(async ({ ctx }) => {
    const ctxAny = ctx as unknown as { user?: { id?: number } };
    return await getOperatorDashboard(ctxAny.user?.id ?? null);
  }),

  getFindingAuditTrail: protectedProcedure
    .input(z.object({ findingId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const trail = await getFindingAuditTrail(input.findingId);
      if (!trail) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Finding ${input.findingId} not found`,
        });
      }
      return trail;
    }),

  // ── Retention (Phase 22 follow-up #657 + #658 + #659) ────────────
  //
  // Operator surface for `ags_graph_quality_scans` retention. Sister
  // of `runs.pruneRetention` (#623), `simulation.pruneRetention`
  // (#651), `testing.pruneRetention` (#655). adminProcedure because
  // the cron + sweep operate across all scanners.
  pruneScansRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          statuses: z
            .array(
              z.enum([
                "pending",
                "running",
                "completed",
                "failed",
                "cancelled",
              ]),
            )
            .max(5)
            .optional(),
          scanKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          scope: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldGraphQualityScans } = await import(
        "../graph-quality-scans-retention.js"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldGraphQualityScans({
        olderThan,
        statuses: input?.statuses,
        scanKind: input?.scanKind,
        scope: input?.scope,
      });
    }),
  getScansRetentionCronStatus: adminProcedure.query(async () => {
    const { getGraphQualityScansRetentionCronStatus } = await import(
      "../graph-quality-scans-retention-cron.js"
    );
    return getGraphQualityScansRetentionCronStatus();
  }),
});

export type GraphQualityRouter = typeof graphQualityRouter;
