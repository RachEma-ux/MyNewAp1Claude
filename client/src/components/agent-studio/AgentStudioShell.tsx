/**
 * AI Agent Studio — Main Shell (IBM-style standalone module)
 *
 * Layout zones:
 *   ┌──────────┬──────────────────────────────────┬──────────┐
 *   │          │  Top Action Bar                  │          │
 *   │          ├──────────────────────────────────┤          │
 *   │ Sidebar  │                                  │ Right    │
 *   │ (S1)     │  Center Workspace                │ Oversight│
 *   │          │                                  │ Drawer   │
 *   │          ├──────────────────────────────────┤          │
 *   │          │  Bottom Status Bar               │          │
 *   └──────────┴──────────────────────────────────┴──────────┘
 *
 * Routing model:
 *   /agent-studio                       → home (no agent context)
 *   /agent-studio/new                   → new agent page
 *   /agent-studio/templates             → home with templates filter
 *   /agent-studio/import                → home with import dialog
 *   /agent-studio/:id                   → redirects to /:id/overview
 *   /agent-studio/:id/<section>         → agent detail pages
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AgentStudioSidebar, { type AgentStudioView } from "./AgentStudioSidebar";
import AgentStudioTopBar from "./AgentStudioTopBar";
import AgentStudioOversightDrawer from "./AgentStudioOversightDrawer";
import AgentStudioStatusBar from "./AgentStudioStatusBar";

const AgentStudioHomePage = lazy(() => import("@/pages/agent-studio/AgentStudioHomePage"));
const AgentStudioNewPage = lazy(() => import("@/pages/agent-studio/AgentStudioNewPage"));
const AgentOverviewPage = lazy(() => import("@/pages/agent-studio/AgentOverviewPage"));
const AgentIdentityPage = lazy(() => import("@/pages/agent-studio/AgentIdentityPage"));
const AgentBehaviorPage = lazy(() => import("@/pages/agent-studio/AgentBehaviorPage"));
const AgentPromptsPage = lazy(() => import("@/pages/agent-studio/AgentPromptsPage"));
const AgentToolsPage = lazy(() => import("@/pages/agent-studio/AgentToolsPage"));
const AgentKnowledgePage = lazy(() => import("@/pages/agent-studio/AgentKnowledgePage"));
const AgentMemoryPage = lazy(() => import("@/pages/agent-studio/AgentMemoryPage"));
const AgentWorkflowsPage = lazy(() => import("@/pages/agent-studio/AgentWorkflowsPage"));
const AgentGovernancePage = lazy(() => import("@/pages/agent-studio/AgentGovernancePage"));
const AgentSimulationPage = lazy(() => import("@/pages/agent-studio/AgentSimulationPage"));
const AgentTestingPage = lazy(() => import("@/pages/agent-studio/AgentTestingPage"));
const AgentRunsPage = lazy(() => import("@/pages/agent-studio/AgentRunsPage"));
const AgentVersionsPage = lazy(() => import("@/pages/agent-studio/AgentVersionsPage"));
const AgentPublishPage = lazy(() => import("@/pages/agent-studio/AgentPublishPage"));

interface ParsedRoute {
  agentId: number | null;
  view: AgentStudioView;
  /** When view is "runs" and a specific run is selected via /runs/:runId */
  runId: number | null;
  /** When view is "versions" and the user is on /versions/compare */
  versionsSubview: "list" | "compare" | null;
  /** When view is "home" and the user requested templates or import landing */
  homeMode: "list" | "templates" | "import" | null;
  /**
   * True when the URL was bare `/agent-studio/:id` (no /section). The shell
   * uses this to push a redirect to /overview so the URL is always canonical
   * and shareable.
   */
  needsOverviewRedirect: boolean;
  /**
   * True when the URL had an `/agent-studio/:something/...` segment but
   * `:something` was not a valid numeric agent id. The shell renders a
   * not-found message instead of silently routing to home.
   */
  invalidAgentSegment: boolean;
}

const VALID_AGENT_VIEWS: AgentStudioView[] = [
  "overview",
  "identity",
  "behavior",
  "prompts",
  "tools",
  "knowledge",
  "memory",
  "workflows",
  "governance",
  "simulation",
  "testing",
  "runs",
  "versions",
  "publish",
];

function parseRoute(path: string): ParsedRoute {
  const empty: ParsedRoute = {
    agentId: null,
    view: "home",
    runId: null,
    versionsSubview: null,
    homeMode: null,
    needsOverviewRedirect: false,
    invalidAgentSegment: false,
  };

  // /agent-studio
  if (path === "/agent-studio" || path === "/agent-studio/") {
    return { ...empty, homeMode: "list" };
  }
  // Literal home-mode sub-routes (no agent context)
  if (path.startsWith("/agent-studio/new")) {
    return { ...empty, view: "new", homeMode: null };
  }
  if (path.startsWith("/agent-studio/templates")) {
    return { ...empty, homeMode: "templates" };
  }
  if (path.startsWith("/agent-studio/import")) {
    return { ...empty, homeMode: "import" };
  }

  // /agent-studio/:id[/<section>[/<extra>]]
  const m = path.match(/^\/agent-studio\/(\d+)(?:\/([a-z-]+))?(?:\/([a-zA-Z0-9-]+))?/);
  if (!m) {
    // Path doesn't match the numeric-id pattern but is under /agent-studio/.
    // Could be /agent-studio/abc — surface as "agent not found".
    if (/^\/agent-studio\/[^/]+/.test(path)) {
      return { ...empty, invalidAgentSegment: true };
    }
    return empty;
  }

  const id = parseInt(m[1], 10);
  const sectionRaw = m[2];
  const extra = m[3];
  // When section was missing from the URL, we render overview but flag the
  // redirect so the shell pushes /overview into the URL bar.
  const sectionFromUrl = sectionRaw ?? "overview";
  const section = VALID_AGENT_VIEWS.includes(sectionFromUrl as AgentStudioView)
    ? (sectionFromUrl as AgentStudioView)
    : "overview";
  const needsOverviewRedirect = sectionRaw === undefined;

  // /agent-studio/:id/runs/:runId
  if (section === "runs" && extra && /^\d+$/.test(extra)) {
    return {
      agentId: id,
      view: "runs",
      runId: parseInt(extra, 10),
      versionsSubview: null,
      homeMode: null,
      needsOverviewRedirect: false,
      invalidAgentSegment: false,
    };
  }

  // /agent-studio/:id/versions/compare
  if (section === "versions" && extra === "compare") {
    return {
      agentId: id,
      view: "versions",
      runId: null,
      versionsSubview: "compare",
      homeMode: null,
      needsOverviewRedirect: false,
      invalidAgentSegment: false,
    };
  }
  if (section === "versions") {
    return {
      agentId: id,
      view: "versions",
      runId: null,
      versionsSubview: "list",
      homeMode: null,
      needsOverviewRedirect: false,
      invalidAgentSegment: false,
    };
  }

  return {
    agentId: id,
    view: section,
    runId: null,
    versionsSubview: null,
    homeMode: null,
    needsOverviewRedirect,
    invalidAgentSegment: false,
  };
}

export default function AgentStudioShell() {
  const [location, navigate] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const parsed = useMemo(() => parseRoute(location), [location]);
  const {
    agentId,
    view,
    runId,
    versionsSubview,
    homeMode,
    needsOverviewRedirect,
    invalidAgentSegment,
  } = parsed;

  // Spec requirement: /agent-studio/:agentId redirects to /overview so the
  // URL is canonical and shareable. We render the overview page anyway, but
  // the URL bar gets the explicit /overview suffix on next tick.
  useEffect(() => {
    if (needsOverviewRedirect && agentId !== null) {
      navigate(`/agent-studio/${agentId}/overview`, { replace: true });
    }
  }, [needsOverviewRedirect, agentId, navigate]);

  // Shell summary query (only when in agent context)
  const shellQuery = trpc.agentStudio.shell.getShellSummary.useQuery(
    { agentId: agentId ?? 0 },
    { enabled: agentId !== null }
  );

  const shell = shellQuery.data;
  const agentContext = agentId !== null;

  // Mutations for top-bar actions
  const createVersionMut = trpc.agentStudio.versions.create.useMutation({
    onSuccess: (v) => toast.success(`Version v${(v as any).versionNumber} created`),
    onError: (e) => toast.error(e.message),
  });
  const runSimMut = trpc.agentStudio.simulation.run.useMutation({
    onSuccess: () => {
      toast.success("Simulation completed");
      shellQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  // Publish is handled by navigating to the Publish page (which collects
  // version + environment and runs the mutation there). The shell does not
  // call publishVersion directly to avoid sending invalid versionId.

  const handleNavigate = (key: AgentStudioView) => {
    if (!agentContext) {
      // Home-context nav
      if (key === "home") navigate("/agent-studio");
      else if (key === "new") navigate("/agent-studio/new");
      return;
    }
    navigate(`/agent-studio/${agentId}/${key}`);
  };

  const renderContent = () => {
    // Invalid agent segment in URL (e.g. /agent-studio/abc) — show clear
    // not-found state instead of silently rendering home.
    if (invalidAgentSegment) {
      return (
        <div className="p-12 text-center space-y-2">
          <h2 className="text-base font-semibold">Agent not found</h2>
          <p className="text-xs text-muted-foreground">
            The URL doesn't reference a valid agent id.
          </p>
          <button
            onClick={() => navigate("/agent-studio")}
            className="text-xs underline text-primary"
          >
            ← Back to all agents
          </button>
        </div>
      );
    }
    // Shell summary query returned NOT_FOUND (agent id is numeric but the
    // row doesn't exist).
    if (agentContext && shellQuery.error) {
      return (
        <div className="p-12 text-center space-y-2">
          <h2 className="text-base font-semibold">Agent not found</h2>
          <p className="text-xs text-muted-foreground">{shellQuery.error.message}</p>
          <button
            onClick={() => navigate("/agent-studio")}
            className="text-xs underline text-primary"
          >
            ← Back to all agents
          </button>
        </div>
      );
    }
    if (!agentContext) {
      switch (view) {
        case "new":
          return <AgentStudioNewPage />;
        default:
          return <AgentStudioHomePage homeMode={homeMode ?? "list"} />;
      }
    }
    switch (view) {
      case "overview":
        return <AgentOverviewPage agentId={agentId!} />;
      case "identity":
        return <AgentIdentityPage agentId={agentId!} />;
      case "behavior":
        return <AgentBehaviorPage agentId={agentId!} />;
      case "prompts":
        return <AgentPromptsPage agentId={agentId!} />;
      case "tools":
        return <AgentToolsPage agentId={agentId!} />;
      case "knowledge":
        return <AgentKnowledgePage agentId={agentId!} />;
      case "memory":
        return <AgentMemoryPage agentId={agentId!} />;
      case "workflows":
        return <AgentWorkflowsPage agentId={agentId!} />;
      case "governance":
        return <AgentGovernancePage agentId={agentId!} />;
      case "simulation":
        return <AgentSimulationPage agentId={agentId!} />;
      case "testing":
        return <AgentTestingPage agentId={agentId!} />;
      case "runs":
        return <AgentRunsPage agentId={agentId!} runId={runId} />;
      case "versions":
        return (
          <AgentVersionsPage
            agentId={agentId!}
            initialMode={versionsSubview ?? "list"}
          />
        );
      case "publish":
        return <AgentPublishPage agentId={agentId!} />;
      default:
        return <AgentOverviewPage agentId={agentId!} />;
    }
  };

  /**
   * Top-bar Publish — navigates to the Publish page rather than firing the
   * mutation directly. Publishing requires picking a target version and
   * environment, which only the Publish page can collect safely.
   */
  const handlePublish = () => {
    if (!agentId) return;
    navigate(`/agent-studio/${agentId}/publish`);
  };

  return (
    <>
      {/* S1 Sidebar */}
      <AgentStudioSidebar
        active={view}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        agentContext={agentContext}
        agentName={shell?.agent?.name}
      />

      {/* Center column: top bar + content + status bar */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        {agentContext && shell?.agent && (
          <AgentStudioTopBar
            agentName={shell.agent.name}
            agentClass={shell.agent.agentClass ?? "assistant"}
            lifecycleState={shell.agent.lifecycleState}
            environment={shell.agent.environment ?? "draft"}
            saving={runSimMut.isPending || createVersionMut.isPending}
            onSaveDraft={() => {
              // Sections auto-save on form submit; this button forces a
              // shell-summary refresh so the user gets visible confirmation
              // that the displayed state is current.
              shellQuery.refetch();
              toast.success("Refreshed");
            }}
            onRunSimulation={() =>
              runSimMut.mutate({ agentId, toggles: { mockedTools: true, sandboxMemory: true, strictPolicy: true } })
            }
            onRunTest={() => navigate(`/agent-studio/${agentId}/testing`)}
            onCompareVersion={() => navigate(`/agent-studio/${agentId}/versions/compare`)}
            onCreateVersion={() => {
              const label = prompt("Version label?");
              if (label) createVersionMut.mutate({ agentId, label });
            }}
            onPublish={handlePublish}
          />
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            }
          >
            {renderContent()}
          </Suspense>
        </div>

        {agentContext && shell?.agent && (
          <AgentStudioStatusBar
            lastSaved={shell.draft?.updatedAt}
            validationState={
              shell.readiness?.blockers.length
                ? "error"
                : shell.readiness?.warnings.length
                  ? "warning"
                  : "ok"
            }
            simulationState={shell.latestSimulation?.status ?? "—"}
            version={`draft (#${shell.draft?.id ?? "—"})`}
            environment={shell.agent.environment ?? "draft"}
            policyState={(shell.governance?.verdict ?? "pass") as "pass" | "warning" | "blocked"}
            unsavedChanges={false}
          />
        )}
      </div>

      {/* Right Oversight Drawer (only in agent context) */}
      {agentContext && (
        <AgentStudioOversightDrawer
          readiness={shell?.readiness}
          governance={shell?.governance}
          latestSimulation={shell?.latestSimulation}
          latestTest={shell?.latestTest}
        />
      )}
    </>
  );
}
