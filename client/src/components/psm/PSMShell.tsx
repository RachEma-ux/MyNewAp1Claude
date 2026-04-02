/**
 * PSM Shell — Simple IBM Shell (Fragment pattern, cloned from PRMShell)
 */
import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import PSMSidebar, { type PSMView } from "./PSMSidebar";

const PSMDashboardPage = lazy(() => import("@/pages/psm/PSMDashboardPage"));
const PSMLibraryPage = lazy(() => import("@/pages/psm/PSMLibraryPage"));
const PSMSelectorPage = lazy(() => import("@/pages/psm/PSMSelectorPage"));
const PSMCasesPage = lazy(() => import("@/pages/psm/PSMCasesPage"));
const PSMAdminPage = lazy(() => import("@/pages/psm/PSMAdminPage"));
const PSMAnalyticsPage = lazy(() => import("@/pages/psm/PSMAnalyticsPage"));

const routeMap: Record<PSMView, string> = {
  dashboard: "/psm/dashboard",
  library: "/psm/library",
  selector: "/psm/selector",
  cases: "/psm/cases",
  admin: "/psm/admin",
  analytics: "/psm/analytics",
};

function getActiveView(path: string): PSMView {
  if (path.startsWith("/psm/library")) return "library";
  if (path.startsWith("/psm/selector")) return "selector";
  if (path.startsWith("/psm/cases")) return "cases";
  if (path.startsWith("/psm/admin")) return "admin";
  if (path.startsWith("/psm/analytics")) return "analytics";
  return "dashboard";
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function PSMShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [location, navigate] = useLocation();
  const activeView = getActiveView(location);

  const handleNavigate = (key: PSMView) => {
    const route = routeMap[key];
    if (route) navigate(route);
  };

  let content: React.ReactNode;
  switch (activeView) {
    case "library":
      content = <PSMLibraryPage />;
      break;
    case "selector":
      content = <PSMSelectorPage />;
      break;
    case "cases":
      content = <PSMCasesPage />;
      break;
    case "admin":
      content = <PSMAdminPage />;
      break;
    case "analytics":
      content = <PSMAnalyticsPage />;
      break;
    default:
      content = <PSMDashboardPage />;
  }

  return (
    <>
      <PSMSidebar
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
