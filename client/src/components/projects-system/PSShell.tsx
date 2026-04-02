/**
 * PS Shell — Simple IBM Shell (Fragment pattern)
 */
import { useState, useMemo, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PSSidebar, { type PSView } from "./PSSidebar";
import { PSIdeationChatWindow } from "./ideation/PSIdeationChatWindow";

const PSCatalogPage = lazy(() => import("@/pages/projects-system/PSCatalogPage"));
const PSIdeationPage = lazy(() => import("@/pages/projects-system/PSIdeationPage"));
const PSControlPanelShell = lazy(() =>
  import("@/components/projects-system/control-panel/PSControlPanelShell").then(m => ({ default: m.PSControlPanelShell }))
);
const PSWizardShell = lazy(() =>
  import("@/components/projects-system/wizard/PSWizardShell").then(m => ({ default: m.PSWizardShell }))
);
const PSListPage = lazy(() => import("@/pages/projects-system/PSListPage"));
const PSAICatalogPage = lazy(() => import("@/pages/projects-system/PSAICatalogPage"));

const routeMap: Record<PSView, string> = {
  catalog: "/ps/catalog",
  ideation: "/ps/ideation",
  "control-panel": "/ps/control-panel",
  wizard: "/ps/wizard",
  list: "/ps/list",
  "ai-catalog": "/ps/ai-catalog",
};

function getActiveView(path: string): PSView {
  if (path.startsWith("/ps/ideation")) return "ideation";
  if (path.startsWith("/ps/control-panel")) return "control-panel";
  if (path.startsWith("/ps/wizard")) return "wizard";
  if (path.startsWith("/ps/list")) return "list";
  if (path.startsWith("/ps/ai-catalog")) return "ai-catalog";
  return "catalog";
}

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function PSShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [location, navigate] = useLocation();
  const activeView = getActiveView(location);

  const handleNavigate = (key: PSView) => {
    const route = routeMap[key];
    if (route) navigate(route);
  };

  // PS Chat — available AI agents from catalog
  const { data: availableAgents } = trpc.catalogManage.available.useQuery(
    { entryType: "agent" },
  );

  const catalogImports = useMemo(() => {
    if (!availableAgents) return [];
    return availableAgents.map((e: any) => ({
      id: e.id,
      catalogEntryId: e.id,
      entryType: e.sourceType,
      name: e.displayName || e.name,
      description: e.description || "",
      category: e.category || "",
      tags: e.tags || [],
      config: e.metadata?.config || {},
      status: e.status || "active",
      importedAt: new Date(),
    }));
  }, [availableAgents]);

  // Control Panel and Wizard have their own shells (Fragment pattern)
  // → render inside a flex container (gives double-shell look: S1=PS nav, S2=inner nav)
  const isShellContent = activeView === "control-panel" || activeView === "wizard";

  let content: React.ReactNode;
  switch (activeView) {
    case "control-panel":
      content = <PSControlPanelShell />;
      break;
    case "wizard":
      content = <PSWizardShell />;
      break;
    case "ideation":
      content = <PSIdeationPage />;
      break;
    case "list":
      content = <PSListPage />;
      break;
    case "ai-catalog":
      content = <PSAICatalogPage />;
      break;
    default:
      content = <PSCatalogPage />;
  }

  return (
    <>
      <PSSidebar
        active={activeView}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      {isShellContent ? (
        <Suspense fallback={<Fallback />}>
          {content}
        </Suspense>
      ) : (
        <div className="flex-1 min-w-0 overflow-y-auto">
          <Suspense fallback={<Fallback />}>
            {content}
          </Suspense>
        </div>
      )}

      {/* PS Chat — floating FAB, visible across all PS pages */}
      <PSIdeationChatWindow catalogImports={catalogImports} />
    </>
  );
}
