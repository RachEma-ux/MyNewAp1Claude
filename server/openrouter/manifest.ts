/**
 * OpenRouter Module Manifest
 */

import type { ModuleManifest } from "../platform/modules/types";
import { openRouterRouter } from "./router";
import { okHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";

export const openRouterManifest: ModuleManifest = {
  key: "openRouter",
  name: "OpenRouter — Unified Model Gateway",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: { kind: "shared", schema: "appdb", ownedTables: ["openrouter_*"] },

  router: openRouterRouter,
  routerKey: "openRouter",

  permissions: { keys: ["openRouter.read", "openRouter.write"] },

  governanceActions: [
    {
      key: "openRouter.config.update",
      description: "Update OpenRouter routing configuration",
      risk: "high",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/openrouter", label: "OpenRouter" }],
  navigation: [{ group: "infrastructure", label: "OpenRouter", order: 20 }],

  health: async () => okHealth("OpenRouter ready"),

  publicApi: { path: "server/openrouter/public-api.ts" },
  events: { emits: ["openRouter.routing.config.updated"] },
  ports: { provided: ["openRouter.route"], consumed: [] },
  communication: { modes: ["port", "gateway", "event"] },
  boot: async () => {
    registerModuleHealthAction(openRouterManifest);
    const { registerPublicApi } = await import("../platform/modules/module-gateway");
    registerPublicApi({
      module: "openRouter",
      action: "openRouter.config.update",
      handler: async (input) => {
        const payload = input as {
          id: number;
          name?: string;
          description?: string;
          config?: Record<string, unknown>;
          actorId?: number;
        };
        if (typeof payload?.id !== "number") throw new Error("id is required");
        const { updateProfile } = await import("./routing-service");
        return updateProfile(
          payload.id,
          { name: payload.name, description: payload.description, config: payload.config },
          payload.actorId,
        );
      },
      descriptor: {
        key: "openRouter.config.update",
        description: "Update OpenRouter routing configuration",
        risk: "high",
        receiptRequired: true,
      },
    });
  },
};
