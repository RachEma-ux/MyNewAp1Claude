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

export const dataAnalysisClientManifest: ClientModuleManifest = {
  key: "dataAnalysis",
  name: "Data Analysis",
  routes: [
    {
      path: "/data-analysis/graphrag",
      label: "GraphRAG (OmniGraph)",
      component: GraphRAGPage,
    },
  ],
  navigation: [
    { group: "dataAnalysis", label: "Data Analysis", order: 5 },
  ],
  requiredPermissions: ["dataAnalysis.read"],
};
