/**
 * Culture Values (CV) Module Manifest
 */

import type { ModuleManifest } from "../platform/modules/types";
import { cultureValuesRouter } from "./router";
import { okHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { registerPublicApi } from "../platform/modules/module-gateway";

export const cvManifest: ModuleManifest = {
  key: "cultureValues",
  name: "Culture Values",
  version: "1.0.0",

  runtime: { mode: "shared", required: false },

  database: { kind: "shared", schema: "appdb", ownedTables: ["cv_*", "culture_values_*"] },

  router: cultureValuesRouter,
  routerKey: "cultureValues",

  permissions: { keys: ["cv.read", "cv.write"] },

  governanceActions: [
    {
      key: "cv.value.publish",
      description: "Publish a culture value",
      risk: "low",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/culture", label: "Culture" }],
  navigation: [{ group: "people", label: "Culture", order: 12 }],

  health: async () => okHealth("CV ready"),

  publicApi: { path: "server/culture-values/public-api.ts" },
  events: { emits: ["cv.value.published"] },
  ports: { provided: ["cv.read"], consumed: [] },
  communication: { modes: ["port", "event"] },
  boot: async () => {
    registerModuleHealthAction(cvManifest);

    // Public-API: cv.value.publish — publish a CV value set.
    // Validates lifecycle transition + publish-readiness, deprecates
    // currently-active sets, then activates the target. Receipt
    // required per manifest; gateway enforces.
    registerPublicApi({
      module: "cultureValues",
      action: "cv.value.publish",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          id?: number;
          actorId?: number;
        };
        if (
          typeof payload?.workspaceId !== "number" ||
          typeof payload?.id !== "number"
        ) {
          throw new Error("workspaceId and id are required");
        }
        const { publishValueSet } = await import("./service");
        return publishValueSet(
          { workspaceId: payload.workspaceId, id: payload.id },
          payload.actorId,
        );
      },
      descriptor: {
        key: "cv.value.publish",
        description: "Publish a culture value",
        risk: "low",
        receiptRequired: true,
      },
    });
  },
};
