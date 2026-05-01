/**
 * Organization Management — Frontend Module Manifest
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const OMTopLevelPage = lazy(() => import("@/pages/organization-management/OMTopLevelPage"));

export const organizationManagementClientManifest: ClientModuleManifest = {
  key: "organizationManagement",
  name: "Organization Management",
  routes: [
    { path: "/om", label: "Organization", component: OMTopLevelPage },
    { path: "/om/:item", label: "Organization Item", component: OMTopLevelPage },
  ],
  navigation: [{ group: "people", label: "Organization", order: 20 }],
  requiredPermissions: ["organizationManagement.read"],
};
