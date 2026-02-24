/**
 * Platform Modules — Combined Router
 *
 * Aggregates all platform engine routers and the module management router
 * into a single namespace under `modules.*`.
 */

import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import { getWorkspaceModules, setModuleEnabled, seedWorkspaceModules, logActivity } from "./registry";
import { MODULE_KEYS, type ModuleKey } from "../../drizzle/tables/workspace-modules";
import { pmtRouter } from "./pmt/router";
import { knowledgeRouter } from "./knowledge/router";
import { agentOrchRouter } from "./agents/router";
import { collaborationRouter } from "./collaboration/router";
import { reportingRouter } from "./reporting/router";

// Module management sub-router
const moduleManageRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      return getWorkspaceModules(input.workspaceId);
    }),

  setEnabled: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      moduleKey: z.enum(MODULE_KEYS as unknown as [string, ...string[]]),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
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
