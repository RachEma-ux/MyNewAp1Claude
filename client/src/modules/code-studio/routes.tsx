/**
 * Code Studio — Internal route table (metadata).
 *
 * Code Studio's `CodeStudioShell` already does view-based internal
 * routing (S1 sidebar drives `useLocation` → activeView; the shell's
 * own switch picks the page component). The capsule's `mod.tsx`
 * renders `<CodeStudioShell />` directly so the existing UX —
 * including the Double IBM Shell pattern with the OpenCode S2 rail —
 * is preserved verbatim.
 *
 * This file therefore exists primarily as METADATA: it lists the
 * canonical paths owned by Code Studio so
 * `check:module-route-inventory` can verify the manifest's
 * `routeInventory` matches the capsule's actual mount surface.
 *
 * The list MUST stay in sync with `manifest.routeInventory`. Order
 * here mirrors the canonical sidebar order so generated reports read
 * naturally.
 */

import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

const CodeStudioDashboardPage = lazy(
  () => import("./pages/CodeStudioDashboardPage"),
);
const CodeStudioJobsPage = lazy(() => import("./pages/CodeStudioJobsPage"));
const CodeStudioJobDetailPage = lazy(
  () => import("./pages/CodeStudioJobDetailPage"),
);
const CodeStudioTemplatesPage = lazy(
  () => import("./pages/CodeStudioTemplatesPage"),
);
const CodeStudioSessionsPage = lazy(
  () => import("./pages/CodeStudioSessionsPage"),
);
const CodeStudioApprovalsPage = lazy(
  () => import("./pages/CodeStudioApprovalsPage"),
);
const CodeStudioReposPage = lazy(() => import("./pages/CodeStudioReposPage"));
const CodeStudioAgentsPage = lazy(() => import("./pages/CodeStudioAgentsPage"));
const CodeStudioAICatalogPage = lazy(
  () => import("./pages/CodeStudioAICatalogPage"),
);
const CodeStudioPoliciesPage = lazy(
  () => import("./pages/CodeStudioPoliciesPage"),
);
const CodeStudioControlPanelPage = lazy(
  () => import("./pages/CodeStudioControlPanelPage"),
);
const CodeStudioOpenCodeSettingsPage = lazy(
  () => import("./pages/CodeStudioOpenCodeSettingsPage"),
);
const CodeStudioHowToPage = lazy(() => import("./pages/CodeStudioHowToPage"));

export interface CodeStudioRouteEntry {
  path: string;
  component: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  label: string;
}

export const codeStudioRoutes: CodeStudioRouteEntry[] = [
  // Specific paths first — `/code-studio/jobs/:id` before the list.
  {
    path: "/code-studio/jobs/:id",
    component: CodeStudioJobDetailPage,
    label: "Job Detail",
  },
  { path: "/code-studio/jobs", component: CodeStudioJobsPage, label: "Jobs" },
  {
    path: "/code-studio/templates",
    component: CodeStudioTemplatesPage,
    label: "Templates",
  },
  {
    path: "/code-studio/sessions",
    component: CodeStudioSessionsPage,
    label: "Sessions",
  },
  {
    path: "/code-studio/approvals",
    component: CodeStudioApprovalsPage,
    label: "Approvals",
  },
  {
    path: "/code-studio/repos",
    component: CodeStudioReposPage,
    label: "Repositories",
  },
  {
    path: "/code-studio/agents",
    component: CodeStudioAgentsPage,
    label: "Agents",
  },
  {
    path: "/code-studio/ai-catalog",
    component: CodeStudioAICatalogPage,
    label: "AI Catalog",
  },
  {
    path: "/code-studio/policies",
    component: CodeStudioPoliciesPage,
    label: "Policies",
  },
  {
    path: "/code-studio/control-panel",
    component: CodeStudioControlPanelPage,
    label: "Control Panel",
  },
  {
    path: "/code-studio/opencode-settings",
    component: CodeStudioOpenCodeSettingsPage,
    label: "OpenCode Settings",
  },
  {
    path: "/code-studio/how-to",
    component: CodeStudioHowToPage,
    label: "How To",
  },
  {
    path: "/code-studio/dashboard",
    component: CodeStudioDashboardPage,
    label: "Dashboard",
  },
  // Bare /code-studio last — reached only when no specific path
  // matches above.
  {
    path: "/code-studio",
    component: CodeStudioDashboardPage,
    label: "Dashboard",
  },
];
