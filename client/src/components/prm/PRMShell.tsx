/**
 * PRM Shell — Simple IBM Shell (Fragment pattern, cloned from PSShell)
 */
import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import PRMSidebar, { type PRMView } from "./PRMSidebar";

const PRMDashboardPage = lazy(() => import("@/pages/prm/PRMDashboardPage"));
const PRMNewCasePage = lazy(() => import("@/pages/prm/PRMNewCasePage"));
const PRMCaseListPage = lazy(() => import("@/pages/prm/PRMCaseListPage"));
const PRMMethodsLibraryPage = lazy(() => import("@/pages/prm/PRMMethodsLibraryPage"));
const PRMPlaybooksPage = lazy(() => import("@/pages/prm/PRMPlaybooksPage"));
const PRMCatalogPage = lazy(() => import("@/pages/prm/PRMCatalogPage"));
const PRMAICatalogPage = lazy(() => import("@/pages/prm/PRMAICatalogPage"));
const PRMControlPanelPage = lazy(() => import("@/pages/prm/PRMControlPanelPage"));

const routeMap: Record<PRMView, string> = {
  dashboard: "/prm/dashboard",
  new: "/prm/new",
  cases: "/prm/cases",
  methods: "/prm/methods",
  playbooks: "/prm/playbooks",
  catalog: "/prm/catalog",
  "ai-catalog": "/prm/ai-catalog",
  "control-panel": "/prm/control-panel",
};

function getActiveView(path: string): PRMView {
  if (path.startsWith("/prm/new")) return "new";
  if (path.startsWith("/prm/cases")) return "cases";
  if (path.startsWith("/prm/methods")) return "methods";
  if (path.startsWith("/prm/playbooks")) return "playbooks";
  if (path.startsWith("/prm/ai-catalog")) return "ai-catalog";
  if (path.startsWith("/prm/catalog")) return "catalog";
  if (path.startsWith("/prm/control-panel")) return "control-panel";
  return "dashboard";
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function PRMShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [location, navigate] = useLocation();
  const activeView = getActiveView(location);

  const handleNavigate = (key: PRMView) => {
    const route = routeMap[key];
    if (route) navigate(route);
  };

  let content: React.ReactNode;
  switch (activeView) {
    case "new":
      content = <PRMNewCasePage />;
      break;
    case "cases":
      content = <PRMCaseListPage />;
      break;
    case "methods":
      content = <PRMMethodsLibraryPage />;
      break;
    case "playbooks":
      content = <PRMPlaybooksPage />;
      break;
    case "catalog":
      content = <PRMCatalogPage />;
      break;
    case "ai-catalog":
      content = <PRMAICatalogPage />;
      break;
    case "control-panel":
      content = <PRMControlPanelPage />;
      break;
    default:
      content = <PRMDashboardPage />;
  }

  return (
    <>
      <PRMSidebar
        active={activeView}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <Suspense fallback={<Fallback />}>{content}</Suspense>
      </div>
    </>
  );
}
