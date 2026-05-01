/**
 * PRM — Frontend Module Manifest
 *
 * Mirrors the canonical PRM routes that exist in App.tsx. App.tsx remains
 * the runtime authority during compatibility mode (Switch picks the first
 * match), so this manifest is additive metadata: it contributes nav
 * entries and documents which routes belong to PRM, but does not hijack
 * existing routing.
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const PRMShellPage = lazy(() => import("@/pages/prm/PRMShellPage"));
const PRMCaseWorkspacePage = lazy(() => import("@/pages/prm/PRMCaseWorkspacePage"));

export const prmClientManifest: ClientModuleManifest = {
  key: "prm",
  name: "PRM — Problem Resolution Methods",
  routes: [
    { path: "/prm", label: "PRM", component: PRMShellPage },
    { path: "/prm/dashboard", label: "PRM Dashboard", component: PRMShellPage },
    { path: "/prm/cases", label: "PRM Cases", component: PRMShellPage },
    { path: "/prm/cases/:id", label: "PRM Case", component: PRMCaseWorkspacePage },
    { path: "/prm/methods", label: "PRM Methods", component: PRMShellPage },
    { path: "/prm/playbooks", label: "PRM Playbooks", component: PRMShellPage },
    { path: "/prm/catalog", label: "PRM Catalog", component: PRMShellPage },
    { path: "/prm/control-panel", label: "PRM Control Panel", component: PRMShellPage },
  ],
  navigation: [{ group: "knowledge", label: "PRM", order: 30 }],
  requiredPermissions: ["prm.read"],
};
