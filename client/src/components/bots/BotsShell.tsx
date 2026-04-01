/**
 * Bots Shell — Simple IBM Shell (Fragment pattern)
 */
import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import BotsSidebar, { type BotView } from "./BotsSidebar";

const BotsDashboard = lazy(() => import("@/pages/BotsComingSoonPage"));
const BotListPage = lazy(() => import("@/pages/BotListPage"));
const Analytics = lazy(() => import("@/pages/Analytics"));

const routeMap: Record<BotView, string> = {
  dashboard: "/bots/dashboard",
  "control-panel": "/bots/control-panel",
  wizard: "/bots/wizard",
  list: "/bots/list",
  analytics: "/bots/analytics",
};

function getActiveView(path: string): BotView {
  if (path.startsWith("/bots/control-panel")) return "control-panel";
  if (path.startsWith("/bots/wizard")) return "wizard";
  if (path.startsWith("/bots/list") || path.startsWith("/list/bots")) return "list";
  if (path.startsWith("/bots/analytics") || path === "/analytics") return "analytics";
  return "dashboard";
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function BotsShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [location, navigate] = useLocation();
  const activeView = getActiveView(location);

  const handleNavigate = (key: BotView) => {
    const route = routeMap[key];
    if (route) navigate(route);
  };

  // BotsComingSoonPage handles dashboard/control-panel/wizard internally via route param
  let content: React.ReactNode;
  switch (activeView) {
    case "list":
      content = <BotListPage />;
      break;
    case "analytics":
      content = <Analytics />;
      break;
    default:
      // dashboard, control-panel, wizard — handled by BotsComingSoonPage internal routing
      content = <BotsDashboard />;
  }

  return (
    <>
      <BotsSidebar
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
