/**
 * PS — Projects System Module Manifest
 *
 * Currently shares the platform DB; planned to migrate to a dedicated psdb.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { psRouter } from "./ps.router";
import { okHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";

export const psManifest: ModuleManifest = {
  key: "ps",
  name: "PS — Projects System",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: {
    kind: "shared",
    schema: "appdb",
    ownedTables: ["ps_*", "ps_ideation_*", "ps_translator_*"],
  },

  router: psRouter,
  routerKey: "ps",

  permissions: { keys: ["ps.read", "ps.write", "ps.publish"] },

  governanceActions: [
    {
      key: "ps.ideation.publish",
      description: "Publish a PS ideation run",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "ps.handoff.pmCentral",
      description: "Hand off a project from PS to PM Central",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/projects", label: "Projects" }],
  navigation: [{ group: "delivery", label: "Projects", order: 10 }],

  health: async () => okHealth("PS ready"),

  publicApi: { path: "server/ps/public-api.ts" },
  events: { emits: ["ps.ideation.completed", "ps.handoff.submitted"] },
  handoffs: { produces: ["ps.pmCentral"], accepts: [] },
  ports: { provided: ["ps.read"], consumed: ["aiTypes.catalog"] },
  communication: { modes: ["port", "handoff", "event"] },
  boot: async () => {
    registerModuleHealthAction(psManifest);
    const { registerPublicApi } = await import("../platform/modules/module-gateway");
    registerPublicApi({
      module: "ps",
      action: "ps.ideation.publish",
      handler: async (input) => {
        const payload = input as { projectId: number; actorId: number };
        if (typeof payload?.projectId !== "number" || typeof payload?.actorId !== "number") {
          throw new Error("projectId and actorId are required");
        }
        const { publishPSProject } = await import("./ps.lifecycle");
        return publishPSProject(payload.projectId, payload.actorId);
      },
      descriptor: {
        key: "ps.ideation.publish",
        description: "Publish a PS ideation run",
        risk: "medium",
        receiptRequired: true,
      },
    });
    registerPublicApi({
      module: "ps",
      action: "ps.handoff.pmCentral",
      handler: async (input, ctx) => {
        const payload = input as {
          projectId: number;
          payload?: Record<string, unknown>;
        };
        if (typeof payload?.projectId !== "number") throw new Error("projectId is required");
        const { submitHandoff } = await import("../platform/handoff");
        return submitHandoff({
          fromModule: "ps",
          toModule: "pmCentral",
          type: "ps.pmCentral",
          payload: { projectId: payload.projectId, ...(payload.payload ?? {}) },
          actorId: ctx.actorId,
          workspaceId: ctx.workspaceId,
          governanceReceipt: ctx.governanceReceiptId,
          correlationId: ctx.correlationId,
        });
      },
      descriptor: {
        key: "ps.handoff.pmCentral",
        description: "Hand off a project from PS to PM Central",
        risk: "medium",
        receiptRequired: true,
      },
    });
  },
};
