/**
 * Providers Shell — Simple IBM Shell (Fragment pattern)
 * Sidebar + content area. Routes sub-pages by path.
 */
import { useState, lazy, Suspense } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import ProvidersSidebar, { type ProviderView } from "./ProvidersSidebar";

const ProviderDashboard = lazy(() => import("@/pages/ProvidersComingSoonPage"));
const ProviderControlPanel = lazy(() => import("@/pages/ProviderControlPanelPage"));
const ProviderWizard = lazy(() => import("@/pages/ProviderWizardPage"));
const ProviderList = lazy(() => import("@/pages/ProviderListPage"));

const routeMap: Record<ProviderView, string> = {
  dashboard: "/providers/dashboard",
  "control-panel": "/providers/control-panel",
  wizard: "/providers/wizard",
  list: "/providers/list",
};

function getActiveView(path: string): ProviderView {
  if (path.startsWith("/providers/control-panel")) return "control-panel";
  if (path.startsWith("/providers/wizard")) return "wizard";
  if (path.startsWith("/providers/list") || path.startsWith("/list/providers")) return "list";
  return "dashboard";
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function ProvidersShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [location, navigate] = useLocation();
  const activeView = getActiveView(location);

  const handleNavigate = (key: ProviderView) => {
    const route = routeMap[key];
    if (route) navigate(route);
  };

  let content: React.ReactNode;
  switch (activeView) {
    case "control-panel":
      content = <ProviderControlPanel />;
      break;
    case "wizard":
      content = <ProviderWizard />;
      break;
    case "list":
      content = <ProviderList />;
      break;
    default:
      content = <ProviderDashboard />;
  }

  return (
    <>
      <ProvidersSidebar
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
