/**
 * PM Central — Internal route table.
 *
 * Each entry maps a canonical PM Central path to its lazy-loaded
 * page component. The capsule's `mod.tsx` mounts these inside a
 * `<Switch>`. The list MUST stay in sync with
 * `manifest.routeInventory` — `check:module-route-inventory`
 * enforces this in strict mode.
 *
 * Order matters under wouter's `<Switch>` (first-match-wins):
 * `/pm/projects/:id` is listed BEFORE `/pm/projects` so a deep link
 * like `/pm/projects/42` lands on the project detail view rather
 * than being eaten by the projects list.
 *
 * `/pm` itself renders the PM Central dashboard (preserves the
 * prior `/pm-central/rtlm` UX where the bare RTLM path also showed
 * the dashboard).
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const PMCentralDashboardPage = lazy(
  () => import("./pages/PMCentralDashboardPage"),
);
const PMProjectsPage = lazy(() => import("./pages/PMProjectsPage"));
const PMProjectDetailPage = lazy(() => import("./pages/PMProjectDetailPage"));
const PMTasksPage = lazy(() => import("./pages/PMTasksPage"));
const PMMilestonesPage = lazy(() => import("./pages/PMMilestonesPage"));
const PMRisksPage = lazy(() => import("./pages/PMRisksPage"));
const PMIssuesPage = lazy(() => import("./pages/PMIssuesPage"));
const PMDecisionsPage = lazy(() => import("./pages/PMDecisionsPage"));
const PMHandoffsPage = lazy(() => import("./pages/PMHandoffsPage"));
const PMSettingsPage = lazy(() => import("./pages/PMSettingsPage"));

export interface PMCentralRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const pmCentralRoutes: PMCentralRouteEntry[] = [
  // Specific paths first.
  {
    path: "/pm/projects/:id",
    component: PMProjectDetailPage,
    label: "Project",
  },
  { path: "/pm/projects", component: PMProjectsPage, label: "Projects" },
  { path: "/pm/tasks", component: PMTasksPage, label: "Tasks" },
  { path: "/pm/milestones", component: PMMilestonesPage, label: "Milestones" },
  { path: "/pm/risks", component: PMRisksPage, label: "Risks" },
  { path: "/pm/issues", component: PMIssuesPage, label: "Issues" },
  { path: "/pm/decisions", component: PMDecisionsPage, label: "Decisions" },
  { path: "/pm/handoffs", component: PMHandoffsPage, label: "Handoffs" },
  { path: "/pm/settings", component: PMSettingsPage, label: "Settings" },
  // Bare /pm last so it is reached only when none of the more
  // specific paths above match.
  { path: "/pm", component: PMCentralDashboardPage, label: "Dashboard" },
];
