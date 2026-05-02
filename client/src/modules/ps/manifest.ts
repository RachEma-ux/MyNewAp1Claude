/**
 * Projects System (PS) — Frontend Module Manifest (capsule shape).
 *
 * PS is the fifth Module Client Capsule (after Communication PR #59,
 * Data Analysis PR #60, PM Central PR #61, and Code Studio PR #62).
 * The manifest:
 *   - declares the canonical subtree (`/ps`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory` so AWI and
 *     `check:module-route-inventory` know the full surface
 *
 * Surfaces owned by PS:
 *   - Catalog (default), Ideation (list, detail, convert),
 *     Control Panel, Wizard, List, AI Catalog.
 *
 * PS → PM Central boundary:
 *   - PS owns intake, ideation, classification, wizard execution,
 *     and PS project/system records.
 *   - PM Central owns delivery planning (projects/milestones/tasks/
 *     risks/issues/decisions/handoffs).
 *   - "Send to PM" is a backend handoff: PS UI calls only its own
 *     module router; PS backend then posts via Handoff Manager / PM
 *     Central public API. The PS frontend never reaches across the
 *     PM Central namespace directly.
 *
 * App.tsx no longer mounts PS canonical pages. The capsule renders
 * via `<ModuleRoutes />` once `client.ts` registers this manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const PSCapsule = lazy(() => import("./mod"));

export const psClientManifest: ClientModuleManifest = {
  key: "ps",
  name: "Projects System",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/ps",
  capsuleEntrypoint: PSCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/ps",
    "/ps/catalog",
    "/ps/ideation",
    "/ps/ideation/:id",
    "/ps/ideation/:id/convert",
    "/ps/control-panel",
    "/ps/wizard",
    "/ps/list",
    "/ps/ai-catalog",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  /* ---- Legacy field — empty for capsule modules ---- */
  // The composer ignores `routes[]` when `baseRoute + capsuleEntrypoint`
  // are present; we leave it empty to match the capsule shape.
  routes: [],

  navigation: [
    { group: "delivery", label: "Projects", order: 10 },
  ],
  requiredPermissions: ["ps.read"],
};
