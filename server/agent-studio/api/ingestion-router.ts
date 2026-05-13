/**
 * Agent Studio — Universal Ingestion tRPC sub-router.
 *
 * Phase 22 follow-up #671. Lean surface — only exposes the
 * Universal Ingestion (Phase 2-3) retention operations today.
 * Future work can add ingestion-job listing / status / cancel
 * procedures here.
 *
 * Distinct from `racIngestionRouter` (RAC Phase 3 indexed-source
 * adapter contract): this router governs the `ags_ingestion_jobs`
 * lifecycle wrapper for the raw-bytes ingestion pipeline; RAC
 * ingestion governs the embedding-binding + adapter health for
 * already-registered sources.
 *
 * `adminProcedure` because the retention sweep operates across
 * all workspaces.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../_core/trpc";

export const ingestionRouter = router({
  // ── Retention (Phase 22 follow-up #669 + #670 + #671) ────────────
  //
  // Operator surface for `ags_ingestion_jobs` retention. Procedure
  // names use `JobsRetention` to disambiguate from any future
  // `pruneArtifactsRetention` (if/when bytes-storage retention is
  // separately scoped) — though artifacts retention is currently
  // out-of-scope as compliance-adjacent per the #669 doc-block.
  // 13th slot in the daily-sweep ladder (15:00 UTC default).
  pruneJobsRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          statuses: z
            .array(
              z.enum([
                "pending",
                "running",
                "succeeded",
                "failed",
                "unsupported_type",
              ]),
            )
            .max(5)
            .optional(),
          workspaceId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
          sourceConnectorKey: z
            .union([
              z.string().min(1).max(64),
              z.array(z.string().min(1).max(64)).max(20),
            ])
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldIngestionJobs } = await import(
        "../services/ingestion-jobs-retention.js"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldIngestionJobs({
        olderThan,
        statuses: input?.statuses,
        workspaceId: input?.workspaceId,
        sourceConnectorKey: input?.sourceConnectorKey,
      });
    }),
  getJobsRetentionCronStatus: adminProcedure.query(async () => {
    const { getIngestionJobsRetentionCronStatus } = await import(
      "../services/ingestion-jobs-retention-cron.js"
    );
    return getIngestionJobsRetentionCronStatus();
  }),
});

export type IngestionRouter = typeof ingestionRouter;
