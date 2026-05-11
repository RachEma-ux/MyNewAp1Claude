/**
 * Agent Studio — Internal route table (metadata).
 *
 * Capsule's `mod.tsx` renders `AgentStudioShell`, which does its own
 * view dispatch by regex-parsing `useLocation()`. This file lists
 * every canonical path owned by Agent Studio so
 * `check:module-route-inventory` can verify the manifest's
 * `routeInventory` matches the capsule's actual mount surface.
 *
 * Order mirrors the App.tsx mount order before migration: literal
 * sub-routes first (so wouter pattern matching prefers them), then
 * the deeper :agentId/runs/:runId and :agentId/versions/compare
 * patterns, then the generic :agentId/:section and :agentId fallbacks,
 * then bare /agent-studio.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const AgentStudioShell = lazy(() => import("./components/AgentStudioShell"));

export interface AgentStudioRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const agentStudioRoutes: AgentStudioRouteEntry[] = [
  { path: "/agent-studio/new", component: AgentStudioShell, label: "New Agent" },
  { path: "/agent-studio/templates", component: AgentStudioShell, label: "Templates" },
  { path: "/agent-studio/import", component: AgentStudioShell, label: "Import" },
  { path: "/agent-studio/catalog/:section", component: AgentStudioShell, label: "Catalog Section" },
  { path: "/agent-studio/catalog", component: AgentStudioShell, label: "Catalog" },
  { path: "/agent-studio/marketplace", component: AgentStudioShell, label: "Marketplace" },
  { path: "/agent-studio/graph-workspace", component: AgentStudioShell, label: "Graph Workspace" },
  { path: "/agent-studio/:agentId/runs/:runId", component: AgentStudioShell, label: "Agent Run Detail" },
  { path: "/agent-studio/:agentId/versions/compare", component: AgentStudioShell, label: "Versions Compare" },
  { path: "/agent-studio/:agentId/:section", component: AgentStudioShell, label: "Agent Section" },
  { path: "/agent-studio/:agentId", component: AgentStudioShell, label: "Agent Detail" },
  { path: "/agent-studio", component: AgentStudioShell, label: "Agent Studio" },
];
