/**
 * Workspace Observability — tRPC Router.
 *
 * Phase 22. Mounts the three observability surfaces (background
 * jobs, user notifications, error events) under
 * `agentStudio.workspaceObservability.*`.
 *
 * The recorder writers (enqueueJob, markJobStarted, etc.) are
 * called from service code, not the UI — they don't need tRPC
 * mutations. The router exposes only the reader + the operator-
 * triggered transitions (mark-read, mark-cancelled).
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace.md
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../_core/trpc.js";
import {
  getJobById,
  listJobs,
  markJobCancelled,
  JobNotFoundError,
} from "./background-jobs.js";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./user-notifications.js";
import { listErrorEvents } from "./error-events.js";
import { captureUnexpectedTrpcError } from "./trpc-error-capture.js";
import { getWorkspaceObservabilityStats } from "./stats.js";

/**
 * Self-instrumentation: this router OWNS the error_events table,
 * and uses the same capture helper as graph-quality (#490) and
 * graph-correction (#491) to record its own failures. The recorder
 * is fail-soft, so a recording-the-failure-of-listing-errors loop
 * cannot escalate — it just silently returns null.
 */
function throwTrpcAndCapture(trpcErr: TRPCError): never {
  void captureUnexpectedTrpcError("workspaceObservability.router", trpcErr);
  throw trpcErr;
}

const JobStatusEnum = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const workspaceObservabilityRouter = router({
  // ============================================================
  // Background jobs (read + cancel)
  // ============================================================

  listBackgroundJobs: protectedProcedure
    .input(
      z
        .object({
          status: JobStatusEnum.optional(),
          jobKind: z.string().min(1).max(100).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      try {
        return await listJobs(input ?? {});
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getBackgroundJob: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const job = await getJobById(input.jobId);
      if (!job) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Background job ${input.jobId} not found`,
        }));
      }
      return job;
    }),

  cancelBackgroundJob: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await markJobCancelled(input.jobId);
      } catch (e) {
        if (e instanceof JobNotFoundError) {
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: e.message }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // ============================================================
  // User notifications
  // ============================================================

  listMyNotifications: protectedProcedure
    .input(
      z
        .object({
          unreadOnly: z.boolean().optional(),
          notificationKind: z.string().min(1).max(100).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) return [];
      try {
        return await listNotifications({
          userId,
          unreadOnly: input?.unreadOnly,
          notificationKind: input?.notificationKind,
          limit: input?.limit,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getMyUnreadNotificationCount: protectedProcedure.query(async ({ ctx }) => {
    const ctxAny = ctx as unknown as { user?: { id?: number } };
    const userId = ctxAny.user?.id;
    if (userId == null) return { total: 0, byKind: {} };
    try {
      return await countUnreadNotifications(userId);
    } catch (e) {
      throwTrpcAndCapture(new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: e instanceof Error ? e.message : String(e),
      }));
    }
  }),

  markNotificationRead: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        await markNotificationRead(input.notificationId);
        return { ok: true };
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  markAllNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const ctxAny = ctx as unknown as { user?: { id?: number } };
    const userId = ctxAny.user?.id;
    if (userId == null) {
      throwTrpcAndCapture(new TRPCError({
        code: "UNAUTHORIZED",
        message: "markAllNotificationsRead requires an authenticated user",
      }));
    }
    try {
      await markAllNotificationsRead(userId);
      return { ok: true };
    } catch (e) {
      throwTrpcAndCapture(new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: e instanceof Error ? e.message : String(e),
      }));
    }
  }),

  // ============================================================
  // Error events (read-only)
  // ============================================================

  listErrorEvents: protectedProcedure
    .input(
      z
        .object({
          sourceKind: z.string().min(1).max(100).optional(),
          errorClass: z.string().min(1).max(100).optional(),
          userId: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      try {
        return await listErrorEvents(input ?? {});
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getStats: protectedProcedure.query(async () => {
    try {
      return await getWorkspaceObservabilityStats();
    } catch (e) {
      throwTrpcAndCapture(new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: e instanceof Error ? e.message : String(e),
      }));
    }
  }),
});

export type WorkspaceObservabilityRouter = typeof workspaceObservabilityRouter;
