/**
 * KGRA Agent — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const KGRAAgentPage = lazy(() => import("@/pages/data-analysis/KGRAAgentPage"));

export const kgraAgentClientManifest: ClientModuleManifest = {
  key: "kgraAgent",
  name: "KGRA — Knowledge Graph Reasoning Agent",
  routes: [
    { path: "/data-analysis/kgra-agent", label: "KGRA Agent", component: KGRAAgentPage },
  ],
  navigation: [{ group: "intelligence", label: "KGRA Agent", order: 30 }],
  requiredPermissions: ["kgraAgent.read"],
};
