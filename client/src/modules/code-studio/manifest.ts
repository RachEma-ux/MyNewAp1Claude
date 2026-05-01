/**
 * Code Studio — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const CodeStudioShellPage = lazy(() => import("@/pages/code-studio/CodeStudioShellPage"));

export const codeStudioClientManifest: ClientModuleManifest = {
  key: "codeStudio",
  name: "Code Studio",
  routes: [
    { path: "/code-studio", label: "Code Studio", component: CodeStudioShellPage },
    { path: "/code-studio/dashboard", label: "Dashboard", component: CodeStudioShellPage },
    { path: "/code-studio/jobs", label: "Jobs", component: CodeStudioShellPage },
    { path: "/code-studio/jobs/:id", label: "Job Detail", component: CodeStudioShellPage },
    { path: "/code-studio/templates", label: "Templates", component: CodeStudioShellPage },
    { path: "/code-studio/sessions", label: "Sessions", component: CodeStudioShellPage },
    { path: "/code-studio/approvals", label: "Approvals", component: CodeStudioShellPage },
    { path: "/code-studio/repos", label: "Repos", component: CodeStudioShellPage },
    { path: "/code-studio/agents", label: "Agents", component: CodeStudioShellPage },
    { path: "/code-studio/policies", label: "Policies", component: CodeStudioShellPage },
    { path: "/code-studio/control-panel", label: "Control Panel", component: CodeStudioShellPage },
  ],
  navigation: [{ group: "build", label: "Code Studio", order: 10 }],
  requiredPermissions: ["codeStudio.read"],
};
