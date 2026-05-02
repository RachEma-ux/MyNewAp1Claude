/**
 * Organization Management — Internal route table (metadata).
 *
 * Capsule's `mod.tsx` does the actual route dispatch via
 * `OMTopLevelPage`. This file lists every canonical path owned by
 * OM so `check:module-route-inventory` can verify the manifest's
 * `routeInventory` matches the capsule's actual mount surface.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const OMTopLevelPage = lazy(() => import("./pages/OMTopLevelPage"));
const OMPortfolioPage = lazy(() =>
  import("./pages/OMPortfolioPage").then((m) => ({ default: m.OMPortfolioPage })),
);
const OMControlPanelPage = lazy(() =>
  import("./pages/OMControlPanelPage").then((m) => ({ default: m.OMControlPanelPage })),
);
const OMWizardPage = lazy(() =>
  import("./pages/OMWizardPage").then((m) => ({ default: m.OMWizardPage })),
);
const OMListPage = lazy(() =>
  import("./pages/OMListPage").then((m) => ({ default: m.OMListPage })),
);
const OMSettingsPage = lazy(() =>
  import("./pages/OMSettingsPage").then((m) => ({ default: m.OMSettingsPage })),
);
const OMTemplatesPage = lazy(() =>
  import("./pages/OMTemplatesPage").then((m) => ({ default: m.OMTemplatesPage })),
);

export interface OMRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const organizationManagementRoutes: OMRouteEntry[] = [
  { path: "/om/control-panel", component: OMControlPanelPage, label: "Control Panel" },
  { path: "/om/wizard", component: OMWizardPage, label: "Wizard" },
  { path: "/om/list", component: OMListPage, label: "List" },
  { path: "/om/settings", component: OMSettingsPage, label: "Settings" },
  { path: "/om/templates", component: OMTemplatesPage, label: "Templates" },
  { path: "/om/portfolio", component: OMPortfolioPage, label: "Portfolio" },
  { path: "/om", component: OMTopLevelPage, label: "Organization" },
];
