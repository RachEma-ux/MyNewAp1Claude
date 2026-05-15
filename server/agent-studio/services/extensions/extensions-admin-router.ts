/**
 * Extensions admin tRPC router — V1+ Phase 18 follow-up. PR-V1-162.
 *
 * Operator-facing surface for managing the extension registry.
 * Mounted at `agentStudio.extensions.*`. All procedures are
 * `adminProcedure` — operator authority required.
 *
 * Mirrors the region admin router pattern (#907): per-workspace
 * scoped reads + writes, Zod-validated inputs, no governance bypass
 * (writes still go through the existing approval scaffolding via
 * `governanceStatus` transitions).
 *
 * Hard-rule compliance:
 *   - All extension mutations route through `installExtension` /
 *     `approveExtension` / `setExtensionStatus`. No direct
 *     `agsExtensions` writes from the router.
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` /
 *     `neo4j-driver` imports.
 *   - The capability-pinned dispatch contract (manifest §5) is
 *     preserved: this router only manages extension records;
 *     `invokeFromExtension` remains the only dispatch path.
 */

import { z } from "zod";

import { adminProcedure, router } from "../../../_core/trpc.js";
import {
  EXTENSION_CAPABILITY_LANES,
  EXTENSION_GOVERNANCE_STATUSES,
} from "./contracts.js";
import {
  approveExtension,
  getExtensionById,
  installExtension,
  listExtensionsByWorkspace,
  setExtensionStatus,
} from "./manifest.js";

const ExtensionManifestSchema = z.object({
  extensionKey: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  version: z.string().min(1).max(80),
  signingKeyId: z.string().optional(),
  capabilityLanes: z
    .array(z.enum(EXTENSION_CAPABILITY_LANES))
    .min(1),
  declaredToolNames: z.array(z.string().min(1)),
});

const InstallInputSchema = z.object({
  workspaceId: z.number().int().positive(),
  manifest: ExtensionManifestSchema,
  installedByUserId: z.number().int().positive().optional(),
});

const ApproveInputSchema = z.object({
  extensionId: z.number().int().positive(),
  approvedByUserId: z.number().int().positive(),
});

const SetStatusInputSchema = z.object({
  extensionId: z.number().int().positive(),
  status: z.enum(EXTENSION_GOVERNANCE_STATUSES),
});

const GetInputSchema = z.object({
  extensionId: z.number().int().positive(),
});

const ListInputSchema = z.object({
  workspaceId: z.number().int().positive(),
  status: z.enum(EXTENSION_GOVERNANCE_STATUSES).optional(),
});

export const extensionsAdminRouter = router({
  /**
   * List extensions installed in a workspace, optionally filtered
   * by governance status (pending_approval / approved / etc.).
   */
  list: adminProcedure
    .input(ListInputSchema)
    .query(async ({ input }) => {
      return listExtensionsByWorkspace(input.workspaceId, input.status);
    }),

  /**
   * Get a single extension by its database id.
   */
  get: adminProcedure
    .input(GetInputSchema)
    .query(async ({ input }) => {
      return getExtensionById(input.extensionId);
    }),

  /**
   * Install a new extension. The record enters `pending_approval`
   * state — separate `approve` call required before dispatch is
   * authorized.
   */
  install: adminProcedure
    .input(InstallInputSchema)
    .mutation(async ({ input }) => {
      return installExtension({
        workspaceId: input.workspaceId,
        manifest: {
          extensionKey: input.manifest.extensionKey,
          name: input.manifest.name,
          version: input.manifest.version,
          signingKeyId: input.manifest.signingKeyId,
          capabilityLanes: input.manifest.capabilityLanes,
          declaredToolNames: input.manifest.declaredToolNames,
        },
        installedByUserId: input.installedByUserId,
      });
    }),

  /**
   * Approve an extension; transitions `pending_approval` →
   * `approved`. Records `approvedByUserId` + `approvedAt` on the row.
   */
  approve: adminProcedure
    .input(ApproveInputSchema)
    .mutation(async ({ input }) => {
      return approveExtension({
        extensionId: input.extensionId,
        approvedByUserId: input.approvedByUserId,
      });
    }),

  /**
   * Operator-controlled status transition. Used to disable / revoke
   * an extension without uninstalling it. Mirrors the
   * agent-lifecycle status surface.
   */
  setStatus: adminProcedure
    .input(SetStatusInputSchema)
    .mutation(async ({ input }) => {
      return setExtensionStatus(input.extensionId, input.status);
    }),
});
