/**
 * HR — Frontend Module Manifest
 *
 * HR has many sub-routes; the manifest captures the canonical entry
 * points for navigation and modular composition. App.tsx remains the
 * runtime authority for the complete HR route surface during compat
 * mode. The role-gated wrappers stay in App.tsx for now.
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const HRHomePage = lazy(() => import("@/pages/hr/HRHomePage"));
const HRDirectoryPage = lazy(() => import("@/pages/hr/HRDirectoryPage"));
const HROrganizationPage = lazy(() => import("@/pages/hr/HROrganizationPage"));
const HRReportsPage = lazy(() => import("@/pages/hr/HRReportsPage"));

export const hrClientManifest: ClientModuleManifest = {
  key: "hr",
  name: "HR — Human Resources",
  routes: [
    { path: "/hr", label: "HR Home", component: HRHomePage },
    { path: "/hr/directory", label: "Directory", component: HRDirectoryPage },
    { path: "/hr/organization", label: "Organization", component: HROrganizationPage },
    { path: "/hr/reports", label: "Reports", component: HRReportsPage },
  ],
  navigation: [{ group: "people", label: "HR", order: 10 }],
  requiredPermissions: ["hr.read"],
};
