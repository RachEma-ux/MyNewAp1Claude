/**
 * Provider Connections — Module Manifest
 *
 * Per Plan v3 Decision D3: Provider Connections is a manifested platform
 * infrastructure module, not RTLM #16. The 15-RTLM count stays at 15.
 *
 * Ownership split (D3 + D4):
 *   - AI Types          = provider/model catalog authority
 *   - Provider Connections = credential authority    ← THIS MODULE
 *   - OpenRouter        = execution / Model Access authority
 *   - Agent Studio      = binding consumer (no key custody)
 *
 * Owned tables (shared appdb): provider_connections, provider_secrets,
 * provider_audit_log. The `providers` table itself is not exclusively
 * owned by this module — it predates the modular refactor and is
 * touched by AI Types (catalog gate), Providers Hub, etc.
 *
 * Future stages will add:
 *   - Phase 2: public/internal surface split (public-api expanded,
 *     internal credential resolver added)
 *   - Phase 3: lint script restricting credential resolver imports to
 *     OpenRouter Model Access only
 */

import type { ModuleManifest } from "../platform/modules/types";
import { providerConnectionsRouter } from "./router";
import { okHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";

export const providerConnectionsManifest: ModuleManifest = {
  key: "providerConnections",
  name: "Provider Connections — Credential Lifecycle",
  version: "1.0.0",

  runtime: { mode: "shared", required: false },

  database: {
    kind: "shared",
    schema: "appdb",
    ownedTables: ["provider_connections", "provider_secrets", "provider_audit_log"],
  },

  router: providerConnectionsRouter,
  routerKey: "providerConnections",

  permissions: { keys: ["providerConnections.read", "providerConnections.write"] },

  // Receipt policy will be re-tiered against Plan v3 Phase 20. The
  // governance actions below are the lifecycle write actions that
  // already exist as governed tRPC procedures in router.ts.
  governanceActions: [
    {
      key: "providerConnections.validateAndStore",
      description: "Validate provider PAT and store encrypted secret",
      risk: "high",
      receiptRequired: true,
    },
    {
      key: "providerConnections.activate",
      description: "Activate a validated provider connection",
      risk: "medium",
      receiptRequired: false,
    },
    {
      key: "providerConnections.rotate",
      description: "Rotate the stored secret for a provider connection",
      risk: "high",
      receiptRequired: true,
    },
    {
      key: "providerConnections.disable",
      description: "Disable a provider connection",
      risk: "medium",
      receiptRequired: false,
    },
    {
      key: "providerConnections.delete",
      description: "Delete a provider connection and cascade its secrets",
      risk: "high",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/providers/connections", label: "Provider Connections" }],
  navigation: [{ group: "infrastructure", label: "Provider Connections", order: 30 }],

  health: async () => okHealth("Provider Connections ready"),

  publicApi: { path: "server/provider-connections/public-api.ts" },

  // Phase 1 declares no events emitted. Phase 2+ may add status events
  // (e.g. providerConnections.connection.activated) once subscribers
  // are committed in the same PR — per D9, no inert events.
  events: { emits: [] },

  // Ports declared:
  //   - providerConnections.read           — public read surface (no secrets)
  //   - providerConnections.credential     — internal credential resolver
  //                                          (gated to OpenRouter Model
  //                                          Access only — see Phase 3)
  ports: {
    provided: ["providerConnections.read", "providerConnections.credential"],
    consumed: [],
  },

  communication: { modes: ["port", "gateway"] },

  boot: async () => {
    registerModuleHealthAction(providerConnectionsManifest);
    // Phase 2 will register the public read actions
    // (listActiveForProvider / getConnectionStatus / validateConnection)
    // through registerPublicApi here. Phase 1 only ensures the module
    // is manifested; no new gateway actions are wired yet.
  },
};
