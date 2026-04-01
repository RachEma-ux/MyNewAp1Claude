/**
 * Agents Shell — Simple IBM Shell (Fragment pattern)
 */
import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import AgentsSidebar, { type AgentView } from "./AgentsSidebar";

const AgentDashboard = lazy(() => import("@/pages/AgentDashboardPage"));
const AgentControlPanel = lazy(() => import("@/pages/AgentControlPanelPage"));
const AgentWizard = lazy(() => import("@/pages/AgentsPage"));
const AgentListPage = lazy(() => import("@/pages/AgentList").then(m => ({ default: m.AgentList })));

const routeMap: Record<AgentView, string> = {
  dashboard: "/agents/dashboard",
  "control-panel": "/agents/control-panel",
  wizard: "/agents/wizard",
  list: "/agents/list",
};

function getActiveView(path: string): AgentView {
  if (path.startsWith("/agents/control-panel")) return "control-panel";
  if (path.startsWith("/agents/wizard")) return "wizard";
  if (path.startsWith("/agents/list")) return "list";
  return "dashboard";
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function AgentsShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [location, navigate] = useLocation();
  const activeView = getActiveView(location);

  const handleNavigate = (key: AgentView) => {
    const route = routeMap[key];
    if (route) navigate(route);
  };

  let content: React.ReactNode;
  switch (activeView) {
    case "control-panel":
      content = <AgentControlPanel />;
      break;
    case "wizard":
      content = <AgentWizard />;
      break;
    case "list":
      content = <AgentListPage />;
      break;
    default:
      content = <AgentDashboard />;
  }

  return (
    <>
      <AgentsSidebar
        active={activeView}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <Suspense fallback={<Fallback />}>
          {content}
        </Suspense>
      </div>
    </>
  );
}
