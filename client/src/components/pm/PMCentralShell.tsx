/**
 * PM Central Shell — Simple IBM Shell (Fragment pattern)
 */
import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import PMCentralSidebar, { type PMCView } from "./PMCentralSidebar";

const DashboardPanel = lazy(() => import("@/pages/pm-central/DashboardPanel"));
const PlansPanel = lazy(() => import("@/pages/pm-central/PlansPanel"));
const ExecutionPanel = lazy(() => import("@/pages/pm-central/ExecutionPanel"));
const ChangesPanel = lazy(() => import("@/pages/pm-central/ChangesPanel"));
const RisksPanel = lazy(() => import("@/pages/pm-central/RisksPanel"));
const ReportsPanel = lazy(() => import("@/pages/pm-central/ReportsPanel"));
const ParticipantsPanel = lazy(() => import("@/pages/pm-central/ParticipantsPanel"));
const TemplatesPanel = lazy(() => import("@/pages/pm-central/TemplatesPanel"));
const MethodesPage = lazy(() => import("@/pages/pm-central/MethodesPage"));
const AgentEnginePanel = lazy(() => import("@/pages/pm-central/AgentEnginePanel"));
const IdeaBuilderWizard = lazy(() => import("@/pages/pm-central/IdeaBuilderWizard"));
const InboxPage = lazy(() => import("@/pages/pm-central/InboxPage"));
const PMShellPanel = lazy(() => import("@/pages/pm-central/PMShellPanel"));
const ShellNewPage = lazy(() => import("@/pages/pm-central/ShellNewPage"));
const ShellClonePage = lazy(() => import("@/pages/pm-central/ShellClonePage"));

const routeMap: Record<PMCView, string> = {
  dashboard: "/pm-central/dashboard",
  projects: "/pm-central/projects",
  plans: "/pm-central/plans",
  execution: "/pm-central/execution",
  changes: "/pm-central/changes",
  risks: "/pm-central/risks",
  reports: "/pm-central/reports",
  collaboration: "/pm-central/collaboration",
  methodes: "/pm-central/methodes",
  templates: "/pm-central/templates",
  "agent-engine": "/pm-central/agent-engine",
  "idea-builder": "/pm-central/idea-builder",
  inbox: "/pm-central/inbox",
  shell: "/pm-central/shell",
};

function getActiveView(path: string): PMCView {
  if (path.startsWith("/pm-central/projects")) return "projects";
  if (path.startsWith("/pm-central/plans")) return "plans";
  if (path.startsWith("/pm-central/execution")) return "execution";
  if (path.startsWith("/pm-central/changes")) return "changes";
  if (path.startsWith("/pm-central/risks")) return "risks";
  if (path.startsWith("/pm-central/reports")) return "reports";
  if (path.startsWith("/pm-central/collaboration")) return "collaboration";
  if (path.startsWith("/pm-central/methodes")) return "methodes";
  if (path.startsWith("/pm-central/templates")) return "templates";
  if (path.startsWith("/pm-central/agent-engine")) return "agent-engine";
  if (path.startsWith("/pm-central/idea-builder")) return "idea-builder";
  if (path.startsWith("/pm-central/inbox")) return "inbox";
  if (path.startsWith("/pm-central/shell")) return "shell";
  return "dashboard";
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function PMCentralShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [location, navigate] = useLocation();
  const activeView = getActiveView(location);

  const handleNavigate = (key: PMCView) => {
    const route = routeMap[key];
    if (route) navigate(route);
  };

  let content: React.ReactNode;
  switch (activeView) {
    case "projects":
      content = <DashboardPanel />;
      break;
    case "plans":
      content = <PlansPanel />;
      break;
    case "execution":
      content = <ExecutionPanel />;
      break;
    case "changes":
      content = <ChangesPanel />;
      break;
    case "risks":
      content = <RisksPanel />;
      break;
    case "reports":
      content = <ReportsPanel />;
      break;
    case "collaboration":
      content = <ParticipantsPanel />;
      break;
    case "methodes":
      content = <MethodesPage />;
      break;
    case "templates":
      content = <TemplatesPanel />;
      break;
    case "agent-engine":
      content = <AgentEnginePanel />;
      break;
    case "idea-builder":
      content = <IdeaBuilderWizard />;
      break;
    case "inbox":
      content = <InboxPage />;
      break;
    case "shell":
      if (location.startsWith("/pm-central/shell/new")) {
        content = <ShellNewPage />;
      } else if (location.startsWith("/pm-central/shell/clone/")) {
        content = <ShellClonePage />;
      } else {
        content = <PMShellPanel />;
      }
      break;
    default:
      content = <DashboardPanel />;
  }

  return (
    <>
      <PMCentralSidebar
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
