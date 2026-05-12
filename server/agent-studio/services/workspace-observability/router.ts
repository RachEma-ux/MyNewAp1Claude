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
import {
  router,
  protectedProcedure,
  adminProcedure,
} from "../../../_core/trpc.js";
import {
  getJobById,
  getJobsByIds,
  listJobs,
  markJobCancelled,
  retryJob,
  retryJobs,
  retryJobsByQuery,
  cancelJobs,
  cancelJobsByQuery,
  failStaleRunningJobs,
  JobNotFoundError,
  JobNotRetryableError,
} from "./background-jobs.js";
import {
  getNotificationById,
  getNotificationsByIds,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markNotificationsRead,
  markAllNotificationsRead,
  markAllNotificationsReadByKind,
  dismissNotifications,
  dismissAllNotifications,
  dismissAllNotificationsByKind,
  pushNotificationToUsers,
} from "./user-notifications.js";
import {
  getErrorEventById,
  getErrorEventsByIds,
  listErrorEvents,
} from "./error-events.js";
import { captureUnexpectedTrpcError } from "./trpc-error-capture.js";
import { getWorkspaceObservabilityStats } from "./stats.js";
import { runRetentionSweep } from "./retention-sweep.js";
import { getObservabilityDashboard } from "./dashboard.js";
import { getInboxComposite } from "./inbox.js";

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
          status: z
            .union([JobStatusEnum, z.array(JobStatusEnum).max(5)])
            .optional(),
          jobKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          limit: z.number().int().min(1).max(500).optional(),
          createdSince: z.coerce.date().optional(),
          updatedSince: z.coerce.date().optional(),
          lastErrorLike: z.string().min(1).max(200).optional(),
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

  getBackgroundJobsByIds: protectedProcedure
    .input(
      z.object({
        jobIds: z.array(z.number().int().positive()).min(0).max(200),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await getJobsByIds(input.jobIds);
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
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

  cancelBackgroundJobs: protectedProcedure
    .input(
      z.object({
        jobIds: z.array(z.number().int().positive()).min(0).max(200),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await cancelJobs(input.jobIds);
      } catch (e) {
        // cancelJobs partitions JobNotFoundError + non-cancellable
        // status into the `skipped` array, so anything thrown here
        // is a hard infrastructure failure (e.g. ASDB unavailable).
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  retryBackgroundJob: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await retryJob(input.jobId);
      } catch (e) {
        if (e instanceof JobNotFoundError) {
          throwTrpcAndCapture(new TRPCError({ code: "NOT_FOUND", message: e.message }));
        }
        if (e instanceof JobNotRetryableError) {
          // The status invariant is part of the operator contract;
          // surface PRECONDITION_FAILED so the UI can render a clean
          // "only failed jobs can be retried" message.
          throwTrpcAndCapture(new TRPCError({
            code: "PRECONDITION_FAILED",
            message: e.message,
          }));
        }
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  retryBackgroundJobs: protectedProcedure
    .input(
      z.object({
        jobIds: z.array(z.number().int().positive()).min(0).max(200),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await retryJobs(input.jobIds);
      } catch (e) {
        // retryJobs partitions JobNotFoundError + JobNotRetryableError
        // into the `skipped` array, so anything thrown here is a hard
        // infrastructure failure (e.g. ASDB unavailable).
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
          notificationKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          limit: z.number().int().min(1).max(500).optional(),
          createdSince: z.coerce.date().optional(),
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
          createdSince: input?.createdSince,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getMyInbox: protectedProcedure
    .input(
      z
        .object({
          unreadOnly: z.boolean().optional(),
          notificationKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          limit: z.number().int().min(1).max(500).optional(),
          createdSince: z.coerce.date().optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        return {
          notifications: [],
          unreadCount: { total: 0, byKind: {} },
        };
      }
      try {
        return await getInboxComposite({
          userId,
          unreadOnly: input?.unreadOnly,
          notificationKind: input?.notificationKind,
          limit: input?.limit,
          createdSince: input?.createdSince,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getMyNotificationById: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "NOT_FOUND",
          message: `Notification ${input.notificationId} not found`,
        }));
      }
      try {
        // userId-scoped so a peer's notification id returns NOT_FOUND
        // instead of leaking via the row contents.
        const row = await getNotificationById(input.notificationId, {
          userId,
        });
        if (!row) {
          throwTrpcAndCapture(new TRPCError({
            code: "NOT_FOUND",
            message: `Notification ${input.notificationId} not found`,
          }));
        }
        return row;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getMyNotificationsByIds: protectedProcedure
    .input(
      z.object({
        notificationIds: z.array(z.number().int().positive()).min(0).max(200),
      }),
    )
    .query(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      // userId-scoped — peer rows silently excluded from result (#557
      // id-enumeration guard).
      if (userId == null) return [];
      try {
        return await getNotificationsByIds(input.notificationIds, {
          userId,
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

  markNotificationsRead: protectedProcedure
    .input(
      z.object({
        notificationIds: z
          .array(z.number().int().positive())
          .min(0)
          .max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "markNotificationsRead requires an authenticated user",
        }));
      }
      try {
        return await markNotificationsRead({
          userId,
          notificationIds: input.notificationIds,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  dismissNotifications: protectedProcedure
    .input(
      z.object({
        notificationIds: z
          .array(z.number().int().positive())
          .min(0)
          .max(500),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "dismissNotifications requires an authenticated user",
        }));
      }
      try {
        return await dismissNotifications({
          userId,
          notificationIds: input.notificationIds,
        });
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

  markAllNotificationsReadByKind: protectedProcedure
    .input(
      z.object({
        notificationKind: z.union([
          z.string().min(1).max(100),
          z.array(z.string().min(1).max(100)).max(20),
        ]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "markAllNotificationsReadByKind requires an authenticated user",
        }));
      }
      try {
        return await markAllNotificationsReadByKind({
          userId,
          notificationKind: input.notificationKind,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  dismissAllNotifications: protectedProcedure
    .input(
      z
        .object({
          readOnly: z.boolean().optional(),
        })
        .optional(),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message: "dismissAllNotifications requires an authenticated user",
        }));
      }
      try {
        return await dismissAllNotifications({
          userId,
          readOnly: input?.readOnly,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  dismissAllNotificationsByKind: protectedProcedure
    .input(
      z.object({
        notificationKind: z.union([
          z.string().min(1).max(100),
          z.array(z.string().min(1).max(100)).max(20),
        ]),
        readOnly: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id;
      if (userId == null) {
        throwTrpcAndCapture(new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "dismissAllNotificationsByKind requires an authenticated user",
        }));
      }
      try {
        return await dismissAllNotificationsByKind({
          userId,
          notificationKind: input.notificationKind,
          readOnly: input.readOnly,
        });
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
          sourceKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          sourceKindLike: z.string().min(1).max(100).optional(),
          errorClass: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          userId: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(500).optional(),
          createdSince: z.coerce.date().optional(),
          errorMessageLike: z.string().min(1).max(200).optional(),
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

  getErrorEventById: protectedProcedure
    .input(z.object({ errorEventId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const row = await getErrorEventById(input.errorEventId);
        if (!row) {
          throwTrpcAndCapture(new TRPCError({
            code: "NOT_FOUND",
            message: `Error event ${input.errorEventId} not found`,
          }));
        }
        return row;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  getErrorEventsByIds: protectedProcedure
    .input(
      z.object({
        errorEventIds: z.array(z.number().int().positive()).min(0).max(200),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await getErrorEventsByIds(input.errorEventIds);
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

  // ============================================================
  // Operator dashboard composite (single round-trip)
  //
  // Bundles getStats + recent-failed-jobs + recent-error-events so
  // the dashboard's initial render is one tRPC call instead of
  // three. Drilldown views still call the underlying procedures
  // directly when the operator filters or paginates.
  // ============================================================

  getDashboard: protectedProcedure
    .input(
      z
        .object({
          recentLimit: z.number().int().min(1).max(200).optional(),
          staleLimit: z.number().int().min(1).max(100).optional(),
          staleJobKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          pendingLimit: z.number().int().min(1).max(100).optional(),
          pendingJobKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      try {
        return await getObservabilityDashboard(input ?? {});
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // ============================================================
  // Operator broadcast (admin-only)
  //
  // Sister of `pushNotification` (singular, called from service code)
  // — this surface is for operator-driven broadcasts: "graph
  // projection rebuild complete — please review", "scheduled
  // maintenance window starts 18:00 UTC", etc. Bulk INSERT to a
  // caller-supplied user list.
  // ============================================================

  broadcastNotification: adminProcedure
    .input(
      z.object({
        userIds: z
          .array(z.number().int().positive())
          .min(0)
          .max(10_000),
        notificationKind: z.string().min(1).max(100),
        payload: z.record(z.string(), z.unknown()).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await pushNotificationToUsers({
          userIds: input.userIds,
          notificationKind: input.notificationKind,
          payload: input.payload ?? null,
        });
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // ============================================================
  // Retention sweep (operator-triggered, admin-only)
  //
  // Bundles the three Phase 22 retention prunes (#519/#520/#522)
  // into a single admin-callable mutation so an operator can clear
  // stale rows from the dashboard without dropping into the DB or
  // wiring an out-of-band cron. Cron-style automation can call the
  // service helper directly; this surface is for operator-on-demand.
  // ============================================================

  runRetentionSweep: adminProcedure
    .input(
      z
        .object({
          errorEventsRetentionDays: z.number().int().min(0).max(3650).optional(),
          errorEventsErrorClass: z
            .union([
              z.string().min(1).max(200),
              z.array(z.string().min(1).max(200)).max(20),
            ])
            .optional(),
          errorEventsErrorMessageLike: z.string().min(1).max(200).optional(),
          notificationsRetentionDays: z
            .number()
            .int()
            .min(0)
            .max(3650)
            .optional(),
          notificationsReadOnly: z.boolean().optional(),
          notificationsNotificationKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          backgroundJobsRetentionDays: z
            .number()
            .int()
            .min(0)
            .max(3650)
            .optional(),
          backgroundJobsStatuses: z
            .array(JobStatusEnum)
            .min(1)
            .max(5)
            .optional(),
          backgroundJobsJobKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          backgroundJobsLastErrorLike: z.string().min(1).max(200).optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      try {
        return await runRetentionSweep(input ?? {});
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // ============================================================
  // Stale-running auto-failer (operator-triggered, admin-only)
  //
  // Pair of `listStaleRunningJobs` (#545) — the listing puts the
  // problem on the dashboard; this surface unsticks the rows by
  // force-failing them. Each transition flows through markJobFailed,
  // which mirrors into the error_events stream so the operator gets
  // drilldown rows instead of a silent flip. Cron callers can hit
  // the service helper directly.
  // ============================================================

  failStaleRunningBackgroundJobs: adminProcedure
    .input(
      z.object({
        olderThan: z.coerce.date(),
        limit: z.number().int().min(1).max(500).optional(),
        errorMessage: z.string().min(1).max(2000).optional(),
        jobKind: z
          .union([
            z.string().min(1).max(100),
            z.array(z.string().min(1).max(100)).max(20),
          ])
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await failStaleRunningJobs(input);
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // ============================================================
  // Bulk-retry-by-query (operator-triggered, admin-only)
  //
  // Sister of failStaleRunningBackgroundJobs on the opposite-direction
  // transition (failed→pending vs running→failed). After a worker-side
  // hotfix lands, an operator can run "retry all failed jobs of
  // jobKind X" in one round trip instead of multi-selecting failed
  // rows in the UI. Delegates to retryJobs for the per-row flip
  // (partition pattern).
  // ============================================================

  retryBackgroundJobsByQuery: adminProcedure
    .input(
      z
        .object({
          jobKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          limit: z.number().int().min(1).max(500).optional(),
          olderThan: z.coerce.date().optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      try {
        return await retryJobsByQuery(input ?? {});
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),

  // ============================================================
  // Bulk-cancel-by-query (operator-triggered, admin-only)
  //
  // Completes the operator-by-query sweep trio (fail #546 / retry
  // #573 / cancel #574). Maintenance-window gesture: drain the
  // queue and/or abort in-flight workers for a jobKind subset.
  // Statuses parameter lets operators choose "pending only" (drain
  // queue, leave running alone) or default ["pending","running"]
  // (full stop).
  // ============================================================

  cancelBackgroundJobsByQuery: adminProcedure
    .input(
      z
        .object({
          jobKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
          statuses: z
            .array(z.enum(["pending", "running", "completed", "failed", "cancelled"]))
            .max(5)
            .optional(),
          limit: z.number().int().min(1).max(500).optional(),
          olderThan: z.coerce.date().optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      try {
        return await cancelJobsByQuery(input ?? {});
      } catch (e) {
        throwTrpcAndCapture(new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }),
});

export type WorkspaceObservabilityRouter = typeof workspaceObservabilityRouter;
