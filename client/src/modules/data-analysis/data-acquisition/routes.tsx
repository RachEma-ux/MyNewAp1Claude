/**
 * Data Acquisition — route table.
 *
 * One route per page file. Composed into the Data Analysis manifest
 * so the AWI / Digital HQ navigation composer treats Data Acquisition
 * as a subdomain of `dataAnalysis`, not a separate RTLM.
 */

import { lazy } from "react";
import type { ClientModuleRoute } from "@/platform/modules/types";

const DataAcquisitionDashboardPage = lazy(
  () => import("./pages/DataAcquisitionDashboardPage"),
);
const DataAcquisitionSourcesPage = lazy(
  () => import("./pages/DataAcquisitionSourcesPage"),
);
const DataAcquisitionRunsPage = lazy(
  () => import("./pages/DataAcquisitionRunsPage"),
);
const DataAcquisitionItemsPage = lazy(
  () => import("./pages/DataAcquisitionItemsPage"),
);
const DataAcquisitionClassificationPage = lazy(
  () => import("./pages/DataAcquisitionClassificationPage"),
);
const DataAcquisitionRoutingPage = lazy(
  () => import("./pages/DataAcquisitionRoutingPage"),
);
const DataAcquisitionProcessingPage = lazy(
  () => import("./pages/DataAcquisitionProcessingPage"),
);
const DocumentIntelligencePage = lazy(
  () => import("./pages/DocumentIntelligencePage"),
);
const DataAcquisitionCanonicalRecordsPage = lazy(
  () => import("./pages/DataAcquisitionCanonicalRecordsPage"),
);
const DataAcquisitionOutputsPage = lazy(
  () => import("./pages/DataAcquisitionOutputsPage"),
);
const DataAcquisitionSettingsPage = lazy(
  () => import("./pages/DataAcquisitionSettingsPage"),
);

export const dataAcquisitionRoutes: ClientModuleRoute[] = [
  {
    path: "/data-analysis/data-acquisition",
    label: "Data Acquisition",
    component: DataAcquisitionDashboardPage,
  },
  {
    path: "/data-analysis/data-acquisition/sources",
    label: "Data Acquisition — Sources",
    component: DataAcquisitionSourcesPage,
  },
  {
    path: "/data-analysis/data-acquisition/runs",
    label: "Data Acquisition — Runs",
    component: DataAcquisitionRunsPage,
  },
  {
    path: "/data-analysis/data-acquisition/items",
    label: "Data Acquisition — Items",
    component: DataAcquisitionItemsPage,
  },
  {
    path: "/data-analysis/data-acquisition/classification",
    label: "Data Acquisition — Classification",
    component: DataAcquisitionClassificationPage,
  },
  {
    path: "/data-analysis/data-acquisition/routing",
    label: "Data Acquisition — Routing",
    component: DataAcquisitionRoutingPage,
  },
  {
    path: "/data-analysis/data-acquisition/processing",
    label: "Data Acquisition — Processing",
    component: DataAcquisitionProcessingPage,
  },
  {
    path: "/data-analysis/data-acquisition/document-intelligence",
    label: "Data Acquisition — Document Intelligence",
    component: DocumentIntelligencePage,
  },
  {
    path: "/data-analysis/data-acquisition/canonical-records",
    label: "Data Acquisition — Canonical Records",
    component: DataAcquisitionCanonicalRecordsPage,
  },
  {
    path: "/data-analysis/data-acquisition/outputs",
    label: "Data Acquisition — Outputs",
    component: DataAcquisitionOutputsPage,
  },
  {
    path: "/data-analysis/data-acquisition/settings",
    label: "Data Acquisition — Settings",
    component: DataAcquisitionSettingsPage,
  },
];
