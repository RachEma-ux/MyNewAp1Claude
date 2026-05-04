/**
 * AI Types Module Manifest
 *
 * AI Types is platform-core: it is the canonical catalog. It is registered
 * as a module so the registry tracks it, but its DB is the platform `appdb`
 * (catalog tables) — not a module-owned DB.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { aiTypesRouter } from "./router";
import { okHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { registerPublicApi } from "../platform/modules/module-gateway";

export const aiTypesManifest: ModuleManifest = {
  key: "aiTypes",
  name: "AI Types — Catalog",
  version: "1.0.0",

  runtime: { mode: "shared", required: true },

  database: {
    kind: "shared",
    schema: "appdb",
    ownedTables: ["catalog_entries", "ai_type_models", "ai_type_llms"],
  },

  router: aiTypesRouter,
  routerKey: "aiTypes",

  permissions: { keys: ["aiTypes.read", "aiTypes.write", "aiTypes.publish"] },

  governanceActions: [
    {
      key: "aiTypes.catalog.publish",
      description: "Publish a catalog entry",
      risk: "high",
      receiptRequired: true,
    },
    // Plan v3 Phase 7: read-only catalog availability surface used by
    // Agent Studio + OpenRouter when constructing provider/model
    // bindings. No credentials returned.
    {
      key: "aiTypes.providerModels.listAvailable",
      description:
        "List provider/model pairs available for binding (no credentials)",
      risk: "low",
      receiptRequired: false,
    },
  ],

  routes: [{ path: "/ai-types", label: "AI Types" }],
  navigation: [{ group: "infrastructure", label: "AI Types", order: 10 }],

  boot: async () => {
    registerModuleHealthAction(aiTypesManifest);
    const { bootAiTypesModule } = await import("./boot");
    bootAiTypesModule();

    // Public-API: aiTypes.catalog.publish — produces a new immutable
    // publish bundle for a catalog entry, supersedes the prior
    // active bundle, flips entry status to "published", and writes
    // a catalog audit event. High-risk + receipt-required per
    // manifest; gateway enforces the receipt before invoking.
    registerPublicApi({
      module: "aiTypes",
      action: "aiTypes.catalog.publish",
      handler: async (input) => {
        const payload = input as {
          catalogEntryId?: number;
          publishedBy?: number;
          versionLabel?: string;
          policyDecision?: string;
        };
        if (typeof payload?.catalogEntryId !== "number") {
          throw new Error("catalogEntryId is required");
        }
        if (typeof payload?.publishedBy !== "number") {
          throw new Error("publishedBy is required");
        }
        const { publishCatalogEntry } = await import("./publishing");
        return publishCatalogEntry({
          catalogEntryId: payload.catalogEntryId,
          publishedBy: payload.publishedBy,
          versionLabel: payload.versionLabel,
          policyDecision: payload.policyDecision,
        });
      },
      descriptor: {
        key: "aiTypes.catalog.publish",
        description: "Publish a catalog entry",
        risk: "high",
        receiptRequired: true,
      },
    });

    // Plan v3 Phase 7: aiTypes.providerModels.listAvailable.
    // Returns the set of provider+model pairs that are catalog-
    // approved (status=active, reviewState=approved, not frozen)
    // for binding selection. Joined with Provider Connections
    // active-set (Phase 8) at the call site.
    registerPublicApi({
      module: "aiTypes",
      action: "aiTypes.providerModels.listAvailable",
      handler: async (input) => {
        const { listAvailableProviderModels } = await import(
          "./provider-models-availability"
        );
        const payload = (input ?? {}) as Parameters<
          typeof listAvailableProviderModels
        >[0];
        return listAvailableProviderModels(payload);
      },
      descriptor: {
        key: "aiTypes.providerModels.listAvailable",
        description:
          "List provider/model pairs available for binding (no credentials)",
        risk: "low",
        receiptRequired: false,
      },
    });
  },

  health: async () => okHealth("AI Types ready"),

  publicApi: { path: "server/ai-types/public-api.ts" },
  events: { emits: ["aiTypes.catalog.published", "aiTypes.catalog.deprecated"] },
  ports: { provided: ["aiTypes.catalog"], consumed: [] },
  communication: { modes: ["port", "event"] },
};
