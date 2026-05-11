/**
 * Agent Studio — Graph Skill Pack tRPC sub-router (Phase 12.5 §8).
 *
 * Surfaces the read-side helpers of the Graph Skill Pack module so
 * the admin UI / governance dashboards can render usage analytics
 * for Skill Packs without reaching into the service module directly.
 *
 *   - `listUsageCounts` — protected; aggregated per-pack-version
 *                          usage counts over a look-back window.
 *
 * Mutations (pack create / version publish / template runs) are not
 * exposed here — those are governed and ship via the boot-time seed
 * pipeline (`server/agent-studio/db/seed-graph-skill-rows.ts`) or
 * a dedicated governed sub-router that comes with the publish flow.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import {
  listUsageCounts,
  createPack,
  publishVersion,
  listPackVersions,
  AsdbUnavailableError,
  DuplicateVersionError,
  PackNotFoundError,
  SourceNoteVersionNotFoundError,
} from "../services/graph-skill/public-api";

const RISK_LEVELS = ["low", "medium", "high"] as const;

export const graphSkillRouter = router({
  listUsageCounts: protectedProcedure
    .input(
      z.object({
        /**
         * Look-back window in ms from `now`. Defaults to the
         * service-side default (7 days). Hard-capped at 90 days to
         * keep the aggregate query bounded — operators wanting longer
         * horizons should consume the raw table via an analytics
         * pipeline, not this endpoint.
         */
        sinceMs: z
          .number()
          .int()
          .positive()
          .max(90 * 24 * 60 * 60 * 1000)
          .optional(),
        /** Filter to a single Skill Pack by `skillKey`. */
        skillKey: z.string().min(1).max(100).optional(),
        /** Row cap; defaults to service-side default (100). */
        limit: z.number().int().positive().max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const rows = await listUsageCounts({
          sinceMs: input.sinceMs,
          skillKey: input.skillKey,
          limit: input.limit,
        });
        return {
          rows: rows.map((r) => ({
            skillKey: r.skillKey,
            packId: r.packId,
            packVersionId: r.packVersionId,
            version: r.version,
            count: r.count,
            // tRPC SuperJSON serializes Date instances; the client
            // sees a real `Date` on the other side.
            latestUsedAt: r.latestUsedAt,
          })),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `graph-skill usage counts failed: ${msg}`,
        });
      }
    }),

  listPackVersions: protectedProcedure
    .input(
      z.object({
        skillKey: z.string().min(1).max(100),
        limit: z.number().int().positive().max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const rows = await listPackVersions({
          skillKey: input.skillKey,
          limit: input.limit,
        });
        return {
          rows: rows.map((r) => ({
            id: r.id,
            version: r.version,
            createdAt: r.createdAt,
            hasSourceNoteRef: r.hasSourceNoteRef,
          })),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `graph-skill listPackVersions failed: ${msg}`,
        });
      }
    }),

  createPack: governedProcedure
    .input(
      z.object({
        skillKey: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9][a-z0-9._-]*$/, {
            message:
              "skillKey must be lowercase alphanumeric with optional . _ -",
          }),
        name: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        domain: z.string().min(1).max(100).optional(),
        supportedNodeTypeKeys: z.array(z.string().min(1).max(100)).optional(),
        supportedEdgeTypeKeys: z.array(z.string().min(1).max(100)).optional(),
        riskLevel: z.enum(RISK_LEVELS).optional(),
        approvalRequired: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const pack = await createPack({
          skillKey: input.skillKey,
          name: input.name,
          description: input.description,
          domain: input.domain,
          supportedNodeTypeKeys: input.supportedNodeTypeKeys,
          supportedEdgeTypeKeys: input.supportedEdgeTypeKeys,
          riskLevel: input.riskLevel,
          approvalRequired: input.approvalRequired,
        });
        return pack;
      } catch (err) {
        if (err instanceof AsdbUnavailableError) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: err.message,
          });
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `graph-skill createPack failed: ${msg}`,
        });
      }
    }),

  publishVersion: governedProcedure
    .input(
      z.object({
        skillKey: z.string().min(1).max(100),
        version: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/, {
            message:
              "version must be alphanumeric with optional . _ - + (e.g. 1.0.0, 2024-05-11)",
          }),
        manifest: z.record(z.string(), z.unknown()),
        changelog: z.string().max(10_000).optional(),
        sourceNoteVersionId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const version = await publishVersion({
          skillKey: input.skillKey,
          version: input.version,
          manifest: input.manifest,
          changelog: input.changelog,
          sourceNoteVersionId: input.sourceNoteVersionId,
        });
        return version;
      } catch (err) {
        if (err instanceof PackNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: err.message,
          });
        }
        if (err instanceof SourceNoteVersionNotFoundError) {
          // The source-note id was supplied but doesn't resolve. This
          // is a caller mistake (BAD_REQUEST), not a server problem —
          // operators should fix the payload and retry.
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message,
          });
        }
        if (err instanceof DuplicateVersionError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: err.message,
          });
        }
        if (err instanceof AsdbUnavailableError) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: err.message,
          });
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `graph-skill publishVersion failed: ${msg}`,
        });
      }
    }),
});
