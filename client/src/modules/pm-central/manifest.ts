/**
 * PM Central — Frontend Module Manifest
 *
 * Wires the canonical RTLM PM Central routes under `/pm-central/rtlm/*`.
 * The legacy `/pm-central/*` shell routes (PMCentralShellPage, ProjectPage,
 * etc.) continue to work for back-compat. Going forward, all PM Central
 * RTLM consumers should land on `/pm-central/rtlm/*`.
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const PMCentralDashboardPage = lazy(
  () => import("./pages/PMCentralDashboardPage"),
);
const PMProjectsPage = lazy(() => import("./pages/PMProjectsPage"));
const PMProjectDetailPage = lazy(
  () => import("./pages/PMProjectDetailPage"),
);
const PMTasksPage = lazy(() => import("./pages/PMTasksPage"));
const PMMilestonesPage = lazy(() => import("./pages/PMMilestonesPage"));
const PMRisksPage = lazy(() => import("./pages/PMRisksPage"));
const PMIssuesPage = lazy(() => import("./pages/PMIssuesPage"));
const PMDecisionsPage = lazy(() => import("./pages/PMDecisionsPage"));
const PMHandoffsPage = lazy(() => import("./pages/PMHandoffsPage"));
const PMSettingsPage = lazy(() => import("./pages/PMSettingsPage"));

export const pmCentralClientManifest: ClientModuleManifest = {
  key: "pmCentral",
  name: "PM Central",
  routes: [
    {
      path: "/pm-central/rtlm",
      label: "PM Central — Module Dashboard",
      component: PMCentralDashboardPage,
    },
    {
      path: "/pm-central/rtlm/projects",
      label: "Projects",
      component: PMProjectsPage,
    },
    {
      path: "/pm-central/rtlm/projects/:id",
      label: "Project",
      component: PMProjectDetailPage,
    },
    {
      path: "/pm-central/rtlm/tasks",
      label: "Tasks",
      component: PMTasksPage,
    },
    {
      path: "/pm-central/rtlm/milestones",
      label: "Milestones",
      component: PMMilestonesPage,
    },
    {
      path: "/pm-central/rtlm/risks",
      label: "Risks",
      component: PMRisksPage,
    },
    {
      path: "/pm-central/rtlm/issues",
      label: "Issues",
      component: PMIssuesPage,
    },
    {
      path: "/pm-central/rtlm/decisions",
      label: "Decisions",
      component: PMDecisionsPage,
    },
    {
      path: "/pm-central/rtlm/handoffs",
      label: "Handoffs",
      component: PMHandoffsPage,
    },
    {
      path: "/pm-central/rtlm/settings",
      label: "Settings",
      component: PMSettingsPage,
    },
  ],
  navigation: [{ group: "pmCentral", label: "PM Central", order: 4 }],
  requiredPermissions: ["pm.read"],
};
