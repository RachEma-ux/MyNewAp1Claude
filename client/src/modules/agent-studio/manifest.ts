/**
 * Agent Studio — Frontend Module Manifest (capsule shape).
 *
 * Agent Studio is the thirteenth Module Client Capsule. The
 * manifest:
 *   - declares the canonical subtree (`/agent-studio`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory`
 *
 * Agent Studio uses an in-capsule `AgentStudioShell` that drives an
 * S1 sidebar + top action bar + right oversight drawer + bottom
 * status bar, and dispatches to one of ~20 views by parsing
 * `useLocation()` (home, new, templates, import, catalog/skills,
 * catalog/tools, marketplace, mcp-manager, plus per-agent: overview,
 * identity, behavior, prompts, tools, knowledge, memory, workflows,
 * governance, simulation, testing, runs, versions, publish, runtime,
 * hooks, mcp, subagents, chat).
 *
 * App.tsx no longer mounts Agent Studio canonical pages. The capsule
 * renders via `<ModuleRoutes />` once `client.ts` registers this
 * manifest. App.tsx still mounts an `AgentStudioChatFAB` overlay
 * that imports `AgentStudioChatWindow` through the capsule's public
 * `index.ts` so the chat window stays available across all
 * `/agent-studio/*` routes — the public-export path keeps it
 * boundary-clean.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const AgentStudioCapsule = lazy(() => import("./mod"));

export const agentStudioClientManifest: ClientModuleManifest = {
  key: "agentStudio",
  name: "Agent Studio",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/agent-studio",
  capsuleEntrypoint: AgentStudioCapsule,
  layoutMode: "inside-main-layout",
  // The two literal `/catalog/skills` and `/catalog/tools` paths
  // are also advertised in `nav.ts`. Listing them explicitly here
  // alongside the parametrized `/catalog/:section` form pins what
  // the nav promises at the manifest level so route-ownership
  // tooling can verify nav→inventory coverage without inferring
  // the `:section` match.
  routeInventory: [
    "/agent-studio",
    "/agent-studio/new",
    "/agent-studio/templates",
    "/agent-studio/import",
    "/agent-studio/catalog",
    "/agent-studio/catalog/skills",
    "/agent-studio/catalog/tools",
    "/agent-studio/catalog/:section",
    "/agent-studio/marketplace",
    "/agent-studio/mcp-manager",
    "/agent-studio/graph-workspace",
    "/agent-studio/vault-explorer",
    "/agent-studio/vault-notes",
    "/agent-studio/vault-graph",
    "/agent-studio/vault-impact",
    "/agent-studio/vault-traces",
    // V1+ 15-δ / 16-δ / 17-γ / 18-γ / MR-1 Phase-2 / 17-closure
    // admin pages all dispatch off path-match in the Shell. The
    // manifest needs to list them so the route-ownership tooling
    // doesn't flag them as undeclared.
    "/agent-studio/vault-attachments",
    "/agent-studio/vault-saved-views",
    "/agent-studio/canvas-projection-events-drain",
    "/agent-studio/canvas-operator",
    "/agent-studio/region-admin",
    "/agent-studio/extensions-admin",
    "/agent-studio/approval-bus-admin",
    "/agent-studio/publish-targets-admin",
    "/agent-studio/graph-health-admin",
    "/agent-studio/bases-admin",
    "/agent-studio/:agentId",
    "/agent-studio/:agentId/:section",
    "/agent-studio/:agentId/runs/:runId",
    "/agent-studio/:agentId/versions/compare",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "build", label: "Agent Studio", order: 20 },
  ],
  requiredPermissions: ["agentStudio.read"],
};
