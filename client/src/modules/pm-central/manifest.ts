/**
 * PM Central — Frontend Module Manifest (capsule shape).
 *
 * PM Central is the third Module Client Capsule (after Communication
 * in PR #59 and Data Analysis in PR #60). The manifest:
 *   - declares the canonical subtree (`/pm`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory` so AWI and
 *     `check:module-route-inventory` know the full surface
 *
 * Subdomains owned by PM Central:
 *   - Dashboard, Projects (incl. project detail), Tasks,
 *     Milestones, Risks, Issues, Decisions, Handoffs, Settings.
 *
 * Canonical baseRoute migration in this PR:
 *   - Before: PM Central RTLM was canonical at `/pm-central/rtlm/*`,
 *     with a legacy non-RTLM shell at `/pm-central/*`.
 *   - After:  PM Central RTLM is canonical at `/pm/*`. The
 *     `/pm-central/rtlm/*` paths become compatibility redirects
 *     (declared below; rendered by App.tsx as `<Redirect>` shims).
 *     The legacy non-RTLM `/pm-central/*` shell stays unchanged —
 *     it serves PMCentralShellPage and is a separate surface, not
 *     a PM Central RTLM route. `check:app-route-ownership` uses the
 *     manifest baseRoute (`/pm`) for its canonical-prefix test, so
 *     legacy `/pm-central/*` shell mounts are not flagged as
 *     pmCentral canonical violations.
 *
 * PS → PM Central boundary:
 *   - Projects System (`ps`) is a separate RTLM. PS does not write
 *     PM Central data. PS → PM Central is a backend handoff; the
 *     frontend never reaches across the PS namespace from inside
 *     PM Central, and PM Central does not import PS pages.
 *
 * App.tsx no longer mounts PM Central canonical pages. The capsule
 * renders via `<ModuleRoutes />` once `client.ts` registers this
 * manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const PMCentralCapsule = lazy(() => import("./mod"));

export const pmCentralClientManifest: ClientModuleManifest = {
  key: "pmCentral",
  name: "PM Central",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/pm",
  capsuleEntrypoint: PMCentralCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/pm",
    "/pm/projects",
    "/pm/projects/:id",
    "/pm/tasks",
    "/pm/milestones",
    "/pm/risks",
    "/pm/issues",
    "/pm/decisions",
    "/pm/handoffs",
    "/pm/settings",
  ],
  compatibilityRoutes: [
    {
      from: "/pm-central/rtlm",
      to: "/pm",
      reason: "legacy RTLM-namespaced canonical (pre-/pm migration)",
    },
    {
      from: "/pm-central/rtlm/projects",
      to: "/pm/projects",
      reason: "legacy RTLM-namespaced canonical (pre-/pm migration)",
    },
    {
      from: "/pm-central/rtlm/tasks",
      to: "/pm/tasks",
      reason: "legacy RTLM-namespaced canonical (pre-/pm migration)",
    },
    {
      from: "/pm-central/rtlm/milestones",
      to: "/pm/milestones",
      reason: "legacy RTLM-namespaced canonical (pre-/pm migration)",
    },
    {
      from: "/pm-central/rtlm/risks",
      to: "/pm/risks",
      reason: "legacy RTLM-namespaced canonical (pre-/pm migration)",
    },
    {
      from: "/pm-central/rtlm/issues",
      to: "/pm/issues",
      reason: "legacy RTLM-namespaced canonical (pre-/pm migration)",
    },
    {
      from: "/pm-central/rtlm/decisions",
      to: "/pm/decisions",
      reason: "legacy RTLM-namespaced canonical (pre-/pm migration)",
    },
    {
      from: "/pm-central/rtlm/handoffs",
      to: "/pm/handoffs",
      reason: "legacy RTLM-namespaced canonical (pre-/pm migration)",
    },
    {
      from: "/pm-central/rtlm/settings",
      to: "/pm/settings",
      reason: "legacy RTLM-namespaced canonical (pre-/pm migration)",
    },
  ],
  deprecatedRoutes: [],

  /* ---- Legacy field — empty for capsule modules ---- */
  // The composer ignores `routes[]` when `baseRoute + capsuleEntrypoint`
  // are present; we leave it empty to match the capsule shape.
  routes: [],

  navigation: [
    { group: "pmCentral", label: "PM Central", order: 4 },
  ],
  requiredPermissions: ["pm.read"],
};
