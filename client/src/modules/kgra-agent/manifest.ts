/**
 * KGRA Agent — Frontend Module Manifest (capsule shape).
 *
 * KGRA Agent is the fifteenth and FINAL Module Client Capsule. The
 * manifest:
 *   - declares the canonical subtree (`/data-analysis/kgra-agent`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists the canonical path under `routeInventory`
 *
 * Note: the capsule's baseRoute is `/data-analysis/kgra-agent`, NOT
 * `/data-analysis`. KGRA Agent's UI lives at this path for
 * historical reasons but the RTLM is separate from Data Analysis;
 * Data Analysis (PR #60) explicitly left the KGRA route alone so
 * it could migrate as its own capsule (this PR). The capsule scopes
 * itself to the `/data-analysis/kgra-agent` prefix only so Data
 * Analysis stays unaffected — same sub-prefix-inside-shared-parent
 * pattern as Sandbox WF (PR #74, `/automation/sandbox-wf` inside
 * `/automation`).
 *
 * App.tsx no longer mounts the KGRA Agent canonical page. The
 * capsule renders via `<ModuleRoutes />` once `client.ts` registers
 * this manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const KgraAgentCapsule = lazy(() => import("./mod"));

export const kgraAgentClientManifest: ClientModuleManifest = {
  key: "kgraAgent",
  name: "KGRA — Knowledge Graph Reasoning Agent",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/data-analysis/kgra-agent",
  capsuleEntrypoint: KgraAgentCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/data-analysis/kgra-agent",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "intelligence", label: "KGRA Agent", order: 30 },
  ],
  requiredPermissions: ["kgraAgent.read"],
};
