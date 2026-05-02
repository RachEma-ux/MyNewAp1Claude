/**
 * OpenRouter — Internal route table (metadata).
 *
 * Capsule's `mod.tsx` renders `OpenRouterShell`, which does its own
 * dispatch via `useLocation()`. This file lists every canonical path
 * owned by OpenRouter so `check:module-route-inventory` can verify
 * the manifest's `routeInventory` matches the capsule's actual mount
 * surface.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const OpenRouterShell = lazy(() => import("./components/OpenRouterShell"));

export interface OpenRouterRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const openRouterRoutes: OpenRouterRouteEntry[] = [
  { path: "/openrouter/connect", component: OpenRouterShell, label: "Connect" },
  { path: "/openrouter/models", component: OpenRouterShell, label: "Models" },
  { path: "/openrouter/routing", component: OpenRouterShell, label: "Routing" },
  { path: "/openrouter/guardrails", component: OpenRouterShell, label: "Guardrails" },
  { path: "/openrouter/playground", component: OpenRouterShell, label: "Playground" },
  { path: "/openrouter/usage", component: OpenRouterShell, label: "Usage" },
  { path: "/openrouter/health", component: OpenRouterShell, label: "Health" },
  { path: "/openrouter/activity", component: OpenRouterShell, label: "Activity" },
  { path: "/openrouter", component: OpenRouterShell, label: "OpenRouter" },
];
