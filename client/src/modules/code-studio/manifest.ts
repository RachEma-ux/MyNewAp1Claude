/**
 * Code Studio — Frontend Module Manifest (capsule shape).
 *
 * Code Studio is the fourth Module Client Capsule (after Communication
 * in PR #59, Data Analysis in PR #60, and PM Central in PR #61). The
 * manifest:
 *   - declares the canonical subtree (`/code-studio`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory` so AWI and
 *     `check:module-route-inventory` know the full surface
 *
 * Surfaces owned by Code Studio:
 *   - Dashboard, Jobs (incl. job detail), Templates, Sessions,
 *     Approvals, Repositories, Agents, Policies, Control Panel,
 *     OpenCode Settings, How To, AI Catalog.
 *
 * Boundary notes:
 *   - The legacy `/code` Monaco editor is a separate non-RTLM page
 *     and is NOT mounted by this capsule. It continues to be served
 *     directly from App.tsx.
 *   - Port reservations remain backend-mediated through the Port
 *     Registry lane. The capsule only renders status / control UI;
 *     the frontend never reaches into another module's registry.
 *   - Governance enforcement is owned by the backend Governance
 *     module. Code Studio surfaces the OpenCode runtime / TUI
 *     settings UI but does not import Governance internals.
 *
 * App.tsx no longer mounts Code Studio canonical pages. The capsule
 * renders via `<ModuleRoutes />` once `client.ts` registers this
 * manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const CodeStudioCapsule = lazy(() => import("./mod"));

export const codeStudioClientManifest: ClientModuleManifest = {
  key: "codeStudio",
  name: "Code Studio",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/code-studio",
  capsuleEntrypoint: CodeStudioCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/code-studio",
    "/code-studio/dashboard",
    "/code-studio/jobs",
    "/code-studio/jobs/:id",
    "/code-studio/templates",
    "/code-studio/sessions",
    "/code-studio/approvals",
    "/code-studio/repos",
    "/code-studio/agents",
    "/code-studio/ai-catalog",
    "/code-studio/policies",
    "/code-studio/control-panel",
    "/code-studio/opencode-settings",
    "/code-studio/how-to",
  ],
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  /* ---- Legacy field — empty for capsule modules ---- */
  // The composer ignores `routes[]` when `baseRoute + capsuleEntrypoint`
  // are present; we leave it empty to match the capsule shape.
  routes: [],

  navigation: [
    { group: "build", label: "Code Studio", order: 10 },
  ],
  requiredPermissions: ["codeStudio.read"],
};
