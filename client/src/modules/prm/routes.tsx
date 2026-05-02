/**
 * PRM — Internal route table (metadata).
 *
 * PRM's `PRMShell` already does view-based internal routing off
 * `useLocation()`. The capsule's `mod.tsx` dispatches `/prm/cases/:id`
 * to its dedicated page WITHOUT the shell to preserve the case
 * workspace's full-page UX, and falls through to `<PRMShell />` for
 * everything else.
 *
 * This file exists primarily as METADATA: it lists every canonical
 * path owned by PRM so `check:module-route-inventory` can verify the
 * manifest's `routeInventory` matches the capsule's actual mount
 * surface.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const PRMDashboardPage = lazy(() => import("./pages/PRMDashboardPage"));
const PRMNewCasePage = lazy(() => import("./pages/PRMNewCasePage"));
const PRMCaseListPage = lazy(() => import("./pages/PRMCaseListPage"));
const PRMCaseWorkspacePage = lazy(() => import("./pages/PRMCaseWorkspacePage"));
const PRMMethodsLibraryPage = lazy(() => import("./pages/PRMMethodsLibraryPage"));
const PRMPlaybooksPage = lazy(() => import("./pages/PRMPlaybooksPage"));
const PRMCatalogPage = lazy(() => import("./pages/PRMCatalogPage"));
const PRMAICatalogPage = lazy(() => import("./pages/PRMAICatalogPage"));
const PRMControlPanelPage = lazy(() => import("./pages/PRMControlPanelPage"));

export interface PRMRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const prmRoutes: PRMRouteEntry[] = [
  // Specific paths first.
  { path: "/prm/cases/:id", component: PRMCaseWorkspacePage, label: "Case" },
  { path: "/prm/cases", component: PRMCaseListPage, label: "Cases" },
  { path: "/prm/new", component: PRMNewCasePage, label: "New Case" },
  { path: "/prm/methods", component: PRMMethodsLibraryPage, label: "Methods" },
  { path: "/prm/playbooks", component: PRMPlaybooksPage, label: "Playbooks" },
  { path: "/prm/catalog", component: PRMCatalogPage, label: "Catalog" },
  { path: "/prm/ai-catalog", component: PRMAICatalogPage, label: "AI Catalog" },
  {
    path: "/prm/control-panel",
    component: PRMControlPanelPage,
    label: "Control Panel",
  },
  { path: "/prm/dashboard", component: PRMDashboardPage, label: "Dashboard" },
  // Bare /prm last.
  { path: "/prm", component: PRMDashboardPage, label: "Dashboard" },
];
