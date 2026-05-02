/**
 * AI Types — Internal route table (metadata).
 *
 * Capsule's `mod.tsx` renders `AITypesShell`, which does its own
 * dispatch via `useLocation()`. This file lists every canonical path
 * owned by AI Types so `check:module-route-inventory` can verify the
 * manifest's `routeInventory` matches the capsule's actual mount
 * surface.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const AITypesShell = lazy(() => import("./pages/AITypesShell"));

export interface AITypesRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const aiTypesRoutes: AITypesRouteEntry[] = [
  { path: "/ai-types/overview", component: AITypesShell, label: "Overview" },
  { path: "/ai-types/catalog", component: AITypesShell, label: "Catalog" },
  { path: "/ai-types/providers", component: AITypesShell, label: "Providers" },
  { path: "/ai-types/llms", component: AITypesShell, label: "LLMs" },
  { path: "/ai-types/models", component: AITypesShell, label: "Models" },
  { path: "/ai-types/agents", component: AITypesShell, label: "Agents" },
  { path: "/ai-types/bots", component: AITypesShell, label: "Bots" },
  { path: "/ai-types/taxonomy", component: AITypesShell, label: "Taxonomy" },
  { path: "/ai-types/relationships", component: AITypesShell, label: "Relationships" },
  { path: "/ai-types/validation", component: AITypesShell, label: "Validation" },
  { path: "/ai-types/governance", component: AITypesShell, label: "Governance" },
  { path: "/ai-types/control-panel", component: AITypesShell, label: "Control Panel" },
  { path: "/ai-types", component: AITypesShell, label: "AI Types" },
];
