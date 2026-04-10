import { lazy, Suspense, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import KGIASidebar, { type KGIAView } from "./KGIASidebar";
import KGIAStatusBar from "./KGIAStatusBar";
import { trpc } from "@/lib/trpc";

// Lazy-loaded pages
const KGIAWorkbenchPage = lazy(() => import("@/pages/kgia/KGIAWorkbenchPage"));
const KGIASourcesPage = lazy(() => import("@/pages/kgia/KGIASourcesPage"));
const KGIABenchmarksPage = lazy(() => import("@/pages/kgia/KGIABenchmarksPage"));
const KGIAGovernancePage = lazy(() => import("@/pages/kgia/KGIAGovernancePage"));
const KGIAOversightPage = lazy(() => import("@/pages/kgia/KGIAOversightPage"));

function parseRoute(location: string): KGIAView {
  if (location.startsWith("/kgia/sources")) return "sources";
  if (location.startsWith("/kgia/benchmarks")) return "benchmarks";
  if (location.startsWith("/kgia/governance")) return "governance";
  if (location.startsWith("/kgia/oversight")) return "oversight";
  return "workbench";
}

const VIEW_TITLES: Record<KGIAView, string> = {
  workbench: "Knowledge Graph Workbench",
  sources: "Sources",
  benchmarks: "Benchmarks",
  governance: "Governance",
  oversight: "Oversight",
};

export default function KGIAShell() {
  const [location] = useLocation();
  const view = parseRoute(location);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Shell-level state shared across pages
  const [lastEnvelope, setLastEnvelope] = useState<any>(null);
  const [lastQueryPlan, setLastQueryPlan] = useState<any>(null);
  const [lastDurationMs, setLastDurationMs] = useState<number | undefined>();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [workspaceId] = useState(1);

  // Source count for status bar
  const sourcesQuery = trpc.modules.kgia.sources.list.useQuery(
    { workspaceId },
    { refetchInterval: 30000 }
  );
  const sourceCount = sourcesQuery.data?.length ?? 0;

  const handleRunComplete = useCallback((result: any) => {
    if (result?.envelope) {
      setLastEnvelope(result.envelope);
      setLastDurationMs(result.envelope.durationMs);
    }
  }, []);

  const renderContent = () => {
    switch (view) {
      case "workbench":
        return (
          <KGIAWorkbenchPage
            workspaceId={workspaceId}
            activeSessionId={activeSessionId}
            onSessionCreated={setActiveSessionId}
            onRunComplete={handleRunComplete}
            onQueryPlanReady={setLastQueryPlan}
          />
        );
      case "sources":
        return <KGIASourcesPage workspaceId={workspaceId} />;
      case "benchmarks":
        return <KGIABenchmarksPage workspaceId={workspaceId} />;
      case "governance":
        return <KGIAGovernancePage workspaceId={workspaceId} />;
      case "oversight":
        return (
          <KGIAOversightPage
            workspaceId={workspaceId}
            envelope={lastEnvelope}
            queryPlan={lastQueryPlan}
          />
        );
    }
  };

  const governanceVerdict = lastEnvelope?.governanceVerdict?.safe ? "allow" : lastEnvelope?.governanceVerdict ? "deny" : undefined;

  return (
    <div className="flex h-full w-full bg-background">
      {/* Sidebar */}
      <KGIASidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeView={view}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center px-4 h-12 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">{VIEW_TITLES[view]}</h2>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            {renderContent()}
          </Suspense>
        </div>

        {/* Status bar */}
        <KGIAStatusBar
          sourceCount={sourceCount}
          lastMode={lastEnvelope?.selectedMode}
          lastDurationMs={lastDurationMs}
          governanceVerdict={governanceVerdict}
          sessionTitle={activeSessionId ? `Session #${activeSessionId}` : undefined}
        />
      </div>
    </div>
  );
}
