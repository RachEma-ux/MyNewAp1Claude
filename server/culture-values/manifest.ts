/**
 * Culture Values (CV) Module Manifest
 */

import type { ModuleManifest } from "../platform/modules/types";
import { cultureValuesRouter } from "./router";
import { okHealth } from "../platform/modules/health";

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
};
