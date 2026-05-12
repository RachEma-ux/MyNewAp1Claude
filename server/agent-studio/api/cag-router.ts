/**
 * Agent Studio — CAG (Capability Pack) tRPC sub-router.
 *
 * RAC Phase 1D. Backend preview surface for the future CAG inspector
 * UI and for `curl`-based smoke tests against a running dev server.
 *
 * All five procedures are workspace-scoped via the client-supplied
 * `workspaceId` (matching the convention in `provider-bindings-router`).
 * `agentId` → `currentDraftId` resolution goes through
 * `repo.getCurrentDraft` so callers never have to learn the draft id.
 *
 *   - `listPacks`               — protected
 *   - `getLatestPack`           — protected
 *   - `previewInjectedContext`  — protected (composer dry-run)
 *   - `refreshPack`             — governed (writes a pack version on drift)
 *   - `listPackEvents`          — protected
 *
 * `previewInjectedContext` returns the exact prompt the live chat
 * stream would build, modulo the runtime-policy text (versioned in
 * the composer). It is safe to call repeatedly — the resolver only
 * inserts a new pack version when the source manifest hash drifts.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure, adminProcedure } from "../../_core/trpc";
import * as repo from "../repository";
import {
  listPacksForAgent,
  getLatestPack,
  listPackEvents,
  resolveCagPack,
} from "../services/cag";
import {
  composeSystemPrompt,
  type ComposerMode,
} from "../services/runtime/system-prompt-composer";

const composerModeSchema = z.enum(["disabled", "safe_degraded", "strict"]);

const agentRefSchema = z.object({
  workspaceId: z.number().int().positive(),
  agentId: z.number().int().positive(),
});

async function resolveDraftId(agentId: number): Promise<number> {
  const draft = await repo.getCurrentDraft(agentId);
  if (!draft) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No current draft for agentId=${agentId}`,
    });
  }
  return draft.id;
}

export const cagRouter = router({
  /**
   * List every persisted pack version for an agent in this workspace,
   * newest version first. Cross-workspace rows are filtered out at the
   * store level (`listPacksForAgent` uses `(workspaceId, agentId)`).
   */
  listPacks: protectedProcedure
    .input(agentRefSchema)
    .query(async ({ input }) => {
      return listPacksForAgent(input.workspaceId, input.agentId);
    }),

  /**
   * Return the latest pack for the agent's current draft, or null if
   * no pack has been built yet. Latest = highest `pack_version`,
   * regardless of `status` — the UI surface decides how to render
   * stale/archived/invalid.
   */
  getLatestPack: protectedProcedure
    .input(agentRefSchema)
    .query(async ({ input }) => {
      const draftId = await resolveDraftId(input.agentId);
      return getLatestPack(draftId);
    }),

  /**
   * Composer dry-run. Resolves the CAG pack, composes the system
   * prompt the live runtime would inject, and returns sections + the
   * full assembled string + token estimate + warnings.
   *
   * `mode=disabled` returns the byte-equivalent legacy concat (no
   * capability pack in output, no resolver call). `safe_degraded`
   * (default) returns the pack when available, warns when missing.
   * `strict` throws `cag_required` when no pack can be resolved.
   */
  previewInjectedContext: protectedProcedure
    .input(
      agentRefSchema.extend({
        mode: composerModeSchema.default("safe_degraded"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const draft = await repo.getCurrentDraft(input.agentId);
      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No current draft for agentId=${input.agentId}`,
        });
      }

      const resolved = await resolveCagPack({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        agentDraftId: draft.id,
        actorId: ctx.user.id,
        mode: input.mode,
      });

      const composed = composeSystemPrompt({
        mode: input.mode,
        draft: {
          name: (draft as any).name ?? null,
          role: (draft as any).role ?? null,
          scope: (draft as any).scope ?? null,
          mission: (draft as any).mission ?? null,
          systemInstructions: (draft as any).systemInstructions ?? null,
          roleInstructions: (draft as any).roleInstructions ?? null,
          policyInstructions: (draft as any).policyInstructions ?? null,
          successCriteria: (draft as any).successCriteria ?? null,
          escalationRules: (draft as any).escalationRules ?? null,
        },
        capabilityPack: resolved.section,
        retrievalEvidence: null,
      });

      return {
        sections: composed.sections,
        prompt: composed.text,
        tokenEstimate: composed.tokenEstimate,
        truncations: composed.truncations,
        warnings: [...resolved.warnings, ...composed.warnings],
        cacheKey: composed.cacheKey,
        packId: resolved.pack?.id ?? null,
        packVersion: resolved.pack?.packVersion ?? null,
      };
    }),

  /**
   * Operator-triggered pack refresh. Forces the resolver path:
   *   build → validate → reuse-on-hash-match → persist new version.
   *
   * Governed (R2): writes a row when sources have drifted. Idempotent
   * when the source manifest hash matches the latest fresh pack.
   */
  refreshPack: governedProcedure
    .input(agentRefSchema.extend({ _evidence: z.any().optional() }))
    .mutation(async ({ ctx, input }) => {
      const draftId = await resolveDraftId(input.agentId);
      const resolved = await resolveCagPack({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        agentDraftId: draftId,
        actorId: ctx.user.id,
        mode: "safe_degraded",
      });
      if (!resolved.pack) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `CAG pack refresh produced no pack (warnings: ${resolved.warnings.join("; ") || "none"})`,
        });
      }
      return {
        packId: resolved.pack.id,
        packVersion: resolved.pack.packVersion,
        warnings: resolved.warnings,
      };
    }),

  /**
   * Recent pack lifecycle events for the agent's current draft —
   * newest first. Drives the "what happened to this pack" panel in
   * the inspector. Default limit 100, hard cap 500.
   */
  listPackEvents: protectedProcedure
    .input(
      agentRefSchema.extend({
        limit: z.number().int().positive().max(500).default(100),
      }),
    )
    .query(async ({ input }) => {
      const draftId = await resolveDraftId(input.agentId);
      return listPackEvents(draftId, input.limit);
    }),

  // ── Retention (Phase 22 follow-up #645 + #646 + #647) ──────────────
  //
  // Operator surface for `ags_cag_pack_events` retention. Sister of
  // `runs.pruneRetention` (#623), `runs.pruneToolCallTracesRetention`
  // (#627), `mcp.pruneTransitionsRetention` (#631),
  // `catalogSyncLog.pruneRetention` (#635), `racTrace.pruneRetention`
  // (#640). adminProcedure because the cron + sweep operate across
  // all workspaces.
  pruneEventsRetention: adminProcedure
    .input(
      z
        .object({
          retentionDays: z.number().int().min(1).max(3650).optional(),
          eventTypes: z.array(z.string().min(1).max(64)).max(20).optional(),
          eventSeverities: z
            .array(z.enum(["info", "warn", "error"]))
            .max(3)
            .optional(),
          workspaceId: z
            .union([
              z.number().int().positive(),
              z.array(z.number().int().positive()).max(50),
            ])
            .optional(),
          agentDraftId: z.number().int().positive().optional(),
          packId: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const { pruneOldCagPackEvents } = await import(
        "../services/cag-pack-events-retention"
      );
      const days = input?.retentionDays ?? 30;
      const olderThan = new Date(Date.now() - days * 86_400_000);
      return pruneOldCagPackEvents({
        olderThan,
        eventTypes: input?.eventTypes,
        eventSeverities: input?.eventSeverities,
        workspaceId: input?.workspaceId,
        agentDraftId: input?.agentDraftId,
        packId: input?.packId,
      });
    }),
  getEventsRetentionCronStatus: adminProcedure.query(async () => {
    const { getCagPackEventsRetentionCronStatus } = await import(
      "../services/cag-pack-events-retention-cron"
    );
    return getCagPackEventsRetentionCronStatus();
  }),
});
