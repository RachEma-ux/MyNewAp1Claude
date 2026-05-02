/**
 * Culture & Values — Frontend Module Manifest (capsule shape).
 *
 * CV is the tenth Module Client Capsule. The manifest:
 *   - declares the canonical subtree (`/cv`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory`
 *
 * CV mirrors OM: `CVTopLevelPage` is a single dispatcher that
 * switches on `useParams().item` to render Portfolio (default),
 * Wizard, or Settings. The capsule's `mod.tsx` mounts that
 * dispatcher for both `/cv` and `/cv/:item`.
 *
 * App.tsx no longer mounts CV canonical pages. The capsule renders
 * via `<ModuleRoutes />` once `client.ts` registers this manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const CVCapsule = lazy(() => import("./mod"));

export const cultureValuesClientManifest: ClientModuleManifest = {
  key: "cultureValues",
  name: "Culture & Values",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/cv",
  capsuleEntrypoint: CVCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/cv",
    "/cv/portfolio",
    "/cv/wizard",
    "/cv/settings",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "people", label: "Culture & Values", order: 30 },
  ],
  requiredPermissions: ["cultureValues.read"],
};
