/**
 * Code Studio Shell — Simple IBM Shell (Fragment pattern)
 * Cloned from PSMShell — returns sidebar + content as flex children.
 */
import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import CodeStudioSidebar, { type CodeStudioView } from "./CodeStudioSidebar";

const CodeStudioDashboardPage = lazy(() => import("@/pages/code-studio/CodeStudioDashboardPage"));
const CodeStudioJobsPage = lazy(() => import("@/pages/code-studio/CodeStudioJobsPage"));
const CodeStudioSessionsPage = lazy(() => import("@/pages/code-studio/CodeStudioSessionsPage"));
const CodeStudioApprovalsPage = lazy(() => import("@/pages/code-studio/CodeStudioApprovalsPage"));
const CodeStudioReposPage = lazy(() => import("@/pages/code-studio/CodeStudioReposPage"));
const CodeStudioAgentsPage = lazy(() => import("@/pages/code-studio/CodeStudioAgentsPage"));
const CodeStudioPoliciesPage = lazy(() => import("@/pages/code-studio/CodeStudioPoliciesPage"));
const CodeStudioAICatalogPage = lazy(() => import("@/pages/code-studio/CodeStudioAICatalogPage"));
const CodeStudioControlPanelPage = lazy(() => import("@/pages/code-studio/CodeStudioControlPanelPage"));

const routeMap: Record<CodeStudioView, string> = {
  dashboard: "/code-studio/dashboard",
  jobs: "/code-studio/jobs",
  sessions: "/code-studio/sessions",
  approvals: "/code-studio/approvals",
  repos: "/code-studio/repos",
  agents: "/code-studio/agents",
  "ai-catalog": "/code-studio/ai-catalog",
  policies: "/code-studio/policies",
  "control-panel": "/code-studio/control-panel",
};

function getActiveView(path: string): CodeStudioView {
  if (path.startsWith("/code-studio/jobs")) return "jobs";
  if (path.startsWith("/code-studio/sessions")) return "sessions";
  if (path.startsWith("/code-studio/approvals")) return "approvals";
  if (path.startsWith("/code-studio/repos")) return "repos";
  if (path.startsWith("/code-studio/agents")) return "agents";
  if (path.startsWith("/code-studio/ai-catalog")) return "ai-catalog";
  if (path.startsWith("/code-studio/policies")) return "policies";
  if (path.startsWith("/code-studio/control-panel")) return "control-panel";
  return "dashboard";
}

const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

export default function CodeStudioShell() {
  const [location, navigate] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const active = getActiveView(location);

  const handleNavigate = (key: CodeStudioView) => {
    navigate(routeMap[key]);
  };

  const renderContent = () => {
    switch (active) {
      case "jobs": return <CodeStudioJobsPage />;
      case "sessions": return <CodeStudioSessionsPage />;
      case "approvals": return <CodeStudioApprovalsPage />;
      case "repos": return <CodeStudioReposPage />;
      case "agents": return <CodeStudioAgentsPage />;
      case "ai-catalog": return <CodeStudioAICatalogPage />;
      case "policies": return <CodeStudioPoliciesPage />;
      case "control-panel": return <CodeStudioControlPanelPage />;
      default: return <CodeStudioDashboardPage />;
    }
  };

  return (
    <>
      <CodeStudioSidebar
        active={active}
        onNavigate={handleNavigate}
        collapsed={isMobile || sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex-1 overflow-auto">
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
          {renderContent()}
        </Suspense>
      </div>
    </>
  );
}
