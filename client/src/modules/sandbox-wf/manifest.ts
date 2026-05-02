/**
 * Sandbox Workflows — Frontend Module Manifest (capsule shape).
 *
 * Sandbox WF is the fourteenth Module Client Capsule. The manifest:
 *   - declares the canonical subtree (`/automation/sandbox-wf`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory`
 *
 * Sandbox WF owns three canonical paths:
 *   - `/automation/sandbox-wf` — workflow list (SandboxWFPage)
 *   - `/automation/sandbox-wf/new` — new workflow creator (WFCreationShell)
 *   - `/automation/sandbox-wf/:id` — workflow editor (WFCreationShell)
 *
 * Note: the capsule's baseRoute is `/automation/sandbox-wf`, NOT
 * `/automation`. The `/automation` subtree is shared with the legacy
 * AutomationBuilder page (`client/src/pages/AutomationBuilder.tsx`)
 * and other automation-namespaced routes. The capsule scopes itself
 * to the `/automation/sandbox-wf` prefix only so AutomationBuilder
 * stays unaffected.
 *
 * App.tsx no longer mounts Sandbox WF canonical pages. The capsule
 * renders via `<ModuleRoutes />` once `client.ts` registers this
 * manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const SandboxWfCapsule = lazy(() => import("./mod"));

export const sandboxWfClientManifest: ClientModuleManifest = {
  key: "sandboxWf",
  name: "Sandbox Workflows",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/automation/sandbox-wf",
  capsuleEntrypoint: SandboxWfCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/automation/sandbox-wf",
    "/automation/sandbox-wf/new",
    "/automation/sandbox-wf/:id",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  routes: [],

  navigation: [
    { group: "automation", label: "Sandbox WF", order: 50 },
  ],
  requiredPermissions: ["sandboxWf.read"],
};
