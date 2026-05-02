/**
 * OpenRouter — Frontend Module Manifest (capsule shape).
 *
 * OpenRouter is the twelfth Module Client Capsule. The manifest:
 *   - declares the canonical subtree (`/openrouter`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory`
 *
 * OpenRouter uses an in-capsule `OpenRouterShell` that drives an S1
 * sidebar and dispatches to one of nine views by `useLocation()`
 * prefix:
 *   - home (default for bare /openrouter)
 *   - connect, models, routing, guardrails, playground, usage,
 *     health, activity
 *
 * App.tsx no longer mounts OpenRouter canonical pages. The capsule
 * renders via `<ModuleRoutes />` once `client.ts` registers this
 * manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const OpenRouterCapsule = lazy(() => import("./mod"));

export const openRouterClientManifest: ClientModuleManifest = {
  key: "openRouter",
  name: "OpenRouter — Unified Model Gateway",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/openrouter",
  capsuleEntrypoint: OpenRouterCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/openrouter",
    "/openrouter/connect",
    "/openrouter/models",
    "/openrouter/routing",
    "/openrouter/guardrails",
    "/openrouter/playground",
    "/openrouter/usage",
    "/openrouter/health",
    "/openrouter/activity",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "infrastructure", label: "OpenRouter", order: 20 },
  ],
  requiredPermissions: ["openRouter.read"],
};
