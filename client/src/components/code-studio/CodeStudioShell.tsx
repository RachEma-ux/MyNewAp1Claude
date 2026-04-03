/**
 * Code Studio Shell — Double IBM Shell (Fragment pattern)
 *
 * S1 = CodeStudioSidebar (module nav)
 * S2 = OpenCodeSettingsRail (section nav, visible only for opencode-settings)
 *
 * Collapsed: S1 icons only (w-12), S2 hidden
 * Expanded:  S1 full + S2 visible side by side
 * S1 has its own collapse toggle. S2 toggle lives at the bottom of S1.
 * When S2 is collapsed it is fully hidden behind S1 (single bar visible).
 */
import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import CodeStudioSidebar, { type CodeStudioView } from "./CodeStudioSidebar";
import OpenCodeSettingsRail, { type SettingsSection } from "./OpenCodeSettingsRail";

const CodeStudioDashboardPage = lazy(() => import("@/pages/code-studio/CodeStudioDashboardPage"));
const CodeStudioJobsPage = lazy(() => import("@/pages/code-studio/CodeStudioJobsPage"));
const CodeStudioJobDetailPage = lazy(() => import("@/pages/code-studio/CodeStudioJobDetailPage"));
const CodeStudioSessionsPage = lazy(() => import("@/pages/code-studio/CodeStudioSessionsPage"));
const CodeStudioApprovalsPage = lazy(() => import("@/pages/code-studio/CodeStudioApprovalsPage"));
const CodeStudioReposPage = lazy(() => import("@/pages/code-studio/CodeStudioReposPage"));
const CodeStudioAgentsPage = lazy(() => import("@/pages/code-studio/CodeStudioAgentsPage"));
const CodeStudioPoliciesPage = lazy(() => import("@/pages/code-studio/CodeStudioPoliciesPage"));
const CodeStudioAICatalogPage = lazy(() => import("@/pages/code-studio/CodeStudioAICatalogPage"));
const CodeStudioControlPanelPage = lazy(() => import("@/pages/code-studio/CodeStudioControlPanelPage"));
const CodeStudioOpenCodeSettingsPage = lazy(() => import("@/pages/code-studio/CodeStudioOpenCodeSettingsPage"));
const CodeStudioHowToPage = lazy(() => import("@/pages/code-studio/CodeStudioHowToPage"));
const CodeStudioTemplatesPage = lazy(() => import("@/pages/code-studio/CodeStudioTemplatesPage"));

const routeMap: Record<CodeStudioView, string> = {
  dashboard: "/code-studio/dashboard",
  jobs: "/code-studio/jobs",
  templates: "/code-studio/templates",
  sessions: "/code-studio/sessions",
  approvals: "/code-studio/approvals",
  repos: "/code-studio/repos",
  agents: "/code-studio/agents",
  "ai-catalog": "/code-studio/ai-catalog",
  policies: "/code-studio/policies",
  "control-panel": "/code-studio/control-panel",
  "opencode-settings": "/code-studio/opencode-settings",
  "how-to": "/code-studio/how-to",
};

function getActiveView(path: string): CodeStudioView {
  if (path.startsWith("/code-studio/jobs")) return "jobs";
  if (path.startsWith("/code-studio/templates")) return "templates";
  if (path.startsWith("/code-studio/sessions")) return "sessions";
  if (path.startsWith("/code-studio/approvals")) return "approvals";
  if (path.startsWith("/code-studio/repos")) return "repos";
  if (path.startsWith("/code-studio/agents")) return "agents";
  if (path.startsWith("/code-studio/ai-catalog")) return "ai-catalog";
  if (path.startsWith("/code-studio/policies")) return "policies";
  if (path.startsWith("/code-studio/control-panel")) return "control-panel";
  if (path.startsWith("/code-studio/opencode-settings")) return "opencode-settings";
  if (path.startsWith("/code-studio/how-to")) return "how-to";
  return "dashboard";
}

export default function CodeStudioShell() {
  const [location, navigate] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [railCollapsed, setRailCollapsed] = useState(true);
  const active = getActiveView(location);

  // ── Double-shell state: S2 section nav for OpenCode Settings ──────────
  const [activeSection, setActiveSection] = useState<SettingsSection>("overview");
  const [activeTab, setActiveTab] = useState<"runtime" | "tui">("runtime");
  const [dirty, setDirty] = useState(false);

  const isOpenCode = active === "opencode-settings";
  const showS2 = isOpenCode && !railCollapsed;

  const handleNavigate = (key: CodeStudioView) => {
    navigate(routeMap[key]);
  };

  // Detect job detail route: /code-studio/jobs/:id
  const jobDetailMatch = location.match(/^\/code-studio\/jobs\/(\d+)/);

  const renderContent = () => {
    switch (active) {
      case "jobs":
        return jobDetailMatch ? <CodeStudioJobDetailPage /> : <CodeStudioJobsPage />;
      case "templates": return <CodeStudioTemplatesPage />;
      case "sessions": return <CodeStudioSessionsPage />;
      case "approvals": return <CodeStudioApprovalsPage />;
      case "repos": return <CodeStudioReposPage />;
      case "agents": return <CodeStudioAgentsPage />;
      case "ai-catalog": return <CodeStudioAICatalogPage />;
      case "policies": return <CodeStudioPoliciesPage />;
      case "control-panel": return <CodeStudioControlPanelPage />;
      case "how-to": return <CodeStudioHowToPage />;
      case "opencode-settings":
        return (
          <CodeStudioOpenCodeSettingsPage
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            dirty={dirty}
            onDirtyChange={setDirty}
          />
        );
      default: return <CodeStudioDashboardPage />;
    }
  };

  return (
    <>
      {/* S1 — Module sidebar */}
      <CodeStudioSidebar
        active={active}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        showRailToggle={isOpenCode}
        railCollapsed={railCollapsed}
        onRailToggle={() => setRailCollapsed(!railCollapsed)}
      />

      {/* S2 — Section rail (fully hidden when railCollapsed — hides behind S1) */}
      {showS2 && (
        <OpenCodeSettingsRail
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          activeTab={activeTab}
          dirty={dirty}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-auto">
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
          {renderContent()}
        </Suspense>
      </div>
    </>
  );
}
