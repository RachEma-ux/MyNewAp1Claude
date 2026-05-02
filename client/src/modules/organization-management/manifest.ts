/**
 * Organization Management — Frontend Module Manifest (capsule shape).
 *
 * OM is the ninth Module Client Capsule. The manifest:
 *   - declares the canonical subtree (`/om`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory`
 *
 * OM uses a single `OMTopLevelPage` dispatcher that switches on
 * `useParams().item` to render Portfolio (default), Control Panel,
 * Wizard, List, Settings, or Templates. The capsule's `mod.tsx`
 * mounts that dispatcher for both `/om` and `/om/:item`.
 *
 * App.tsx no longer mounts OM canonical pages. The capsule renders
 * via `<ModuleRoutes />` once `client.ts` registers this manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const OMCapsule = lazy(() => import("./mod"));

export const organizationManagementClientManifest: ClientModuleManifest = {
  key: "organizationManagement",
  name: "Organization Management",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/om",
  capsuleEntrypoint: OMCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/om",
    "/om/portfolio",
    "/om/control-panel",
    "/om/wizard",
    "/om/list",
    "/om/settings",
    "/om/templates",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "people", label: "Organization", order: 20 },
  ],
  requiredPermissions: ["organizationManagement.read"],
};
