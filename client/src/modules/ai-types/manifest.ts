/**
 * AI Types — Frontend Module Manifest (capsule shape).
 *
 * AI Types is the eleventh Module Client Capsule. The manifest:
 *   - declares the canonical subtree (`/ai-types`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory`
 *
 * AI Types uses an in-capsule `AITypesShell` that drives an S1
 * sidebar and dispatches to one of seven views by `useLocation()`
 * prefix:
 *   - overview (default for bare /ai-types)
 *   - catalog (covers /catalog, /providers, /llms, /models,
 *     /agents, /bots — all share the AITypesPage catalog component)
 *   - taxonomy
 *   - relationships
 *   - validation
 *   - governance
 *   - control-panel
 *
 * App.tsx no longer mounts AI Types canonical pages. The capsule
 * renders via `<ModuleRoutes />` once `client.ts` registers this
 * manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const AITypesCapsule = lazy(() => import("./mod"));

export const aiTypesClientManifest: ClientModuleManifest = {
  key: "aiTypes",
  name: "AI Types",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/ai-types",
  capsuleEntrypoint: AITypesCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/ai-types",
    "/ai-types/overview",
    "/ai-types/catalog",
    "/ai-types/providers",
    "/ai-types/llms",
    "/ai-types/models",
    "/ai-types/agents",
    "/ai-types/bots",
    "/ai-types/taxonomy",
    "/ai-types/relationships",
    "/ai-types/validation",
    "/ai-types/governance",
    "/ai-types/control-panel",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "infrastructure", label: "AI Types", order: 10 },
  ],
  requiredPermissions: ["aiTypes.read"],
};
