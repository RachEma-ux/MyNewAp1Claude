/**
 * Projects System — Internal route table (metadata).
 *
 * PS's `PSShell` already does view-based internal routing (S1 sidebar
 * drives `useLocation` → activeView; the shell's own switch picks the
 * page component). The capsule's `mod.tsx` therefore renders
 * `<PSShell />` for the shell-managed surfaces and dispatches the
 * dynamic ideation routes (`/:id`, `/:id/convert`) to their dedicated
 * page components, which historically rendered without the shell.
 *
 * This file exists primarily as METADATA: it lists every canonical
 * path owned by PS so `check:module-route-inventory` can verify the
 * manifest's `routeInventory` matches the capsule's actual mount
 * surface.
 *
 * The list MUST stay in sync with `manifest.routeInventory`. Order
 * here mirrors the canonical sidebar order so generated reports read
 * naturally; specific paths come before bare `/ps` to keep
 * Wouter-style first-match semantics deterministic.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const PSCatalogPage = lazy(() => import("./pages/PSCatalogPage"));
const PSIdeationPage = lazy(() => import("./pages/PSIdeationPage"));
const PSIdeationDetailPage = lazy(() =>
  import("./pages/PSIdeationDetailPage").then((m) => ({
    default: m.PSIdeationDetailPage,
  })),
);
const PSIdeationConvertPage = lazy(() =>
  import("./pages/PSIdeationConvertPage").then((m) => ({
    default: m.PSIdeationConvertPage,
  })),
);
const PSControlPanelPage = lazy(() => import("./pages/PSControlPanelPage"));
const PSWizardPage = lazy(() => import("./pages/PSWizardPage"));
const PSListPage = lazy(() => import("./pages/PSListPage"));
const PSAICatalogPage = lazy(() => import("./pages/PSAICatalogPage"));

export interface PSRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const psRoutes: PSRouteEntry[] = [
  // Specific paths first — `/ps/ideation/:id/convert` before `/ps/ideation/:id`,
  // and both before `/ps/ideation`, so deep links resolve correctly.
  {
    path: "/ps/ideation/:id/convert",
    component: PSIdeationConvertPage,
    label: "Convert Ideation",
  },
  {
    path: "/ps/ideation/:id",
    component: PSIdeationDetailPage,
    label: "Ideation Detail",
  },
  { path: "/ps/ideation", component: PSIdeationPage, label: "Ideation" },
  { path: "/ps/catalog", component: PSCatalogPage, label: "Catalog" },
  {
    path: "/ps/control-panel",
    component: PSControlPanelPage,
    label: "Control Panel",
  },
  { path: "/ps/wizard", component: PSWizardPage, label: "Wizard" },
  { path: "/ps/list", component: PSListPage, label: "List" },
  { path: "/ps/ai-catalog", component: PSAICatalogPage, label: "AI Catalog" },
  // Bare /ps last — reached only when no specific path matches.
  { path: "/ps", component: PSCatalogPage, label: "Catalog" },
];
