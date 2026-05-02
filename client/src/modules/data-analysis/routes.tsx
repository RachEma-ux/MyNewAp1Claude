/**
 * Data Analysis — Internal route table.
 *
 * Each entry maps a canonical Data Analysis path to its lazy-loaded
 * page component. The capsule's `mod.tsx` mounts these inside a
 * `<Switch>`. The list MUST stay in sync with
 * `manifest.routeInventory` — `check:module-route-inventory`
 * enforces this in strict mode.
 *
 * The 10 Data Acquisition sub-paths all resolve to the same
 * `DataAcquisitionPage` because that page reads the active
 * sub-section from the URL via `useLocation()`. This is a
 * deliberate convention — we keep separate route entries (rather
 * than a single `/data-acquisition/:tab?` pattern) so AWI and the
 * route ownership map can name each subroute explicitly.
 *
 * `/data-analysis` itself renders a redirect to
 * `/data-analysis/graphrag` to preserve the existing UX (App.tsx
 * previously did the same with a `<Redirect>` shim).
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import { Redirect } from "wouter";

const GraphRAGPage = lazy(() => import("./pages/GraphRAGPage"));
const DataAcquisitionPage = lazy(() => import("./pages/DataAcquisitionPage"));
const DataWarehousePage = lazy(() => import("./pages/DataWarehousePage"));

/**
 * Default landing for `/data-analysis` — redirect to GraphRAG so
 * deep links to the bare baseRoute keep working unchanged.
 */
function DataAnalysisRoot() {
  return <Redirect to="/data-analysis/graphrag" />;
}

export interface DataAnalysisRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const dataAnalysisRoutes: DataAnalysisRouteEntry[] = [
  { path: "/data-analysis", component: DataAnalysisRoot, label: "Data Analysis" },
  {
    path: "/data-analysis/graphrag",
    component: GraphRAGPage,
    label: "GraphRAG",
  },
  {
    path: "/data-analysis/data-acquisition",
    component: DataAcquisitionPage,
    label: "Data Acquisition",
  },
  {
    path: "/data-analysis/data-acquisition/sources",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Sources",
  },
  {
    path: "/data-analysis/data-acquisition/runs",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Runs",
  },
  {
    path: "/data-analysis/data-acquisition/items",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Items",
  },
  {
    path: "/data-analysis/data-acquisition/classification",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Classification",
  },
  {
    path: "/data-analysis/data-acquisition/routing",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Routing",
  },
  {
    path: "/data-analysis/data-acquisition/processing",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Processing",
  },
  {
    path: "/data-analysis/data-acquisition/document-intelligence",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Document Intelligence",
  },
  {
    path: "/data-analysis/data-acquisition/canonical-records",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Canonical Records",
  },
  {
    path: "/data-analysis/data-acquisition/outputs",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Outputs",
  },
  {
    path: "/data-analysis/data-acquisition/settings",
    component: DataAcquisitionPage,
    label: "Data Acquisition — Settings",
  },
  {
    path: "/data-analysis/data-warehouse",
    component: DataWarehousePage,
    label: "Data Warehouse",
  },
];
