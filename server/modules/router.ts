/**
 * Platform Modules — Combined Router
 *
 * Aggregates all platform engine routers and the module management router
 * into a single namespace under `modules.*`.
 *
 * WS-04/WS-06: Lifecycle guards on mutating module management routes
 * WS-11: Module-enabled guards on module management mutations
 */

import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getWorkspaceModules, setModuleEnabled, seedWorkspaceModules, logActivity } from "./registry";
import { MODULE_KEYS, type ModuleKey } from "../../drizzle/tables/workspace-modules";
import {
  requireReadableWorkspaceRoute,
  requireExecutableWorkspaceRoute,
} from "../workspace/workspace-guards";
import { pmtRouter } from "./pmt/router";
import { knowledgeRouter } from "./knowledge/router";
import { agentOrchRouter } from "./agents/router";
import { collaborationRouter } from "./collaboration/router";
import { reportingRouter } from "./reporting/router";

// Module management sub-router
const moduleManageRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      // WS-04: Readable workspace check — deleted workspaces blocked
      await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
      return getWorkspaceModules(input.workspaceId);
    }),

  setEnabled: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      moduleKey: z.enum(MODULE_KEYS as unknown as [string, ...string[]]),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      // WS-04/WS-06: Executable workspace check — paused/archived/deleted blocked
      await requireExecutableWorkspaceRoute(ctx.user.id, input.workspaceId, "module.setEnabled");
      await setModuleEnabled(input.workspaceId, input.moduleKey as ModuleKey, input.enabled);
      await logActivity({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: input.enabled ? "module.enable" : "module.disable",
        targetType: "module",
        metadata: { moduleKey: input.moduleKey },
      });
      return { success: true };
    }),

  seed: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      workspaceType: z.string().default("team"),
    }))
    .mutation(async ({ ctx, input }) => {
      // WS-04/WS-06: Executable workspace check
      await requireExecutableWorkspaceRoute(ctx.user.id, input.workspaceId, "modules.seed");
      await seedWorkspaceModules(input.workspaceId, input.workspaceType);
      await logActivity({
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        action: "modules.seed",
        metadata: { workspaceType: input.workspaceType },
      });
      return { success: true };
    }),
});

export const modulesRouter = router({
  manage: moduleManageRouter,
  pmt: pmtRouter,
  knowledge: knowledgeRouter,
  agentOrch: agentOrchRouter,
  collaboration: collaborationRouter,
  reporting: reportingRouter,
});
