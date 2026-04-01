/**
 * Models Shell — Simple IBM Shell (Fragment pattern)
 */
import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import ModelsSidebar, { type ModelView } from "./ModelsSidebar";

const ModelsBrowse = lazy(() => import("@/pages/Models"));
const ModelsDashboard = lazy(() => import("@/pages/ModelsComingSoonPage"));
const ModelListPage = lazy(() => import("@/pages/ModelListPage"));

const routeMap: Record<ModelView, string> = {
  browse: "/models/browse",
  dashboard: "/models/dashboard",
  "control-panel": "/models/control-panel",
  wizard: "/models/wizard",
  list: "/models/list",
};

function getActiveView(path: string): ModelView {
  if (path.startsWith("/models/dashboard")) return "dashboard";
  if (path.startsWith("/models/control-panel")) return "control-panel";
  if (path.startsWith("/models/wizard")) return "wizard";
  if (path.startsWith("/models/list") || path.startsWith("/list/models")) return "list";
  return "browse";
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function ModelsShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [location, navigate] = useLocation();
  const activeView = getActiveView(location);

  const handleNavigate = (key: ModelView) => {
    const route = routeMap[key];
    if (route) navigate(route);
  };

  // ModelsComingSoonPage handles dashboard/control-panel/wizard internally via route param
  // We render it for those views, ModelsBrowse for browse, ModelListPage for list
  let content: React.ReactNode;
  switch (activeView) {
    case "list":
      content = <ModelListPage />;
      break;
    case "browse":
      content = <ModelsBrowse />;
      break;
    default:
      // dashboard, control-panel, wizard — handled by ModelsComingSoonPage internal routing
      content = <ModelsDashboard />;
  }

  return (
    <>
      <ModelsSidebar
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
