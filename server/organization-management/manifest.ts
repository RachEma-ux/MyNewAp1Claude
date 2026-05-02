/**
 * Organization Management (OM) Module Manifest
 */

import type { ModuleManifest } from "../platform/modules/types";
import { organizationManagementRouter } from "./router";
import { okHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { registerPublicApi } from "../platform/modules/module-gateway";

export const omManifest: ModuleManifest = {
  key: "organizationManagement",
  name: "Organization Management",
  version: "1.0.0",

  runtime: { mode: "shared", required: false },

  database: { kind: "shared", schema: "appdb", ownedTables: ["om_*"] },

  router: organizationManagementRouter,
  routerKey: "organizationManagement",

  permissions: { keys: ["om.read", "om.write"] },

  governanceActions: [
    {
      key: "om.entity.create",
      description: "Create an OM entity",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "om.position.assign",
      description: "Assign a position",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/om", label: "Organization" }],
  navigation: [{ group: "people", label: "Organization", order: 11 }],

  boot: async (ctx) => {
    registerModuleHealthAction(omManifest);

    // Public-API: om.entity.create — create a legal entity (the
    // canonical OM org-entity). Receipt required per manifest.
    registerPublicApi({
      module: "organizationManagement",
      action: "om.entity.create",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          code?: string;
          name?: string;
          type?: "company" | "subsidiary" | "branch" | "holding";
          parentEntityId?: number;
          country?: string;
          registrationNumber?: string;
          metadata?: Record<string, unknown>;
          actorId?: number;
        };
        if (
          typeof payload?.workspaceId !== "number" ||
          !payload?.code ||
          !payload?.name
        ) {
          throw new Error("workspaceId, code, name are required");
        }
        const { createLegalEntity } = await import("./service");
        const { actorId, ...rest } = payload;
        return createLegalEntity(
          rest as Parameters<typeof createLegalEntity>[0],
          actorId,
        );
      },
      descriptor: {
        key: "om.entity.create",
        description: "Create an OM entity",
        risk: "medium",
        receiptRequired: true,
      },
    });

    // Public-API: om.position.assign — reassign a position to an
    // org unit. Validates ref + non-frozen + operability and audit-
    // logs `position.reassign_org_unit`. Receipt required.
    registerPublicApi({
      module: "organizationManagement",
      action: "om.position.assign",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          positionId?: number;
          orgUnitId?: number;
          actorId?: number;
        };
        if (
          typeof payload?.workspaceId !== "number" ||
          typeof payload?.positionId !== "number" ||
          typeof payload?.orgUnitId !== "number"
        ) {
          throw new Error(
            "workspaceId, positionId, orgUnitId are required",
          );
        }
        const { assignPositionToOrgUnit } = await import("./service");
        return assignPositionToOrgUnit(
          {
            workspaceId: payload.workspaceId,
            positionId: payload.positionId,
            orgUnitId: payload.orgUnitId,
          },
          payload.actorId,
        );
      },
      descriptor: {
        key: "om.position.assign",
        description: "Assign a position",
        risk: "medium",
        receiptRequired: true,
      },
    });

    try {
      const { seedOmTemplates } = await import("./seed-templates");
      const result = await seedOmTemplates();
      if (result.created > 0) {
        ctx.log("info", `seeded ${result.created} new templates (${result.skipped} existing)`);
      }
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
  },

  health: async () => okHealth("OM ready"),

  publicApi: { path: "server/organization-management/public-api.ts" },
  events: { emits: ["om.entity.created", "om.assignment.changed"] },
  ports: { provided: ["om.read"], consumed: [] },
  communication: { modes: ["port", "gateway", "event"] },
};
