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
 * The Data Acquisition subdomain contributes its own per-page route
 * table from `./data-acquisition/routes.tsx` and its nav entry from
 * `./data-acquisition/nav.ts` — Document Intelligence is one route
 * among many, not the subdomain root.
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

import { dataAcquisitionRoutes } from "./data-acquisition/routes";
import { dataAcquisitionNav } from "./data-acquisition/nav";

const GraphRAGPage = lazy(() => import("@/pages/data-analysis/GraphRAGPage"));

export const dataAnalysisClientManifest: ClientModuleManifest = {
  key: "dataAnalysis",
  name: "Data Analysis",
  routes: [
    {
      path: "/data-analysis/graphrag",
      label: "GraphRAG (OmniGraph)",
      component: GraphRAGPage,
    },
    ...dataAcquisitionRoutes,
  ],
  navigation: [
    { group: "dataAnalysis", label: "Data Analysis", order: 5 },
    ...dataAcquisitionNav,
  ],
  requiredPermissions: ["dataAnalysis.read"],
};
