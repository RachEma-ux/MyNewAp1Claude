/**
 * PSM — Frontend Module Manifest (capsule shape).
 *
 * PSM is the seventh Module Client Capsule. The manifest:
 *   - declares the canonical subtree (`/psm`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory` so AWI and
 *     `check:module-route-inventory` know the full surface
 *
 * Surfaces owned by PSM:
 *   - Dashboard, Method Library, Selector, Cases (incl. case detail),
 *     Method detail, Run detail, Admin, Analytics, AI Catalog.
 *
 * App.tsx no longer mounts PSM canonical pages. The capsule renders
 * via `<ModuleRoutes />` once `client.ts` registers this manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const PSMCapsule = lazy(() => import("./mod"));

export const psmClientManifest: ClientModuleManifest = {
  key: "psm",
  name: "PSM — Problem Solving Methods",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/psm",
  capsuleEntrypoint: PSMCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/psm",
    "/psm/dashboard",
    "/psm/library",
    "/psm/selector",
    "/psm/cases",
    "/psm/cases/:id",
    "/psm/methods/:id",
    "/psm/runs/:id",
    "/psm/admin",
    "/psm/analytics",
    "/psm/ai-catalog",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "knowledge", label: "PSM", order: 20 },
  ],
  requiredPermissions: ["psm.read"],
};
