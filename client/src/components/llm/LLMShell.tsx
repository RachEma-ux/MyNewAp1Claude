/**
 * LLM Shell — Simple IBM Shell (Fragment pattern)
 */
import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import LLMSidebar, { type LLMView } from "./LLMSidebar";

const LLMDashboard = lazy(() => import("@/pages/LLMDashboard"));
const LLMControlPlane = lazy(() => import("@/pages/LLMControlPlane"));
const LLMWizard = lazy(() => import("@/pages/LLMWizard"));
const LLMCreationWizard = lazy(() => import("@/pages/LLMCreationWizard"));
const LLMListPage = lazy(() => import("@/pages/LLMListPage"));
const LLMCataloguePage = lazy(() => import("@/pages/LLMCataloguePage"));

const routeMap: Record<LLMView, string> = {
  dashboard: "/llm/dashboard",
  "control-panel": "/llm/control-panel",
  register: "/llm/register",
  wizard: "/llm/wizard",
  list: "/llm/list",
  catalogue: "/llm/catalogue",
};

function getActiveView(path: string): LLMView {
  if (path.startsWith("/llm/control-panel") || path.startsWith("/llm/control-plane")) return "control-panel";
  if (path.startsWith("/llm/register") || path.startsWith("/llm/create")) return "register";
  if (path.startsWith("/llm/wizard")) return "wizard";
  if (path.startsWith("/llm/list") || path.startsWith("/list/llms")) return "list";
  if (path.startsWith("/llm/catalogue")) return "catalogue";
  return "dashboard";
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function LLMShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [location, navigate] = useLocation();
  const activeView = getActiveView(location);

  const handleNavigate = (key: LLMView) => {
    const route = routeMap[key];
    if (route) navigate(route);
  };

  let content: React.ReactNode;
  switch (activeView) {
    case "control-panel":
      content = <LLMControlPlane />;
      break;
    case "register":
      content = <LLMWizard />;
      break;
    case "wizard":
      content = <LLMCreationWizard />;
      break;
    case "list":
      content = <LLMListPage />;
      break;
    case "catalogue":
      content = <LLMCataloguePage />;
      break;
    default:
      content = <LLMDashboard />;
  }

  return (
    <>
      <LLMSidebar
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
