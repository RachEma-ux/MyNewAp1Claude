/**
 * PSM — Internal route table (metadata).
 *
 * PSM's `PSMShell` already does view-based internal routing off
 * `useLocation()`. The capsule's `mod.tsx` dispatches the three
 * deep-link routes (`/psm/cases/:id`, `/psm/methods/:id`,
 * `/psm/runs/:id`) to dedicated pages WITHOUT the shell, and falls
 * through to `<PSMShell />` for everything else.
 *
 * This file exists primarily as METADATA: it lists every canonical
 * path owned by PSM so `check:module-route-inventory` can verify the
 * manifest's `routeInventory` matches the capsule's actual mount
 * surface.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const PSMDashboardPage = lazy(() => import("./pages/PSMDashboardPage"));
const PSMLibraryPage = lazy(() => import("./pages/PSMLibraryPage"));
const PSMSelectorPage = lazy(() => import("./pages/PSMSelectorPage"));
const PSMCasesPage = lazy(() => import("./pages/PSMCasesPage"));
const PSMCaseDetailPage = lazy(() => import("./pages/PSMCaseDetailPage"));
const PSMMethodDetailPage = lazy(() => import("./pages/PSMMethodDetailPage"));
const PSMRunPage = lazy(() => import("./pages/PSMRunPage"));
const PSMAdminPage = lazy(() => import("./pages/PSMAdminPage"));
const PSMAnalyticsPage = lazy(() => import("./pages/PSMAnalyticsPage"));
const PSMAICatalogPage = lazy(() => import("./pages/PSMAICatalogPage"));

export interface PSMRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const psmRoutes: PSMRouteEntry[] = [
  // Specific paths first.
  { path: "/psm/cases/:id", component: PSMCaseDetailPage, label: "Case" },
  { path: "/psm/methods/:id", component: PSMMethodDetailPage, label: "Method" },
  { path: "/psm/runs/:id", component: PSMRunPage, label: "Run" },
  { path: "/psm/cases", component: PSMCasesPage, label: "Cases" },
  { path: "/psm/library", component: PSMLibraryPage, label: "Library" },
  { path: "/psm/selector", component: PSMSelectorPage, label: "Selector" },
  { path: "/psm/admin", component: PSMAdminPage, label: "Admin" },
  { path: "/psm/analytics", component: PSMAnalyticsPage, label: "Analytics" },
  { path: "/psm/ai-catalog", component: PSMAICatalogPage, label: "AI Catalog" },
  { path: "/psm/dashboard", component: PSMDashboardPage, label: "Dashboard" },
  // Bare /psm last.
  { path: "/psm", component: PSMDashboardPage, label: "Dashboard" },
];
