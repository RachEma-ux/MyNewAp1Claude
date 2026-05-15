/**
 * Region admin tRPC router — V2 Phase MR-1 Phase-2 eighth slice.
 * PR-V1-156.
 *
 * Operator-facing surface for managing the region registry,
 * workspace pins, and inspecting cache/cron state. Mounted at
 * `agentStudio.region.*` from `api/router.ts`.
 *
 * All procedures are `adminProcedure` — operator authority required.
 * No public/protected procedures here: a non-admin shouldn't see
 * region topology.
 *
 * Closes SOU §5 deferred item "Operator admin UI for pins" at the
 * tRPC layer. The React surface is a separate slice.
 *
 * Hard-rule compliance:
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `neo4j-driver`
 *     imports.
 *   - Region credentials never leave the database — postgresUri/neo4jUri
 *     ARE returned (operators need them for the runbook), but the
 *     credentialBindingId is the indirection layer; resolution happens
 *     elsewhere via existing connection bindings.
 */

import { z } from "zod";

import { adminProcedure, router } from "../../../_core/trpc.js";
import { getRegionCachePubsubStatus } from "./region-cache-pubsub.js";
import { getRegionCacheRewarmCronStatus } from "./region-cache-rewarm-cron.js";
import { warmRegionRoutingCache } from "./workspace-region-cache.js";
import {
  listActiveRegions,
  registerRegion,
} from "./region-service.js";
import { getRegionRoutingCacheStatus } from "./workspace-region-cache.js";
import {
  getWorkspaceRegionPin,
  listAllWorkspaceRegionPins,
  removeWorkspaceRegionPin,
  setWorkspaceRegionPin,
} from "./workspace-region-pin-service.js";

const RegisterRegionInputSchema = z.object({
  regionKey: z.string().min(1).max(80),
  name: z.string().min(1).max(255),
  postgresUri: z.string().min(1),
  neo4jUri: z.string().nullable().optional(),
  credentialBindingId: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
  settings: z.record(z.unknown()).nullable().optional(),
});

const SetPinInputSchema = z.object({
  workspaceId: z.number().int().positive(),
  regionKey: z.string().min(1).max(80),
  isReplicated: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const RemovePinInputSchema = z.object({
  workspaceId: z.number().int().positive(),
});

const GetPinInputSchema = z.object({
  workspaceId: z.number().int().positive(),
});

export const regionAdminRouter = router({
  /**
   * List the active region registry. Operator dashboard primary
   * read.
   */
  listActiveRegions: adminProcedure.query(async () => {
    return listActiveRegions();
  }),

  /**
   * Register (insert) a new region row. Fires the region-change
   * hook (#904) which invalidates + re-warms the routing cache.
   */
  registerRegion: adminProcedure
    .input(RegisterRegionInputSchema)
    .mutation(async ({ input }) => {
      return registerRegion({
        regionKey: input.regionKey,
        name: input.name,
        postgresUri: input.postgresUri,
        neo4jUri: input.neo4jUri ?? null,
        credentialBindingId: input.credentialBindingId ?? null,
        isPrimary: input.isPrimary,
        settings: input.settings ?? null,
      });
    }),

  /**
   * List every workspace region pin. Operator dashboard secondary
   * read.
   */
  listPins: adminProcedure.query(async () => {
    return listAllWorkspaceRegionPins();
  }),

  /**
   * Get a single workspace's pin (or null when unpinned).
   */
  getPin: adminProcedure
    .input(GetPinInputSchema)
    .query(async ({ input }) => {
      return getWorkspaceRegionPin(input.workspaceId);
    }),

  /**
   * Upsert a workspace pin. Fires the pin-change hook (#903) which
   * invalidates + re-warms the routing cache.
   */
  setPin: adminProcedure
    .input(SetPinInputSchema)
    .mutation(async ({ input }) => {
      return setWorkspaceRegionPin({
        workspaceId: input.workspaceId,
        regionKey: input.regionKey,
        isReplicated: input.isReplicated,
        notes: input.notes,
      });
    }),

  /**
   * Remove a workspace pin (idempotent — returns false if no row
   * matched). Fires the pin-change hook (#903) only when a row
   * was actually deleted.
   */
  removePin: adminProcedure
    .input(RemovePinInputSchema)
    .mutation(async ({ input }) => {
      return { removed: await removeWorkspaceRegionPin(input.workspaceId) };
    }),

  /**
   * Cache status — exposes `isWarm`, `lastWarmedAt`, counts. Same
   * shape used by the operator dashboard panels for the retention
   * crons + the graph health alert cron.
   */
  getCacheStatus: adminProcedure.query(async () => {
    return getRegionRoutingCacheStatus();
  }),

  /**
   * Re-warm cron status. Mirrors the graph-health cron status
   * surface so the operator dashboard renders it identically.
   */
  getRewarmCronStatus: adminProcedure.query(async () => {
    return getRegionCacheRewarmCronStatus();
  }),

  /**
   * Cross-process pubsub status (PR-V1-167). Surfaces whether the
   * LISTEN subscriber is up, when the last cross-process
   * notification arrived, lifetime message count, and reconnect
   * attempt count. Useful for verifying multi-process pubsub is
   * actually wired (a `connectedAt` of null after boot means
   * LISTEN never succeeded).
   */
  getPubsubStatus: adminProcedure.query(async () => {
    return getRegionCachePubsubStatus();
  }),

  /**
   * PR-V1-176: operator-triggered manual cache re-warm. Mirrors the
   * `forceTick` shape on the canvas drain (#925). Useful for (a)
   * verifying that newly-registered regions / pins are visible
   * without waiting for the 10-min `region-cache-rewarm-cron`
   * (#906), (b) catching the rare case where in-process hooks fired
   * but a race left the cache stale. Returns the warm summary so
   * the operator UI can render counts immediately.
   */
  forceRewarm: adminProcedure.mutation(async () => {
    const summary = await warmRegionRoutingCache();
    return {
      activeRegionCount: summary.activeRegionCount,
      pinCount: summary.pinCount,
      primaryRegionKey: summary.primaryRegionKey,
      lastWarmedAt: summary.lastWarmedAt,
    };
  }),
});
