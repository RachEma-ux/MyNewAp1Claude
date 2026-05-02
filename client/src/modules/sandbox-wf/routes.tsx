/**
 * Sandbox WF — Internal route table (metadata).
 *
 * Capsule's `mod.tsx` does the actual route dispatch via a Wouter
 * `<Switch>`. This file lists every canonical path owned by Sandbox
 * WF so `check:module-route-inventory` can verify the manifest's
 * `routeInventory` matches the capsule's actual mount surface.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const SandboxWFPage = lazy(() => import("./pages/SandboxWFPage"));
const WFCreationShell = lazy(() => import("./pages/WFCreationShell"));

export interface SandboxWfRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const sandboxWfRoutes: SandboxWfRouteEntry[] = [
  { path: "/automation/sandbox-wf/new", component: WFCreationShell, label: "New Workflow" },
  { path: "/automation/sandbox-wf/:id", component: WFCreationShell, label: "Workflow Editor" },
  { path: "/automation/sandbox-wf", component: SandboxWFPage, label: "Sandbox WF" },
];
