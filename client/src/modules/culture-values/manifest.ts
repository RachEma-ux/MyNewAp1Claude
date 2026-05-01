/**
 * Culture & Values — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const CVTopLevelPage = lazy(() => import("@/pages/culture-values/CVTopLevelPage"));

export const cultureValuesClientManifest: ClientModuleManifest = {
  key: "cultureValues",
  name: "Culture & Values",
  routes: [
    { path: "/cv", label: "Culture & Values", component: CVTopLevelPage },
    { path: "/cv/:item", label: "Culture Item", component: CVTopLevelPage },
  ],
  navigation: [{ group: "people", label: "Culture & Values", order: 30 }],
  requiredPermissions: ["cultureValues.read"],
};
