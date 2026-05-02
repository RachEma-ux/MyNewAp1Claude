/**
 * PRM — Frontend Module Manifest (capsule shape).
 *
 * PRM is the sixth Module Client Capsule. The manifest:
 *   - declares the canonical subtree (`/prm`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory` so AWI and
 *     `check:module-route-inventory` know the full surface
 *
 * Surfaces owned by PRM:
 *   - Dashboard, New Case, Cases (incl. case workspace detail),
 *     Methods Library, Playbooks, Catalog, AI Catalog,
 *     Control Panel.
 *
 * App.tsx no longer mounts PRM canonical pages. The capsule renders
 * via `<ModuleRoutes />` once `client.ts` registers this manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const PRMCapsule = lazy(() => import("./mod"));

export const prmClientManifest: ClientModuleManifest = {
  key: "prm",
  name: "PRM — Problem Resolution Methods",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/prm",
  capsuleEntrypoint: PRMCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/prm",
    "/prm/dashboard",
    "/prm/new",
    "/prm/cases",
    "/prm/cases/:id",
    "/prm/methods",
    "/prm/playbooks",
    "/prm/catalog",
    "/prm/ai-catalog",
    "/prm/control-panel",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "knowledge", label: "PRM", order: 30 },
  ],
  requiredPermissions: ["prm.read"],
};
