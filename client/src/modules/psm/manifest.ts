/**
 * PSM — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const PSMShellPage = lazy(() => import("@/pages/psm/PSMShellPage"));
const PSMCaseDetailPage = lazy(() => import("@/pages/psm/PSMCaseDetailPage"));
const PSMRunPage = lazy(() => import("@/pages/psm/PSMRunPage"));
const PSMMethodDetailPage = lazy(() => import("@/pages/psm/PSMMethodDetailPage"));

export const psmClientManifest: ClientModuleManifest = {
  key: "psm",
  name: "PSM — Problem Solving Methods",
  routes: [
    { path: "/psm", label: "PSM", component: PSMShellPage },
    { path: "/psm/dashboard", label: "PSM Dashboard", component: PSMShellPage },
    { path: "/psm/library", label: "PSM Library", component: PSMShellPage },
    { path: "/psm/selector", label: "PSM Selector", component: PSMShellPage },
    { path: "/psm/cases", label: "PSM Cases", component: PSMShellPage },
    { path: "/psm/cases/:id", label: "PSM Case", component: PSMCaseDetailPage },
    { path: "/psm/runs/:id", label: "PSM Run", component: PSMRunPage },
    { path: "/psm/methods/:id", label: "PSM Method", component: PSMMethodDetailPage },
    { path: "/psm/admin", label: "PSM Admin", component: PSMShellPage },
    { path: "/psm/analytics", label: "PSM Analytics", component: PSMShellPage },
  ],
  navigation: [{ group: "knowledge", label: "PSM", order: 20 }],
  requiredPermissions: ["psm.read"],
};
