/**
 * Agent Studio — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const AgentStudioShellPage = lazy(() => import("@/pages/agent-studio/AgentStudioShellPage"));

export const agentStudioClientManifest: ClientModuleManifest = {
  key: "agentStudio",
  name: "Agent Studio",
  routes: [
    { path: "/agent-studio", label: "Agent Studio", component: AgentStudioShellPage },
    { path: "/agent-studio/new", label: "New Agent", component: AgentStudioShellPage },
    { path: "/agent-studio/templates", label: "Templates", component: AgentStudioShellPage },
    { path: "/agent-studio/import", label: "Import", component: AgentStudioShellPage },
    { path: "/agent-studio/catalog", label: "Catalog", component: AgentStudioShellPage },
    { path: "/agent-studio/marketplace", label: "Marketplace", component: AgentStudioShellPage },
    { path: "/agent-studio/:agentId", label: "Agent Detail", component: AgentStudioShellPage },
  ],
  navigation: [{ group: "build", label: "Agent Studio", order: 20 }],
  requiredPermissions: ["agentStudio.read"],
};
