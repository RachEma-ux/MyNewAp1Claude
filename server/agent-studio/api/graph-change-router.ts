/**
 * Agent Studio — Graph Change Proposals tRPC sub-router.
 *
 * Phase 22 follow-up #675. Lean surface — only exposes the Phase 11.5
 * graph-change-proposals retention operations today. Future work can
 * add proposal CRUD procedures here.
 *
 * Distinct from `agentStudio.graphCorrection` (Phase 14 graph-quality
 * remediation proposals): this router governs the structural-change
 * proposal scaffolding (entity merges, entity splits, projection
 * corrections, …).
 *
 * `adminProcedure` because the retention sweep operates across all
 * proposers.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../_core/trpc";

export const graphChangeRouter = router({
  // ── Retention (Phase 22 follow-up #673 + #674 + #675) ────────────
  //
  // Operator surface for `ags_graph_change_proposals` retention.
  // Sister of `graphCorrection.pruneProposalsRetention` (#663) on
  // a different sub-router. 14th slot in the daily-sweep ladder
  // (16:00 UTC default).
  pruneProposalsRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          statuses: z
            .array(
              z.enum([
                "pending",
                "validating",
                "in_review",
                "approved",
                "rejected",
                "withdrawn",
              ]),
            )
            .max(6)
            .optional(),
          proposalKind: z
            .union([
              z.string().min(1).max(100),
              z.array(z.string().min(1).max(100)).max(20),
            ])
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldGraphChangeProposals } = await import(
        "../services/graph-change-proposals-retention.js"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldGraphChangeProposals({
        olderThan,
        statuses: input?.statuses,
        proposalKind: input?.proposalKind,
      });
    }),
  getProposalsRetentionCronStatus: adminProcedure.query(async () => {
    const { getGraphChangeProposalsRetentionCronStatus } = await import(
      "../services/graph-change-proposals-retention-cron.js"
    );
    return getGraphChangeProposalsRetentionCronStatus();
  }),
});

export type GraphChangeRouter = typeof graphChangeRouter;
