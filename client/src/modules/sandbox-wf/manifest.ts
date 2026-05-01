/**
 * Sandbox Workflows — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const SandboxWFPage = lazy(() => import("@/pages/automation/SandboxWFPage"));
const WFCreationShell = lazy(() => import("@/pages/automation/WFCreationShell"));

export const sandboxWfClientManifest: ClientModuleManifest = {
  key: "sandboxWf",
  name: "Sandbox Workflows",
  routes: [
    { path: "/automation/sandbox-wf", label: "Sandbox WF", component: SandboxWFPage },
    { path: "/automation/sandbox-wf/new", label: "New Workflow", component: WFCreationShell },
    { path: "/automation/sandbox-wf/:id", label: "Workflow Detail", component: WFCreationShell },
  ],
  navigation: [{ group: "automation", label: "Sandbox WF", order: 50 }],
  requiredPermissions: ["sandboxWf.read"],
};
