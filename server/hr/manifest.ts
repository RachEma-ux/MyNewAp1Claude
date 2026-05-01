/**
 * HR Module Manifest
 *
 * Currently shares the platform DB; planned target: dedicated hrdb.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { hrRouter } from "./router";
import { okHealth } from "../platform/modules/health";

export const hrManifest: ModuleManifest = {
  key: "hr",
  name: "HR — Human Resources",
  version: "1.0.0",

  runtime: { mode: "shared", required: false },

  database: { kind: "shared", schema: "appdb", ownedTables: ["hr_*"] },

  router: hrRouter,
  routerKey: "hr",

  permissions: { keys: ["hr.read", "hr.write"] },

  governanceActions: [
    {
      key: "hr.employee.create",
      description: "Create an HR employee record",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/hr", label: "HR" }],
  navigation: [{ group: "people", label: "HR", order: 10 }],

  health: async () => okHealth("HR ready"),

  publicApi: { path: "server/hr/public-api.ts" },
  events: { emits: ["hr.employee.created", "hr.assignment.changed"] },
  ports: { provided: ["hr.directory.read"], consumed: ["om.read"] },
  communication: { modes: ["port", "event"] },
};
