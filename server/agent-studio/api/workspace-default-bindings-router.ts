/**
 * Agent Studio — workspace-default-binding tRPC sub-router.
 *
 * PMB Phase 30.1b. Wraps the Phase 29.1b primitives in
 * `workspace-default-bindings.ts` for the Workspace Settings →
 * "Default Bindings" admin panel (Phase 30.1c).
 *
 * Receipts (D-WDB-7): writes go through `governedProcedure` so
 * `agentStudio.workspaceDefaultBindings.{upsert,delete}` requires a
 * governance receipt. Reads use `protectedProcedure`.
 *
 * No procedure returns credential material — the result projections
 * mirror `ResolveForRunResult`'s no-secret shape.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import {
  listWorkspaceDefaultBindings,
  upsertWorkspaceDefaultBinding,
  deleteWorkspaceDefaultBinding,
  WORKSPACE_DEFAULT_BINDING_ROLES,
  type WorkspaceDefaultBindingRole,
} from "../workspace-default-bindings";

const roleSchema = z.enum(
  WORKSPACE_DEFAULT_BINDING_ROLES as unknown as readonly [
    WorkspaceDefaultBindingRole,
    ...WorkspaceDefaultBindingRole[],
  ],
);

const upsertSchema = z.object({
  workspaceId: z.number().int().positive(),
  role: roleSchema,
  providerConnectionId: z.number().int().positive(),
  providerCatalogEntryId: z.number().int().positive().nullable().optional(),
  modelRef: z.string().min(1).max(255),
});

const deleteSchema = z.object({
  workspaceId: z.number().int().positive(),
  role: roleSchema,
});

export const workspaceDefaultBindingsRouter = router({
  /**
   * List all four roles for a workspace. Returns rows where they exist;
   * the UI fills in "not configured" placeholders for missing roles.
   */
  listForWorkspace: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return listWorkspaceDefaultBindings(input.workspaceId);
    }),

  /**
   * Set or update the default for one role. Calls Phase 8's eligibility
   * gate before persisting; throws BAD_REQUEST if the linked Provider
   * Connection is missing/disabled/unhealthy.
   */
  upsert: governedProcedure
    .input(upsertSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await upsertWorkspaceDefaultBinding({
        workspaceId: input.workspaceId,
        role: input.role,
        providerConnectionId: input.providerConnectionId,
        providerCatalogEntryId: input.providerCatalogEntryId ?? null,
        modelRef: input.modelRef,
        updatedBy: ctx.user.id,
      });
      if (!result.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.reason ?? "binding_not_eligible",
        });
      }
      return result.binding!;
    }),

  /**
   * Clear the default for one role. Idempotent.
   */
  delete: governedProcedure
    .input(deleteSchema)
    .mutation(async ({ input }) => {
      const removed = await deleteWorkspaceDefaultBinding({
        workspaceId: input.workspaceId,
        role: input.role,
      });
      return { workspaceId: input.workspaceId, role: input.role, removed };
    }),
});
