import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import OpenRouterSidebar, { type OpenRouterView } from "./OpenRouterSidebar";
import OpenRouterStatusBar from "./OpenRouterStatusBar";
import { trpc } from "@/lib/trpc";

const OpenRouterHomePage = lazy(() => import("@/pages/openrouter/OpenRouterHomePage"));
const OpenRouterConnectPage = lazy(() => import("@/pages/openrouter/OpenRouterConnectPage"));
const OpenRouterModelsPage = lazy(() => import("@/pages/openrouter/OpenRouterModelsPage"));
const OpenRouterRoutingPage = lazy(() => import("@/pages/openrouter/OpenRouterRoutingPage"));
const OpenRouterGuardrailsPage = lazy(() => import("@/pages/openrouter/OpenRouterGuardrailsPage"));
const OpenRouterPlaygroundPage = lazy(() => import("@/pages/openrouter/OpenRouterPlaygroundPage"));
const OpenRouterUsagePage = lazy(() => import("@/pages/openrouter/OpenRouterUsagePage"));
const OpenRouterHealthPage = lazy(() => import("@/pages/openrouter/OpenRouterHealthPage"));
const OpenRouterActivityPage = lazy(() => import("@/pages/openrouter/OpenRouterActivityPage"));

function parseRoute(location: string): OpenRouterView {
  if (location.startsWith("/openrouter/connect")) return "connect";
  if (location.startsWith("/openrouter/models")) return "models";
  if (location.startsWith("/openrouter/routing")) return "routing";
  if (location.startsWith("/openrouter/guardrails")) return "guardrails";
  if (location.startsWith("/openrouter/playground")) return "playground";
  if (location.startsWith("/openrouter/usage")) return "usage";
  if (location.startsWith("/openrouter/health")) return "health";
  if (location.startsWith("/openrouter/activity")) return "activity";
  return "home";
}

const VIEW_TITLES: Record<OpenRouterView, string> = {
  home: "OpenRouter Overview",
  connect: "Connect",
  models: "Model Catalog",
  routing: "Routing Profiles",
  guardrails: "Guardrails",
  playground: "Playground",
  usage: "Usage",
  health: "Health",
  activity: "Activity",
};

export default function OpenRouterShell() {
  const [location] = useLocation();
  const view = parseRoute(location);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const configQuery = trpc.openRouter.config.get.useQuery(undefined, { refetchInterval: 30000 });
  const modelsQuery = trpc.openRouter.models.list.useQuery({ limit: 1 }, { enabled: !!configQuery.data?.configured });

  const config = configQuery.data;

  const renderContent = () => {
    switch (view) {
      case "home": return <OpenRouterHomePage />;
      case "connect": return <OpenRouterConnectPage />;
      case "models": return <OpenRouterModelsPage />;
      case "routing": return <OpenRouterRoutingPage />;
      case "guardrails": return <OpenRouterGuardrailsPage />;
      case "playground": return <OpenRouterPlaygroundPage />;
      case "usage": return <OpenRouterUsagePage />;
      case "health": return <OpenRouterHealthPage />;
      case "activity": return <OpenRouterActivityPage />;
    }
  };

  return (
    <div className="flex h-full w-full bg-background">
      <OpenRouterSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} activeView={view} />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center px-4 h-12 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">{VIEW_TITLES[view]}</h2>
        </div>
        <div className="flex-1 overflow-auto">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            {renderContent()}
          </Suspense>
        </div>
        <OpenRouterStatusBar
          connected={config?.configured ?? false}
          healthStatus={config?.healthStatus ?? "unconfigured"}
          modelCount={modelsQuery.data?.total ?? 0}
          lastSync={config?.lastSyncAt ?? null}
        />
      </div>
    </div>
  );
}
