/**
 * OpenRouter — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const OpenRouterShellPage = lazy(() => import("@/pages/openrouter/OpenRouterShellPage"));

export const openRouterClientManifest: ClientModuleManifest = {
  key: "openRouter",
  name: "OpenRouter — Unified Model Gateway",
  routes: [
    { path: "/openrouter", label: "OpenRouter", component: OpenRouterShellPage },
    { path: "/openrouter/connect", label: "Connect", component: OpenRouterShellPage },
    { path: "/openrouter/models", label: "Models", component: OpenRouterShellPage },
    { path: "/openrouter/routing", label: "Routing", component: OpenRouterShellPage },
    { path: "/openrouter/guardrails", label: "Guardrails", component: OpenRouterShellPage },
    { path: "/openrouter/playground", label: "Playground", component: OpenRouterShellPage },
    { path: "/openrouter/usage", label: "Usage", component: OpenRouterShellPage },
    { path: "/openrouter/health", label: "Health", component: OpenRouterShellPage },
    { path: "/openrouter/activity", label: "Activity", component: OpenRouterShellPage },
  ],
  navigation: [{ group: "infrastructure", label: "OpenRouter", order: 20 }],
  requiredPermissions: ["openRouter.read"],
};
