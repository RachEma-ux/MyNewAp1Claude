/**
 * AI Types — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const AITypesShell = lazy(() => import("@/pages/ai-types/AITypesShell"));

export const aiTypesClientManifest: ClientModuleManifest = {
  key: "aiTypes",
  name: "AI Types",
  routes: [
    { path: "/ai-types", label: "AI Types", component: AITypesShell },
    { path: "/ai-types/:rest*", label: "AI Types Detail", component: AITypesShell },
  ],
  navigation: [{ group: "infrastructure", label: "AI Types", order: 10 }],
  requiredPermissions: ["aiTypes.read"],
};
