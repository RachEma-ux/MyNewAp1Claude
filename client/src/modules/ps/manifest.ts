/**
 * PS (Projects System) — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const PSShellPage = lazy(() => import("@/pages/projects-system/PSShellPage"));
const PSIdeationDetailPage = lazy(() => import("@/pages/projects-system/PSIdeationDetailPage"));
const PSIdeationConvertPage = lazy(() => import("@/pages/projects-system/PSIdeationConvertPage"));

export const psClientManifest: ClientModuleManifest = {
  key: "ps",
  name: "Projects System",
  routes: [
    { path: "/ps", label: "Projects", component: PSShellPage },
    { path: "/ps/catalog", label: "Catalog", component: PSShellPage },
    { path: "/ps/ideation", label: "Ideation", component: PSShellPage },
    { path: "/ps/ideation/:id", label: "Ideation Detail", component: PSIdeationDetailPage },
    { path: "/ps/ideation/:id/convert", label: "Convert Ideation", component: PSIdeationConvertPage },
    { path: "/ps/control-panel", label: "Control Panel", component: PSShellPage },
    { path: "/ps/wizard", label: "Wizard", component: PSShellPage },
    { path: "/ps/list", label: "List", component: PSShellPage },
  ],
  navigation: [{ group: "delivery", label: "Projects", order: 10 }],
  requiredPermissions: ["ps.read"],
};
