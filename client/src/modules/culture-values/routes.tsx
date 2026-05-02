/**
 * Culture & Values — Internal route table (metadata).
 *
 * Capsule's `mod.tsx` does the actual route dispatch via
 * `CVTopLevelPage`. This file lists every canonical path owned by
 * CV so `check:module-route-inventory` can verify the manifest's
 * `routeInventory` matches the capsule's actual mount surface.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const CVTopLevelPage = lazy(() => import("./pages/CVTopLevelPage"));
const CVPortfolioPage = lazy(() => import("./pages/CVPortfolioPage"));
const CVWizardPage = lazy(() => import("./pages/CVWizardPage"));
const CVSettingsPage = lazy(() => import("./pages/CVSettingsPage"));

export interface CVRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const cultureValuesRoutes: CVRouteEntry[] = [
  { path: "/cv/portfolio", component: CVPortfolioPage, label: "Portfolio" },
  { path: "/cv/wizard", component: CVWizardPage, label: "Wizard" },
  { path: "/cv/settings", component: CVSettingsPage, label: "Settings" },
  { path: "/cv", component: CVTopLevelPage, label: "Culture & Values" },
];
