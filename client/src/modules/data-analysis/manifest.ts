/**
 * Data Analysis — Frontend Module Manifest
 *
 * Wires the existing Data Analysis pages (`GraphRAGPage`, with the
 * `/data-analysis` redirect to `/data-analysis/graphrag`) into the
 * client module registry. The page implementations were already
 * present at `client/src/pages/data-analysis/*` — this manifest makes
 * Data Analysis the canonical RTLM frontend owner so the AWI/Digital
 * HQ navigation composer treats GraphRAG as a Data Analysis subdomain.
 *
 * Note: routes are still mounted in `client/src/App.tsx` for
 * back-compat (existing deep links remain stable). This manifest is
 * the canonical source of truth going forward.
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const GraphRAGPage = lazy(() => import("@/pages/data-analysis/GraphRAGPage"));
const DataAcquisitionPage = lazy(
  () => import("@/pages/data-analysis/DataAcquisitionPage"),
);

export const dataAnalysisClientManifest: ClientModuleManifest = {
  key: "dataAnalysis",
  name: "Data Analysis",
  routes: [
    {
      path: "/data-analysis/graphrag",
      label: "GraphRAG (OmniGraph)",
      component: GraphRAGPage,
    },
    {
      path: "/data-analysis/data-acquisition",
      label: "Data Acquisition",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/sources",
      label: "Data Acquisition — Sources",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/runs",
      label: "Data Acquisition — Runs",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/items",
      label: "Data Acquisition — Items",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/classification",
      label: "Data Acquisition — Classification",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/routing",
      label: "Data Acquisition — Routing",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/processing",
      label: "Data Acquisition — Processing",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/document-intelligence",
      label: "Data Acquisition — Document Intelligence",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/canonical-records",
      label: "Data Acquisition — Canonical Records",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/outputs",
      label: "Data Acquisition — Outputs",
      component: DataAcquisitionPage,
    },
    {
      path: "/data-analysis/data-acquisition/settings",
      label: "Data Acquisition — Settings",
      component: DataAcquisitionPage,
    },
  ],
  navigation: [
    { group: "dataAnalysis", label: "Data Analysis", order: 5 },
  ],
  requiredPermissions: ["dataAnalysis.read"],
};
